import { supabase } from './services/supabase'
import { getTemplate, TaskType, buildPromptUpsell, parseClaudeResponse, wrapEmailHtml } from './services/templates'
import { callClaude } from './services/claude'
import { sendEmail } from './services/resend'
import { decrypt } from './services/encryption'
import { insertTrackingRow, injectTracking } from './utils/tracking'
import { getEmailTemplate } from './utils/getEmailTemplate'

async function recoverStuckTasks(): Promise<void> {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('pending_tasks')
    .update({ status: 'pending' })
    .eq('status', 'processing')
    .lt('created_at', cutoff)
    .select('id')
  if (error) {
    console.error('[cron] recoverStuckTasks échoué:', error.message)
    return
  }
  if (data && data.length > 0)
    console.log(`[cron] ${data.length} tâche(s) bloquée(s) en processing → remises en pending`)
}

async function createTaskForJob(
  jobId: string, clientId: string, taskType: string,
  contextJson: Record<string, any>, promptTemplate: string, status: string
): Promise<string | null> {
  const { data, error } = await supabase.rpc('create_task_for_job', {
    p_job_id: jobId,
    p_client_id: clientId,
    p_task_type: taskType,
    p_context_json: contextJson,
    p_prompt_template: promptTemplate,
    p_status: status,
  })
  if (error) throw new Error(error.message)
  return data as string | null
}

export async function runScheduledJobs(): Promise<void> {
  await recoverStuckTasks()

  const { data: jobs } = await supabase
    .from('scheduled_jobs')
    .select('*')
    .lte('scheduled_for', new Date().toISOString())
    .eq('status', 'pending')

  if (!jobs || jobs.length === 0) return
  console.log(`[cron] ${jobs.length} job(s) à traiter`)

  const { data: pausedRows } = await supabase
    .from('clients')
    .select('id, paused_until')
    .not('paused_until', 'is', null)
    .gt('paused_until', new Date().toISOString())

  const pausedMap = new Map<string, string>(
    (pausedRows ?? []).map((c: any) => [c.id as string, c.paused_until as string])
  )

  for (const job of jobs) {
    const jobPausedUntil = pausedMap.get(job.client_id)
    if (jobPausedUntil) {
      await supabase.from('scheduled_jobs').update({ status: 'done' }).eq('id', job.id)
      await supabase.from('activity_logs').insert({
        client_id: job.client_id,
        action_type: 'job_skipped',
        payload_json: {
          job_type: job.job_type,
          reason: `Envoi ignoré — compte en pause jusqu'au ${new Date(jobPausedUntil).toLocaleDateString('fr-FR')}`,
        },
        status: 'skipped',
      })
      continue
    }
    try {
      if (job.job_type === 'upsell') {
        await handleUpsellJob(job)
      } else if (job.job_type === 'checkout_abandon') {
        await handleCheckoutAbandonJob(job)
      } else {
        await handleStandardJob(job)
      }
    } catch (err: any) {
      console.error(`[cron] job ${job.id} échoué:`, err.message)
      await supabase.from('scheduled_jobs').update({ status: 'failed' }).eq('id', job.id)
      await supabase.from('activity_logs').insert({
        client_id: job.client_id ?? null,
        action_type: 'cron_error',
        payload_json: { job_id: job.id, job_type: job.job_type, error: err.message },
        status: 'failed',
      })
    }
  }
}

async function handleStandardJob(job: any): Promise<void> {
  const ctx = job.context_json as Record<string, any>
  const task_type = job.job_type as TaskType

  if (typeof job.job_type === 'string' && (job.job_type.startsWith('onboarding_') || job.job_type.startsWith('failed_payment_j'))) {
    const { data: configRow } = await supabase
      .from('client_configs')
      .select('encrypted_value')
      .eq('client_id', job.client_id)
      .eq('config_type', `template_${job.job_type}`)
      .single()
    if (configRow?.encrypted_value) {
      try {
        const config = JSON.parse(decrypt(configRow.encrypted_value))
        if (config.active === false) {
          await supabase.from('scheduled_jobs').update({ status: 'done' }).eq('id', job.id)
          console.log(`[cron] job ${job.id} (${task_type}) ignoré — template inactif`)
          return
        }
      } catch { /* JSON invalide, on continue */ }
    }
  }

  const prompt_template = getTemplate(task_type, ctx).prompt
  await createTaskForJob(job.id, job.client_id, task_type, ctx, prompt_template, 'pending')
  console.log(`[cron] job ${job.id} (${task_type}) → pending_task créée (atomique)`)
}

async function handleUpsellJob(job: any): Promise<void> {
  const { data: configs } = await supabase
    .from('client_configs')
    .select('config_type, encrypted_value')
    .eq('client_id', job.client_id)

  const configMap: Record<string, string> = {}
  for (const c of configs ?? []) {
    try { configMap[c.config_type] = decrypt(c.encrypted_value) } catch { /* skip */ }
  }

  if (configMap['upsell_enabled'] !== 'true') {
    await supabase.from('scheduled_jobs').update({ status: 'done' }).eq('id', job.id)
    console.log(`[cron] job ${job.id} (upsell) ignoré — upsell_enabled=false`)
    return
  }

  const ctx: Record<string, any> = {
    ...(job.context_json as Record<string, any>),
    upsell_product_name: configMap['upsell_product_name'] ?? '',
    upsell_url: configMap['upsell_url'] ?? '',
    upsell_price: configMap['upsell_price'] ?? '',
  }

  const { data: client } = await supabase
    .from('clients')
    .select('email, auto_mode')
    .eq('id', job.client_id)
    .single()

  const isAuto = (client as any)?.auto_mode ?? true
  const prompt_template = buildPromptUpsell(ctx)

  if (!isAuto) {
    await createTaskForJob(job.id, job.client_id, 'upsell', ctx, prompt_template, 'pending')
    console.log(`[cron] job ${job.id} (upsell) → pending_task créée (mode manuel, atomique)`)
    return
  }

  // Mode auto : RPC atomique insert processing + job done, puis email
  const taskId = await createTaskForJob(job.id, job.client_id, 'upsell', ctx, prompt_template, 'processing')

  try {
    if (!ctx.customer_email) throw new Error('customer_email manquant')
    const aiResponse = await callClaude(prompt_template, 'claude-sonnet-4-6')
    const { subject, body_html } = parseClaudeResponse(aiResponse)
    const html = wrapEmailHtml(body_html, ctx.sender_name ?? 'Formateur')
    const trackingToken = await insertTrackingRow({
      clientId: job.client_id,
      studentEmail: ctx.customer_email,
      configType: 'upsell',
    })
    await sendEmail({
      to: ctx.customer_email,
      subject,
      html: injectTracking(html, trackingToken, process.env.BACKEND_URL!),
      sender_name: ctx.sender_name ?? 'Formateur',
      reply_to: (client as any)?.email,
    })
    await supabase
      .from('pending_tasks')
      .update({ status: 'sent', ai_response: aiResponse, processed_at: new Date().toISOString() })
      .eq('id', taskId)
    await supabase.from('activity_logs').insert({
      client_id: job.client_id,
      action_type: 'upsell_email',
      payload_json: { subject, to: ctx.customer_email, product: ctx.upsell_product_name, tracking_id: trackingToken },
      status: 'sent',
    })
    console.log(`[cron] job ${job.id} (upsell) → email envoyé à ${ctx.customer_email}`)
  } catch (err: any) {
    if (taskId) {
      await supabase.from('pending_tasks').update({ status: 'failed', ai_response: err.message }).eq('id', taskId)
    }
    await supabase.from('activity_logs').insert({
      client_id: job.client_id,
      action_type: 'upsell_email',
      payload_json: { error: err.message, to: ctx.customer_email },
      status: 'failed',
    })
    throw err
  }
}

async function handleCheckoutAbandonJob(job: any): Promise<void> {
  const ctx = job.context_json as Record<string, any>
  const customerEmail = ctx?.customer_email as string | undefined
  const markDone = () => supabase.from('scheduled_jobs').update({ status: 'done' }).eq('id', job.id)

  if (!customerEmail) { await markDone(); return }

  // Blacklist check
  const { count: isBlacklisted } = await supabase
    .from('client_blacklist')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', job.client_id)
    .eq('email', customerEmail.toLowerCase())
  if (isBlacklisted && isBlacklisted > 0) { await markDone(); return }

  // Template must exist in client_configs (no default fallback — spec: "absent → ne pas envoyer")
  const { data: configRow } = await supabase
    .from('client_configs')
    .select('encrypted_value')
    .eq('client_id', job.client_id)
    .eq('config_type', 'template_checkout_abandon')
    .single()
  if (!configRow?.encrypted_value) { await markDone(); return }

  let parsed: { subject?: string; body?: string; active?: boolean } | null = null
  try { parsed = JSON.parse(decrypt(configRow.encrypted_value)) } catch {}
  if (!parsed || parsed.active === false || !parsed.subject || !parsed.body) { await markDone(); return }

  const { data: senderRow } = await supabase
    .from('client_configs')
    .select('encrypted_value')
    .eq('client_id', job.client_id)
    .eq('config_type', 'sender_name')
    .single()
  const senderName = senderRow?.encrypted_value
    ? (() => { try { return decrypt(senderRow.encrypted_value) } catch { return 'Formateur' } })()
    : 'Formateur'

  const vars: Record<string, string> = {
    nom: ctx?.customer_name ?? '',
    prenom: (ctx?.customer_name ?? '').split(' ')[0],
    email: customerEmail,
    nom_formation: ctx?.product_name ?? '',
    lien_checkout: ctx?.checkout_url ?? '',
  }
  const injectVars = (text: string) =>
    text.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`)

  const subject = injectVars(parsed.subject)
  const body = injectVars(parsed.body)
  const html = wrapEmailHtml(body.replace(/\n/g, '<br>'), senderName)
  const trackingToken = await insertTrackingRow({
    clientId: job.client_id,
    studentEmail: customerEmail,
    configType: 'template_checkout_abandon',
  })

  try {
    await sendEmail({ to: customerEmail, subject, html: injectTracking(html, trackingToken, process.env.BACKEND_URL!), sender_name: senderName })
    await markDone()
    await supabase.from('activity_logs').insert({
      client_id: job.client_id,
      action_type: 'checkout_abandon_sent',
      payload_json: { to: customerEmail, subject, tracking_id: trackingToken },
      status: 'sent',
    })
    console.log(`[cron] checkout_abandon → ${customerEmail}`)
  } catch (err: any) {
    await supabase.from('scheduled_jobs').update({ status: 'failed' }).eq('id', job.id)
    await supabase.from('activity_logs').insert({
      client_id: job.client_id,
      action_type: 'checkout_abandon_sent',
      payload_json: { error: err.message, to: customerEmail },
      status: 'failed',
    })
  }
}

export async function runCustomAutomations(): Promise<void> {
  const now = new Date()

  const { data: automations } = await supabase
    .from('custom_automations')
    .select('*')
    .eq('active', true)
    .in('trigger_type', ['delay_after_purchase', 'specific_date'])

  if (!automations || automations.length === 0) return
  console.log(`[cron:custom] ${automations.length} automation(s) à vérifier`)

  const clientIds = [...new Set(automations.map((a: any) => a.client_id as string))]

  const [clientsResult, senderConfigsResult, firedLogsResult] = await Promise.all([
    supabase.from('clients').select('id, email, name, created_at, paused_until').in('id', clientIds),
    supabase.from('client_configs')
      .select('client_id, encrypted_value')
      .eq('config_type', 'sender_name')
      .in('client_id', clientIds),
    supabase.from('activity_logs')
      .select('payload_json')
      .in('client_id', clientIds)
      .eq('action_type', 'custom_automation')
      .eq('status', 'sent'),
  ])

  const clientMap = new Map((clientsResult.data ?? []).map((c: any) => [c.id as string, c]))
  const senderMap = new Map<string, string>()
  for (const cfg of senderConfigsResult.data ?? []) {
    try { senderMap.set(cfg.client_id, decrypt(cfg.encrypted_value)) } catch { /* keep default */ }
  }
  const pausedAutomationMap = new Map<string, string>()
  for (const c of clientsResult.data ?? []) {
    if ((c as any).paused_until && new Date() < new Date((c as any).paused_until)) {
      pausedAutomationMap.set(c.id, (c as any).paused_until)
    }
  }
  const firedIds = new Set(
    (firedLogsResult.data ?? []).map((l: any) => (l.payload_json as any)?.automation_id).filter(Boolean)
  )

  for (const automation of automations) {
    const client = clientMap.get(automation.client_id)
    if (!client) continue

    const autoPausedUntil = pausedAutomationMap.get(automation.client_id)
    if (autoPausedUntil) {
      await supabase.from('activity_logs').insert({
        client_id: automation.client_id,
        action_type: 'automation_skipped',
        payload_json: {
          automation_id: automation.id,
          reason: `Envoi ignoré — compte en pause jusqu'au ${new Date(autoPausedUntil).toLocaleDateString('fr-FR')}`,
        },
        status: 'skipped',
      })
      continue
    }

    let shouldFire = false
    if (automation.trigger_type === 'specific_date') {
      shouldFire = automation.trigger_date != null && new Date(automation.trigger_date) <= now
    } else if (automation.trigger_type === 'delay_after_purchase') {
      const fireAt = new Date(client.created_at)
      fireAt.setDate(fireAt.getDate() + (automation.trigger_delay_days ?? 0))
      shouldFire = fireAt <= now
    }

    if (!shouldFire || firedIds.has(automation.id)) continue

    try {
      const senderName = senderMap.get(automation.client_id) ?? client.name
      const html = wrapEmailHtml(automation.body.replace(/\n/g, '<br>'), senderName)
      const trackingToken = await insertTrackingRow({
        clientId: automation.client_id,
        studentEmail: client.email,
        configType: 'custom_automation',
        automationId: automation.id,
      })
      await sendEmail({ to: client.email, subject: automation.subject, html: injectTracking(html, trackingToken, process.env.BACKEND_URL!), sender_name: senderName })

      await supabase.from('activity_logs').insert({
        client_id: automation.client_id,
        action_type: 'custom_automation',
        payload_json: { automation_id: automation.id, name: automation.name, to: client.email, subject: automation.subject, tracking_id: trackingToken },
        status: 'sent',
      })

      if (automation.trigger_type === 'specific_date') {
        await supabase.from('custom_automations').update({ active: false }).eq('id', automation.id)
      }

      console.log(`[cron:custom] "${automation.name}" → email envoyé à ${client.email}`)
    } catch (err: any) {
      console.error(`[cron:custom] automation ${automation.id} échoué:`, err.message)
      await supabase.from('activity_logs').insert({
        client_id: automation.client_id,
        action_type: 'custom_automation',
        payload_json: { automation_id: automation.id, name: automation.name, error: err.message },
        status: 'failed',
      })
      await supabase.from('pending_tasks').insert({
        client_id: automation.client_id,
        task_type: 'custom_automation',
        context_json: {
          automation_id: automation.id,
          automation_name: automation.name,
          customer_email: client.email,
          subject: automation.subject,
        },
        ai_response: automation.body,
        status: 'failed',
      })
    }
  }
}

export async function sendWeeklyReport(): Promise<void> {
  const now = new Date()
  if (now.getUTCDay() !== 1 || now.getUTCHours() !== 8) return

  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: clients } = await supabase.from('clients').select('id, name, email, paused_until')
  if (!clients || clients.length === 0) return

  const TYPE_LABELS: Record<string, string> = {
    failed_payment_email: 'Relance impayé',
    onboarding_j0_email: 'Onboarding J0',
    onboarding_j3_email: 'Onboarding J3',
    onboarding_j7_email: 'Onboarding J7',
    upsell_email: 'Upsell',
    support_auto_acces: 'Support accès',
    support_auto_remboursement: 'Support remboursement',
    support_auto_technique: 'Support technique',
  }

  for (const client of clients) {
    if ((client as any).paused_until && new Date() < new Date((client as any).paused_until)) {
      console.log(`[cron] rapport hebdo ignoré pour ${client.name} — compte en pause`)
      continue
    }
    const { data: logs } = await supabase
      .from('activity_logs')
      .select('action_type')
      .eq('client_id', client.id)
      .eq('status', 'sent')
      .gte('created_at', weekAgo)

    if (!logs || logs.length === 0) continue

    const counts: Record<string, number> = {}
    for (const log of logs) counts[log.action_type] = (counts[log.action_type] ?? 0) + 1

    const lines = Object.entries(counts)
      .map(([type, count]) => `- ${TYPE_LABELS[type] ?? type} : ${count}`)
      .join('\n')

    const subject = `Rapport hebdomadaire — ${client.name}`
    const text = `Bonjour,\n\nVoici les emails envoyés cette semaine pour ${client.name} :\n\n${lines}\n\nTotal : ${logs.length} email(s)\n\nCordialement,\nAutomatePro`

    try {
      await sendEmail({
        to: client.email,
        subject,
        html: `<pre style="font-family:sans-serif;white-space:pre-wrap">${text}</pre>`,
        sender_name: 'AutomatePro',
      })
      console.log(`[cron] rapport hebdo → ${client.email}`)
    } catch (err: any) {
      console.error(`[cron] rapport hebdo échoué (${client.name}):`, err.message)
    }
  }
}

export async function runTestimonialEmails(): Promise<void> {
  // Time gate: only execute at 08:xx UTC to avoid duplicate sends within a day
  if (new Date().getUTCHours() !== 8) return

  const { data: configs } = await supabase
    .from('client_configs')
    .select('client_id, config_type, encrypted_value')
    .in('config_type', ['testimonial_url', 'template_testimonial_j30', 'template_testimonial_j60'])

  const clientConfigMap = new Map<string, Record<string, string>>()
  for (const c of configs ?? []) {
    try {
      const val = decrypt(c.encrypted_value)
      if (!clientConfigMap.has(c.client_id)) clientConfigMap.set(c.client_id, {})
      clientConfigMap.get(c.client_id)![c.config_type] = val
    } catch {}
  }

  for (const [clientId, configMap] of clientConfigMap) {
    const testimonialUrl = configMap['testimonial_url']
    if (!testimonialUrl) continue

    const { data: clientRow } = await supabase.from('clients').select('paused_until').eq('id', clientId).single()
    if (clientRow?.paused_until && new Date() < new Date(clientRow.paused_until)) continue

    const { data: senderRow } = await supabase
      .from('client_configs').select('encrypted_value')
      .eq('client_id', clientId).eq('config_type', 'sender_name').single()
    const senderName = senderRow?.encrypted_value
      ? (() => { try { return decrypt(senderRow.encrypted_value) } catch { return 'Formateur' } })()
      : 'Formateur'

    for (const milestone of ['j30', 'j60'] as const) {
      const configType = `template_testimonial_${milestone}` as const
      const templateRaw = configMap[configType]
      if (templateRaw) {
        try { if (JSON.parse(templateRaw).active === false) continue } catch {}
      }

      const days = milestone === 'j30' ? 30 : 60
      const fromTs = new Date(Date.now() - (days + 1) * 24 * 60 * 60 * 1000).toISOString()
      const toTs = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

      const { data: windowTasks } = await supabase
        .from('pending_tasks')
        .select('context_json, created_at')
        .eq('client_id', clientId)
        .gte('created_at', fromTs)
        .lte('created_at', toTs)

      const emailsInWindow = [
        ...new Set(
          (windowTasks ?? [])
            .map((t: any) => (t.context_json as any)?.customer_email as string | undefined)
            .filter(Boolean) as string[]
        ),
      ]

      for (const studentEmail of emailsInWindow) {
        // Skip if already sent for this milestone
        const { count: alreadySent } = await supabase
          .from('activity_logs')
          .select('*', { count: 'exact', head: true })
          .eq('client_id', clientId)
          .eq('action_type', `testimonial_${milestone}_sent`)
          .contains('payload_json', { student_email: studentEmail })
        if (alreadySent && alreadySent > 0) continue

        // Get student context
        const { data: latestTaskRow } = await supabase
          .from('pending_tasks')
          .select('context_json')
          .eq('client_id', clientId)
          .contains('context_json', { customer_email: studentEmail })
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
        const ctx = (latestTaskRow?.context_json as Record<string, any>) ?? {}

        try {
          const tpl = await getEmailTemplate(clientId, configType, {
            nom: ctx?.customer_name ?? ctx?.student_name ?? '',
            prenom: ctx?.student_name ?? '',
            nom_formation: ctx?.product_name ?? '',
            lien_temoignage: testimonialUrl,
          })
          const html = wrapEmailHtml(tpl.body.replace(/\n/g, '<br>'), senderName)
          const trackingToken = await insertTrackingRow({ clientId, studentEmail, configType })
          await sendEmail({
            to: studentEmail,
            subject: tpl.subject,
            html: injectTracking(html, trackingToken, process.env.BACKEND_URL!),
            sender_name: senderName,
          })
          await supabase.from('activity_logs').insert({
            client_id: clientId,
            action_type: `testimonial_${milestone}_sent`,
            payload_json: { student_email: studentEmail, nom_formation: ctx?.product_name ?? '', tracking_id: trackingToken },
            status: 'sent',
          })
          console.log(`[cron:testimonial] ${milestone} → ${studentEmail}`)
        } catch (err: any) {
          console.error(`[cron:testimonial] ${milestone} échoué pour ${studentEmail}:`, err.message)
          await supabase.from('activity_logs').insert({
            client_id: clientId,
            action_type: `testimonial_${milestone}_sent`,
            payload_json: { student_email: studentEmail, error: err.message },
            status: 'failed',
          })
        }
      }
    }
  }
}
