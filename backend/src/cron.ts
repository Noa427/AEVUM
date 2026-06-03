import { supabase } from './services/supabase'
import { getTemplate, TaskType, buildPromptUpsell, parseClaudeResponse, wrapEmailHtml } from './services/templates'
import { callClaude } from './services/claude'
import { sendEmail } from './services/resend'
import { decrypt } from './services/encryption'
import { insertTrackingRow, injectTracking } from './utils/tracking'
import { getEmailTemplate } from './utils/getEmailTemplate'
import { sendEmailWithChannels } from './utils/sendMultiChannel'
import { generateWeeklyVideo, WeeklyStats } from './services/videoreport'
import { sendVocalRecovery } from './services/vocal'

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

  // Blacklist check
  if (ctx.customer_email) {
    const { data: bl } = await supabase
      .from('client_blacklist')
      .select('email')
      .eq('client_id', job.client_id)
      .eq('email', (ctx.customer_email as string).toLowerCase())
      .maybeSingle()
    if (bl) {
      await supabase.from('scheduled_jobs').update({ status: 'done' }).eq('id', job.id)
      console.log(`[cron] job ${job.id} (${task_type}) ignoré — email blacklisté`)
      return
    }
  }

  const prompt_template = getTemplate(task_type, ctx).prompt
  await createTaskForJob(job.id, job.client_id, task_type, ctx, prompt_template, 'pending')
  console.log(`[cron] job ${job.id} (${task_type}) → pending_task créée (atomique)`)

  if (job.job_type === 'failed_payment_j7' && ctx.customer_email) {
    const { data: vocalCfg } = await supabase
      .from('client_configs')
      .select('encrypted_value')
      .eq('client_id', job.client_id)
      .eq('config_type', 'vocal_ia_active')
      .single()

    // vocal_ia_active is the sole runtime gate — admin activates it when client purchases addon F13
    let vocalActive = false
    if (vocalCfg?.encrypted_value) {
      try { vocalActive = JSON.parse(decrypt(vocalCfg.encrypted_value))?.active === true } catch {}
    }

    if (vocalActive) {
      const now = new Date()
      const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))

      const { count: alreadyCalled } = await supabase
        .from('email_tracking')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', job.client_id)
        .eq('student_email', (ctx.customer_email as string).toLowerCase())
        .eq('channel', 'vocal')
        .eq('config_type', 'vocal_recovery')
        .gte('sent_at', startOfMonth.toISOString())

      if ((alreadyCalled ?? 0) === 0) {
        void sendVocalRecovery(job.client_id, ctx.customer_email as string)
      }
    }
  }
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

  // Blacklist check
  if (ctx.customer_email) {
    const { data: bl } = await supabase
      .from('client_blacklist')
      .select('email')
      .eq('client_id', job.client_id)
      .eq('email', (ctx.customer_email as string).toLowerCase())
      .maybeSingle()
    if (bl) {
      await supabase.from('scheduled_jobs').update({ status: 'done' }).eq('id', job.id)
      console.log(`[cron] job ${job.id} (upsell) ignoré — email blacklisté`)
      return
    }
  }

  // Mode auto : RPC atomique insert processing + job done, puis email
  const taskId = await createTaskForJob(job.id, job.client_id, 'upsell', ctx, prompt_template, 'processing')

  try {
    if (!ctx.customer_email) throw new Error('customer_email manquant')
    const aiResponse = await callClaude(prompt_template, 'claude-sonnet-4-6', job.client_id)
    const { subject, body_html } = parseClaudeResponse(aiResponse)
    const rawHtml = wrapEmailHtml(body_html, ctx.sender_name ?? 'Formateur')
    const trackingToken = await sendEmailWithChannels({
      clientId: job.client_id,
      studentEmail: ctx.customer_email,
      configType: 'upsell',
      to: ctx.customer_email,
      subject,
      rawHtml,
      senderName: ctx.sender_name ?? 'Formateur',
      replyTo: (client as any)?.email,
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
  const { data: blAbandon } = await supabase
    .from('client_blacklist')
    .select('email')
    .eq('client_id', job.client_id)
    .eq('email', customerEmail.toLowerCase())
    .maybeSingle()
  if (blAbandon) { await markDone(); return }

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
  const rawHtml = wrapEmailHtml(body.replace(/\n/g, '<br>'), senderName)
  let abandonConfigJson: Record<string, any> | undefined
  try { abandonConfigJson = parsed } catch { /* parsed déjà parsé */ }

  try {
    const trackingToken = await sendEmailWithChannels({
      clientId: job.client_id,
      studentEmail: customerEmail,
      configType: 'template_checkout_abandon',
      configJson: abandonConfigJson,
      templateVars: vars,
      to: customerEmail,
      subject,
      rawHtml,
      senderName,
    })
    await markDone()
    await supabase.from('activity_logs').insert({
      client_id: job.client_id,
      action_type: 'checkout_abandon_sent',
      payload_json: { to: customerEmail, subject },
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

    if (!client.email) continue

    // Blacklist check
    const { data: blAuto } = await supabase
      .from('client_blacklist')
      .select('email')
      .eq('client_id', automation.client_id)
      .eq('email', client.email.toLowerCase())
      .maybeSingle()
    if (blAuto) {
      console.log(`[cron:custom] "${automation.name}" ignoré — email blacklisté`)
      continue
    }

    try {
      const senderName = senderMap.get(automation.client_id) ?? client.name
      const rawHtml = wrapEmailHtml(automation.body.replace(/\n/g, '<br>'), senderName)
      const trackingToken = await sendEmailWithChannels({
        clientId: automation.client_id,
        studentEmail: client.email,
        configType: 'custom_automation',
        automationId: automation.id,
        to: client.email,
        subject: automation.subject,
        rawHtml,
        senderName,
      })

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
    const text = `Bonjour,\n\nVoici les emails envoyés cette semaine pour ${client.name} :\n\n${lines}\n\nTotal : ${logs.length} email(s)\n\nCordialement,\nAEVUM`

    try {
      await sendEmail({
        to: client.email,
        subject,
        html: `<pre style="font-family:sans-serif;white-space:pre-wrap">${text}</pre>`,
        sender_name: 'AEVUM',
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
        // Blacklist check
        const { data: blTest } = await supabase
          .from('client_blacklist')
          .select('email')
          .eq('client_id', clientId)
          .eq('email', studentEmail.toLowerCase())
          .maybeSingle()
        if (blTest) {
          console.log(`[cron:testimonial] ${milestone}: skipped ${studentEmail} — blacklisted`)
          continue
        }

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

// ── Feature 14 : Pré-dunning CB expirante ──────────────────────────────────

export async function runPredunning(): Promise<void> {
  if (new Date().getUTCHours() !== 8) return

  const now = new Date()
  const in14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString()

  const { data: profiles } = await supabase
    .from('student_profiles')
    .select('client_id, email, card_exp')
    .gte('card_exp', now.toISOString())
    .lte('card_exp', in14Days)

  if (!profiles || profiles.length === 0) return
  console.log(`[cron:predunning] ${profiles.length} profil(s) à vérifier`)

  for (const profile of profiles) {
    const { client_id: clientId, email, card_exp } = profile

    const { data: clientRow } = await supabase.from('clients').select('paused_until').eq('id', clientId).single()
    if (clientRow?.paused_until && new Date() < new Date(clientRow.paused_until)) continue

    const { data: configRow } = await supabase
      .from('client_configs')
      .select('encrypted_value')
      .eq('client_id', clientId)
      .eq('config_type', 'template_predunning')
      .single()
    if (!configRow?.encrypted_value) continue

    let config: Record<string, any>
    try { config = JSON.parse(decrypt(configRow.encrypted_value)) } catch { continue }
    if (config.active === false) continue

    // Blacklist check
    const { data: blPred } = await supabase
      .from('client_blacklist')
      .select('email')
      .eq('client_id', clientId)
      .eq('email', email.toLowerCase())
      .maybeSingle()
    if (blPred) {
      console.log(`[cron:predunning] skipped ${email} — blacklisted`)
      continue
    }

    const since30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const { count: alreadySent } = await supabase
      .from('email_tracking')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('student_email', email.toLowerCase())
      .eq('config_type', 'template_predunning')
      .gte('sent_at', since30)
    if (alreadySent && alreadySent > 0) continue

    const { data: taskRow } = await supabase
      .from('pending_tasks')
      .select('context_json')
      .eq('client_id', clientId)
      .contains('context_json', { customer_email: email })
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    const ctx = (taskRow?.context_json as Record<string, any>) ?? {}

    const { data: senderRow } = await supabase
      .from('client_configs')
      .select('encrypted_value')
      .eq('client_id', clientId)
      .eq('config_type', 'sender_name')
      .single()
    const senderName = senderRow?.encrypted_value
      ? (() => { try { return decrypt(senderRow.encrypted_value) } catch { return 'Formateur' } })()
      : 'Formateur'

    const expDate = new Date(card_exp)
    const dateExpiration = `${String(expDate.getUTCMonth() + 1).padStart(2, '0')}/${expDate.getUTCFullYear()}`

    const vars: Record<string, string> = {
      nom: ctx.customer_name ?? ctx.student_name ?? '',
      prenom: ctx.student_name ?? '',
      email,
      nom_formation: ctx.product_name ?? '',
      lien_paiement: ctx.payment_link ?? ctx.hosted_invoice_url ?? '',
      date_expiration: dateExpiration,
    }
    const injectV = (text: string) => text.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`)

    try {
      const subject = injectV(config.subject ?? 'Votre carte bancaire expire bientôt')
      const body = injectV(config.body ?? '')
      const html = wrapEmailHtml(body.replace(/\n/g, '<br>'), senderName)
      const token = await insertTrackingRow({ clientId, studentEmail: email, configType: 'template_predunning', channel: 'email' })
      await sendEmail({
        to: email,
        subject,
        html: injectTracking(html, token, process.env.BACKEND_URL!),
        sender_name: senderName,
      })
      await supabase.from('activity_logs').insert({
        client_id: clientId,
        action_type: 'predunning_sent',
        payload_json: { to: email, subject, date_expiration: dateExpiration, tracking_id: token },
        status: 'sent',
      })
      console.log(`[cron:predunning] → ${email} (expire ${dateExpiration})`)
    } catch (err: any) {
      console.error(`[cron:predunning] échoué pour ${email}:`, err.message)
      await supabase.from('activity_logs').insert({
        client_id: clientId,
        action_type: 'predunning_sent',
        payload_json: { to: email, error: err.message },
        status: 'failed',
      })
    }
  }
}

// ── Feature 15 : Churn prédictif ──────────────────────────────────────────

export async function runChurnDetection(): Promise<void> {
  if (new Date().getUTCHours() !== 8) return

  const now = new Date()
  const since21 = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000).toISOString()
  const since30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const since7  = new Date(now.getTime() -  7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: configs } = await supabase
    .from('client_configs')
    .select('client_id, encrypted_value')
    .eq('config_type', 'template_churn_reengagement')

  if (!configs || configs.length === 0) return

  for (const cfg of configs) {
    let config: Record<string, any>
    try { config = JSON.parse(decrypt(cfg.encrypted_value)) } catch { continue }
    if (config.active === false) continue

    const clientId = cfg.client_id

    const { data: clientRow } = await supabase.from('clients').select('paused_until').eq('id', clientId).single()
    if (clientRow?.paused_until && new Date() < new Date(clientRow.paused_until)) continue

    const { data: tasks } = await supabase
      .from('pending_tasks')
      .select('context_json, created_at')
      .eq('client_id', clientId)
      .lt('created_at', since7)
      .order('created_at', { ascending: true })
      .limit(2000)

    const emailsSeen = new Set<string>()
    const candidates: Array<{ email: string; ctx: Record<string, any> }> = []
    for (const t of tasks ?? []) {
      const email = (t.context_json as any)?.customer_email as string | undefined
      if (!email || emailsSeen.has(email)) continue
      emailsSeen.add(email)
      candidates.push({ email, ctx: t.context_json as Record<string, any> })
    }

    const { data: senderRow } = await supabase
      .from('client_configs').select('encrypted_value')
      .eq('client_id', clientId).eq('config_type', 'sender_name').single()
    const senderName = senderRow?.encrypted_value
      ? (() => { try { return decrypt(senderRow.encrypted_value) } catch { return 'Formateur' } })()
      : 'Formateur'

    for (const { email, ctx } of candidates) {
      // Blacklist check
      const { data: blChurn } = await supabase
        .from('client_blacklist')
        .select('email')
        .eq('client_id', clientId)
        .eq('email', email.toLowerCase())
        .maybeSingle()
      if (blChurn) {
        console.log(`[cron:churn] skipped ${email} — blacklisted`)
        continue
      }

      const { data: profileRow } = await supabase
        .from('student_profiles')
        .select('last_lms_activity')
        .eq('client_id', clientId)
        .eq('email', email.toLowerCase())
        .single()

      let isChurn = false

      if (profileRow?.last_lms_activity) {
        isChurn = new Date(profileRow.last_lms_activity) < new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
      } else {
        const [openRes, clickRes] = await Promise.all([
          supabase
            .from('email_tracking')
            .select('*', { count: 'exact', head: true })
            .eq('client_id', clientId)
            .eq('student_email', email.toLowerCase())
            .not('opened_at', 'is', null)
            .gte('sent_at', since21),
          supabase
            .from('email_tracking')
            .select('*', { count: 'exact', head: true })
            .eq('client_id', clientId)
            .eq('student_email', email.toLowerCase())
            .not('clicked_at', 'is', null)
            .gte('sent_at', since30),
        ])
        isChurn = (openRes.count ?? 0) === 0 && (clickRes.count ?? 0) === 0
      }

      if (!isChurn) continue

      const { count: alreadySent } = await supabase
        .from('email_tracking')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .eq('student_email', email.toLowerCase())
        .eq('config_type', 'template_churn_reengagement')
        .gte('sent_at', since30)
      if (alreadySent && alreadySent > 0) continue

      const vars: Record<string, string> = {
        nom: ctx.customer_name ?? ctx.student_name ?? '',
        prenom: ctx.student_name ?? '',
        nom_formation: ctx.product_name ?? '',
        lien_acces: ctx.hosted_invoice_url ?? '',
      }
      const injectV = (text: string) => text.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`)

      try {
        const subject = injectV(config.subject ?? 'On pense à vous !')
        const body = injectV(config.body ?? '')
        const html = wrapEmailHtml(body.replace(/\n/g, '<br>'), senderName)
        const token = await insertTrackingRow({ clientId, studentEmail: email, configType: 'template_churn_reengagement', channel: 'email' })
        await sendEmail({
          to: email,
          subject,
          html: injectTracking(html, token, process.env.BACKEND_URL!),
          sender_name: senderName,
        })
        await supabase.from('activity_logs').insert({
          client_id: clientId,
          action_type: 'churn_reengagement_sent',
          payload_json: { to: email, subject, tracking_id: token },
          status: 'sent',
        })
        console.log(`[cron:churn] re-engagement → ${email}`)
      } catch (err: any) {
        console.error(`[cron:churn] échoué pour ${email}:`, err.message)
        await supabase.from('activity_logs').insert({
          client_id: clientId,
          action_type: 'churn_reengagement_sent',
          payload_json: { to: email, error: err.message },
          status: 'failed',
        })
      }
    }
  }
}

// ── Feature 19 : Coaching pédagogique J14 ─────────────────────────────────

export async function runStudentCoaching(): Promise<void> {
  if (new Date().getUTCHours() !== 8) return

  const now = new Date()
  const since14 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const since7  = new Date(now.getTime() -  7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: configs } = await supabase
    .from('client_configs')
    .select('client_id, encrypted_value')
    .eq('config_type', 'template_coaching_j14')

  if (!configs || configs.length === 0) return

  for (const cfg of configs) {
    let config: Record<string, any>
    try { config = JSON.parse(decrypt(cfg.encrypted_value)) } catch { continue }
    if (config.active === false) continue

    const clientId = cfg.client_id

    const { data: clientRow } = await supabase.from('clients').select('paused_until').eq('id', clientId).single()
    if (clientRow?.paused_until && new Date() < new Date(clientRow.paused_until)) continue

    const { data: tasks } = await supabase
      .from('pending_tasks')
      .select('context_json, created_at')
      .eq('client_id', clientId)
      .lt('created_at', since7)
      .order('created_at', { ascending: true })
      .limit(2000)

    const emailsSeen = new Set<string>()
    const candidates: Array<{ email: string; ctx: Record<string, any> }> = []
    for (const t of tasks ?? []) {
      const email = (t.context_json as any)?.customer_email as string | undefined
      if (!email || emailsSeen.has(email)) continue
      emailsSeen.add(email)
      candidates.push({ email, ctx: t.context_json as Record<string, any> })
    }

    const { data: senderRow } = await supabase
      .from('client_configs').select('encrypted_value')
      .eq('client_id', clientId).eq('config_type', 'sender_name').single()
    const senderName = senderRow?.encrypted_value
      ? (() => { try { return decrypt(senderRow.encrypted_value) } catch { return 'Formateur' } })()
      : 'Formateur'

    for (const { email, ctx } of candidates) {
      // Blacklist check
      const { data: blCoach } = await supabase
        .from('client_blacklist')
        .select('email')
        .eq('client_id', clientId)
        .eq('email', email.toLowerCase())
        .maybeSingle()
      if (blCoach) {
        console.log(`[cron:coaching] skipped ${email} — blacklisted`)
        continue
      }

      const { data: profileRow } = await supabase
        .from('student_profiles')
        .select('last_lms_activity')
        .eq('client_id', clientId)
        .eq('email', email.toLowerCase())
        .single()

      let needsCoaching = false

      if (profileRow?.last_lms_activity) {
        needsCoaching = new Date(profileRow.last_lms_activity) < new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      } else {
        const { count: opens } = await supabase
          .from('email_tracking')
          .select('*', { count: 'exact', head: true })
          .eq('client_id', clientId)
          .eq('student_email', email.toLowerCase())
          .not('opened_at', 'is', null)
          .gte('sent_at', since14)
        needsCoaching = (opens ?? 0) === 0
      }

      if (!needsCoaching) continue

      const { count: alreadySent } = await supabase
        .from('email_tracking')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .eq('student_email', email.toLowerCase())
        .eq('config_type', 'template_coaching_j14')
        .gte('sent_at', since14)
      if (alreadySent && alreadySent > 0) continue

      const vars: Record<string, string> = {
        nom: ctx.customer_name ?? ctx.student_name ?? '',
        prenom: ctx.student_name ?? '',
        nom_formation: ctx.product_name ?? '',
        lien_acces: ctx.hosted_invoice_url ?? '',
      }
      const injectV = (text: string) => text.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`)

      try {
        const subject = injectV(config.subject ?? 'Comment avancez-vous dans votre formation ?')
        const body = injectV(config.body ?? '')
        const html = wrapEmailHtml(body.replace(/\n/g, '<br>'), senderName)
        const token = await insertTrackingRow({ clientId, studentEmail: email, configType: 'template_coaching_j14', channel: 'email' })
        await sendEmail({
          to: email,
          subject,
          html: injectTracking(html, token, process.env.BACKEND_URL!),
          sender_name: senderName,
        })
        await supabase.from('activity_logs').insert({
          client_id: clientId,
          action_type: 'coaching_sent',
          payload_json: { to: email, subject, tracking_id: token },
          status: 'sent',
        })
        console.log(`[cron:coaching] → ${email}`)
      } catch (err: any) {
        console.error(`[cron:coaching] échoué pour ${email}:`, err.message)
        await supabase.from('activity_logs').insert({
          client_id: clientId,
          action_type: 'coaching_sent',
          payload_json: { to: email, error: err.message },
          status: 'failed',
        })
      }
    }
  }
}

// ── Feature 17 : Rapport vidéo hebdomadaire ────────────────────────────────

export async function sendVideoReport(): Promise<void> {
  const now = new Date()
  if (now.getUTCDay() !== 1 || now.getUTCHours() !== 8) return

  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: videoConfigs } = await supabase
    .from('client_configs')
    .select('client_id, encrypted_value')
    .eq('config_type', 'rapport_video_active')

  const activeClientIds = new Set<string>()
  for (const cfg of videoConfigs ?? []) {
    try {
      const val = decrypt(cfg.encrypted_value)
      if (val === 'true' || JSON.parse(val) === true) activeClientIds.add(cfg.client_id)
    } catch { /* skip */ }
  }

  if (activeClientIds.size === 0) return
  console.log(`[cron:video] ${activeClientIds.size} client(s) avec rapport vidéo actif`)

  const { data: clients } = await supabase
    .from('clients')
    .select('id, name, email, paused_until')
    .in('id', [...activeClientIds])

  for (const client of clients ?? []) {
    if ((client as any).paused_until && new Date() < new Date((client as any).paused_until)) continue

    try {
      const { data: logs } = await supabase
        .from('activity_logs')
        .select('action_type, payload_json')
        .eq('client_id', client.id)
        .eq('status', 'sent')
        .gte('created_at', weekAgo)

      const newStudents = (logs ?? []).filter((l: any) => l.action_type === 'onboarding_j0_email').length
      const emailsSent = (logs ?? []).length
      const recoveredLogs = (logs ?? []).filter((l: any) => l.action_type === 'payment_recovered')
      const recovered = recoveredLogs.length
      const recoveredAmount = recoveredLogs.reduce(
        (sum: number, l: any) => sum + ((l.payload_json as any)?.amount ?? 0), 0
      )

      const weekLabel = `Semaine du ${new Date(weekAgo).toLocaleDateString('fr-FR', {
        day: 'numeric', month: 'long', year: 'numeric',
      })}`

      const stats: WeeklyStats = { clientName: client.name, newStudents, emailsSent, recovered, recoveredAmount, weekLabel }

      const videoUrl = await generateWeeklyVideo(client.id, stats)
      if (!videoUrl) throw new Error('URL vidéo vide')

      await sendEmail({
        to: client.email,
        subject: `Votre rapport vidéo — ${weekLabel}`,
        html: `<p>Bonjour ${client.name},</p><p>Votre rapport vidéo de la semaine est prêt :</p><p><a href="${videoUrl}">Voir le rapport</a></p><p>Ce lien expire dans 7 jours.</p><p>AEVUM</p>`,
        sender_name: 'AEVUM',
      })

      await supabase.from('activity_logs').insert({
        client_id: client.id,
        action_type: 'rapport_video_sent',
        payload_json: { video_url: videoUrl, week: weekLabel },
        status: 'sent',
      })

      console.log(`[cron:video] rapport envoyé à ${client.email}`)
    } catch (err: any) {
      console.error(`[cron:video] échoué pour ${client.name}:`, err.message)
      await supabase.from('activity_logs').insert({
        client_id: client.id,
        action_type: 'rapport_video_sent',
        payload_json: { error: err.message },
        status: 'failed',
      })
    }
  }
}
