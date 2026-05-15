import { supabase } from './services/supabase'
import { getTemplate, TaskType, buildPromptUpsell, parseClaudeResponse, wrapEmailHtml } from './services/templates'
import { callClaude } from './services/claude'
import { sendEmail } from './services/resend'
import { decrypt } from './services/encryption'

export async function runScheduledJobs(): Promise<void> {
  const { data: jobs } = await supabase
    .from('scheduled_jobs')
    .select('*')
    .lte('scheduled_for', new Date().toISOString())
    .eq('status', 'pending')

  if (!jobs || jobs.length === 0) return
  console.log(`[cron] ${jobs.length} job(s) à traiter`)

  for (const job of jobs) {
    try {
      if (job.job_type === 'upsell') {
        await handleUpsellJob(job)
      } else {
        await handleStandardJob(job)
      }
    } catch (err: any) {
      console.error(`[cron] job ${job.id} échoué:`, err.message)
      await supabase
        .from('scheduled_jobs')
        .update({ status: 'failed' })
        .eq('id', job.id)
    }
  }
}

async function handleStandardJob(job: any): Promise<void> {
  const ctx = job.context_json as Record<string, any>
  const task_type = job.job_type as TaskType
  const prompt_template = getTemplate(task_type, ctx).prompt

  await supabase.from('pending_tasks').insert({
    client_id: job.client_id,
    task_type,
    context_json: ctx,
    prompt_template,
    status: 'pending',
  })

  await supabase
    .from('scheduled_jobs')
    .update({ status: 'done' })
    .eq('id', job.id)

  console.log(`[cron] job ${job.id} (${task_type}) → pending_task créée`)
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

  const ctx = {
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
    await supabase.from('pending_tasks').insert({
      client_id: job.client_id,
      task_type: 'upsell',
      context_json: ctx,
      prompt_template,
      status: 'pending',
    })
    await supabase.from('scheduled_jobs').update({ status: 'done' }).eq('id', job.id)
    console.log(`[cron] job ${job.id} (upsell) → pending_task créée (mode manuel)`)
    return
  }

  const { data: task } = await supabase
    .from('pending_tasks')
    .insert({
      client_id: job.client_id,
      task_type: 'upsell',
      context_json: ctx,
      prompt_template,
      status: 'processing',
    })
    .select()
    .single()

  try {
    if (!ctx.customer_email) throw new Error('customer_email manquant')
    const aiResponse = await callClaude(prompt_template, 'claude-sonnet-4-6')
    const { subject, body_html } = parseClaudeResponse(aiResponse)
    const html = wrapEmailHtml(body_html, ctx.sender_name ?? 'Formateur')
    await sendEmail({
      to: ctx.customer_email,
      subject,
      html,
      sender_name: ctx.sender_name ?? 'Formateur',
      reply_to: (client as any)?.email,
    })
    await supabase
      .from('pending_tasks')
      .update({ status: 'sent', ai_response: aiResponse, processed_at: new Date().toISOString() })
      .eq('id', task!.id)
    await supabase.from('activity_logs').insert({
      client_id: job.client_id,
      action_type: 'upsell_email',
      payload_json: { subject, to: ctx.customer_email, product: ctx.upsell_product_name },
      status: 'sent',
    })
    await supabase.from('scheduled_jobs').update({ status: 'done' }).eq('id', job.id)
    console.log(`[cron] job ${job.id} (upsell) → email envoyé à ${ctx.customer_email}`)
  } catch (err: any) {
    if (task) {
      await supabase.from('pending_tasks').update({ status: 'failed', ai_response: err.message }).eq('id', task.id)
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

export async function sendWeeklyReport(): Promise<void> {
  const now = new Date()
  if (now.getUTCDay() !== 1 || now.getUTCHours() !== 8) return

  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: clients } = await supabase.from('clients').select('id, name, email')
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
