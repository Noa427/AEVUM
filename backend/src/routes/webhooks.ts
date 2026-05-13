// backend/src/routes/webhooks.ts
import { Router } from 'express'
import Stripe from 'stripe'
import { supabase } from '../services/supabase'
import { decrypt } from '../services/encryption'
import { buildPrompt, parseClaudeResponse, wrapEmailHtml } from '../services/templates'
import { callClaude } from '../services/claude'
import { sendEmail } from '../services/resend'
import { verifyStripeSignature } from '../middleware/stripe-sig'

export const webhooksRouter = Router()

webhooksRouter.post('/:clientId', verifyStripeSignature, async (req, res) => {
  const event = (req as any).stripeEvent as any

  if (event.type !== 'payment_intent.payment_failed') return res.json({ ok: true })

  const pi = event.data.object as any
  const clientId = req.params.clientId

  const amount = pi.amount / 100
  const customer_email = pi.receipt_email ?? pi.metadata?.customer_email ?? ''
  const payment_link = pi.metadata?.hosted_invoice_url ?? ''
  const student_name = pi.metadata?.student_name
  const product_name = pi.metadata?.product_name

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

  const prompt_template = buildPrompt({ sender_name, amount, payment_link, student_name, product_name })
  const context_json = { amount, customer_email, payment_link, student_name, product_name }

  const { data: autoMode } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'auto_mode')
    .single()
  const isAuto = autoMode?.value === 'true'

  if (!isAuto) {
    await supabase.from('pending_tasks').insert({
      client_id: clientId,
      task_type: 'failed_payment',
      context_json,
      prompt_template,
      status: 'pending',
    })
    return res.json({ ok: true })
  }

  const { data: task } = await supabase
    .from('pending_tasks')
    .insert({
      client_id: clientId,
      task_type: 'failed_payment',
      context_json,
      prompt_template,
      status: 'processing',
    })
    .select()
    .single()

  try {
    if (!customer_email) throw new Error('customer_email manquant')
    const aiResponse = await callClaude(prompt_template)
    const { subject, body_html } = parseClaudeResponse(aiResponse)
    const html = wrapEmailHtml(body_html, sender_name)
    await sendEmail({ to: customer_email, subject, html, reply_to: client?.email })
    await supabase
      .from('pending_tasks')
      .update({ status: 'sent', ai_response: aiResponse, processed_at: new Date().toISOString() })
      .eq('id', task!.id)
    await supabase.from('activity_logs').insert({
      client_id: clientId,
      action_type: 'failed_payment_email',
      payload_json: { subject, to: customer_email, amount },
      status: 'sent',
    })
  } catch {
    await supabase.from('pending_tasks').update({ status: 'failed' }).eq('id', task!.id)
  }

  res.json({ ok: true })
})
