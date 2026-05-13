import { Router } from 'express'
import { supabase } from '../services/supabase'
import { decrypt } from '../services/encryption'
import { buildPromptFailedPayment, getTemplate, parseClaudeResponse, wrapEmailHtml } from '../services/templates'
import { callClaude } from '../services/claude'
import { sendEmail } from '../services/resend'
import { verifyStripeSignature } from '../middleware/stripe-sig'

export const webhooksRouter = Router()

webhooksRouter.post('/:clientId', verifyStripeSignature, async (req, res) => {
  const event = (req as any).stripeEvent as any
  const clientId = req.params.clientId as string

  res.json({ ok: true })

  const { data: client } = await supabase
    .from('clients')
    .select('email')
    .eq('id', clientId)
    .single()

  const { data: configs } = await supabase
    .from('client_configs')
    .select('config_type, encrypted_value')
    .eq('client_id', clientId)

  const configMap: Record<string, string> = {}
  for (const c of configs ?? []) configMap[c.config_type] = decrypt(c.encrypted_value)
  const sender_name = configMap['sender_name'] || 'Formateur'

  const { data: autoMode } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'auto_mode')
    .single()
  const isAuto = autoMode?.value === 'true'

  if (event.type === 'payment_intent.payment_failed' || event.type === 'invoice.payment_failed') {
    await handleFailedPayment({ event, clientId, client, sender_name, isAuto })
  } else if (event.type === 'checkout.session.completed') {
    await handleCheckoutCompleted({ event, clientId, client, sender_name, isAuto })
  }
})

async function handleFailedPayment(opts: {
  event: any
  clientId: string
  client: { email: string } | null
  sender_name: string
  isAuto: boolean
}) {
  const { event, clientId, client, sender_name, isAuto } = opts
  let context_json: Record<string, any>

  if (event.type === 'invoice.payment_failed') {
    const inv = event.data.object as any
    context_json = {
      amount: (inv.amount_due ?? 0) / 100,
      currency: inv.currency,
      customer_email: inv.customer_email ?? '',
      hosted_invoice_url: inv.hosted_invoice_url ?? '',
      payment_link: inv.hosted_invoice_url ?? '',
      student_name: (inv.metadata as any)?.student_name,
      product_name: (inv.metadata as any)?.product_name,
      customer_name: inv.customer_name ?? (inv.metadata as any)?.customer_name,
      payment_intent_id: typeof inv.payment_intent === 'string' ? inv.payment_intent : (inv.payment_intent as any)?.id,
    }
  } else {
    const pi = event.data.object as any
    context_json = {
      amount: (pi.amount ?? 0) / 100,
      currency: pi.currency,
      customer_email: pi.receipt_email ?? pi.metadata?.customer_email ?? '',
      hosted_invoice_url: pi.metadata?.hosted_invoice_url ?? '',
      payment_link: pi.metadata?.hosted_invoice_url ?? '',
      student_name: pi.metadata?.student_name,
      product_name: pi.metadata?.product_name,
      customer_name: pi.metadata?.customer_name,
      payment_intent_id: pi.id,
    }
  }

  const prompt_template = buildPromptFailedPayment({ ...context_json, sender_name })

  if (!isAuto) {
    await supabase.from('pending_tasks').insert({
      client_id: clientId,
      task_type: 'failed_payment',
      context_json: { ...context_json, sender_name },
      prompt_template,
      status: 'pending',
    })
    return
  }

  const { data: task } = await supabase
    .from('pending_tasks')
    .insert({
      client_id: clientId,
      task_type: 'failed_payment',
      context_json: { ...context_json, sender_name },
      prompt_template,
      status: 'processing',
    })
    .select()
    .single()

  if (!task) return

  try {
    if (!context_json.customer_email) throw new Error('customer_email manquant')
    const aiResponse = await callClaude(prompt_template, 'claude-sonnet-4-6')
    const { subject, body_html } = parseClaudeResponse(aiResponse)
    const html = wrapEmailHtml(body_html, sender_name)
    await sendEmail({ to: context_json.customer_email, subject, html, sender_name, reply_to: client?.email })
    await supabase
      .from('pending_tasks')
      .update({ status: 'sent', ai_response: aiResponse, processed_at: new Date().toISOString() })
      .eq('id', task.id)
    await supabase.from('activity_logs').insert({
      client_id: clientId,
      action_type: 'failed_payment_email',
      payload_json: { subject, to: context_json.customer_email, amount: context_json.amount },
      status: 'sent',
    })
  } catch (err: any) {
    await supabase
      .from('pending_tasks')
      .update({ status: 'failed', ai_response: err.message })
      .eq('id', task.id)
    await supabase.from('activity_logs').insert({
      client_id: clientId,
      action_type: 'failed_payment_email',
      payload_json: { error: err.message, customer_email: context_json.customer_email },
      status: 'failed',
    })
  }
}

async function handleCheckoutCompleted(opts: {
  event: any
  clientId: string
  client: { email: string } | null
  sender_name: string
  isAuto: boolean
}) {
  const { event, clientId, client, sender_name, isAuto } = opts
  const session = event.data.object as any

  const context_json = {
    amount: (session.amount_total ?? 0) / 100,
    currency: session.currency,
    customer_email: session.customer_details?.email ?? '',
    customer_name: session.customer_details?.name,
    product_name: session.metadata?.product_name,
    student_name: session.metadata?.student_name ?? session.customer_details?.name,
    payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : (session.payment_intent as any)?.id,
    sender_name,
  }

  const { prompt } = getTemplate('onboarding_j0', context_json)

  const { data: task } = await supabase
    .from('pending_tasks')
    .insert({
      client_id: clientId,
      task_type: 'onboarding_j0',
      context_json,
      prompt_template: prompt,
      status: isAuto ? 'processing' : 'pending',
    })
    .select()
    .single()

  const now = new Date()
  const j3 = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
  const j7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  await supabase.from('scheduled_jobs').insert([
    {
      client_id: clientId,
      job_type: 'onboarding_j3',
      context_json,
      scheduled_for: j3.toISOString(),
      status: 'pending',
    },
    {
      client_id: clientId,
      job_type: 'onboarding_j7',
      context_json,
      scheduled_for: j7.toISOString(),
      status: 'pending',
    },
  ])

  if (!isAuto || !task) return

  try {
    if (!context_json.customer_email) throw new Error('customer_email manquant')
    const aiResponse = await callClaude(prompt, 'claude-sonnet-4-6')
    const { subject, body_html } = parseClaudeResponse(aiResponse)
    const html = wrapEmailHtml(body_html, sender_name)
    await sendEmail({ to: context_json.customer_email, subject, html, sender_name, reply_to: client?.email })
    await supabase
      .from('pending_tasks')
      .update({ status: 'sent', ai_response: aiResponse, processed_at: new Date().toISOString() })
      .eq('id', task.id)
    await supabase.from('activity_logs').insert({
      client_id: clientId,
      action_type: 'onboarding_j0_email',
      payload_json: { subject, to: context_json.customer_email },
      status: 'sent',
    })
  } catch (err: any) {
    await supabase
      .from('pending_tasks')
      .update({ status: 'failed', ai_response: err.message })
      .eq('id', task.id)
  }
}
