import { Router } from 'express'
import Stripe from 'stripe'
import { supabase } from '../services/supabase'
import { decrypt } from '../services/encryption'
import { buildPromptFailedPayment, getTemplate, parseClaudeResponse, wrapEmailHtml } from '../services/templates'
import { callClaude } from '../services/claude'
import { sendEmail } from '../services/resend'
import { verifyStripeSignature } from '../middleware/stripe-sig'
import { getEmailTemplate, templateToAiResponse } from '../utils/getEmailTemplate'
import { insertTrackingRow, injectTracking } from '../utils/tracking'
import { sendEmailWithChannels } from '../utils/sendMultiChannel'

export const webhooksRouter = Router()

webhooksRouter.post('/:clientId', verifyStripeSignature, async (req, res) => {
  const event = (req as any).stripeEvent as any
  const clientId = req.params.clientId as string

  res.json({ ok: true })

  const { data: client } = await supabase
    .from('clients')
    .select('email, auto_mode, paused_until')
    .eq('id', clientId)
    .single()

  const { data: configs } = await supabase
    .from('client_configs')
    .select('config_type, encrypted_value')
    .eq('client_id', clientId)

  const configMap: Record<string, string> = {}
  for (const c of configs ?? []) {
    try { configMap[c.config_type] = decrypt(c.encrypted_value) } catch { /* skip malformed */ }
  }
  const sender_name = configMap['sender_name'] || 'Formateur'

  const isAuto = (client as any)?.auto_mode ?? true

  const pausedUntil = (client as any)?.paused_until
  if (pausedUntil && new Date() < new Date(pausedUntil)) {
    await supabase.from('activity_logs').insert({
      client_id: clientId,
      action_type: 'webhook_skipped',
      payload_json: {
        event_type: event.type,
        reason: `Envoi ignoré — compte en pause jusqu'au ${new Date(pausedUntil).toLocaleDateString('fr-FR')}`,
      },
      status: 'skipped',
    })
    return
  }

  if (event.type === 'payment_intent.payment_failed' || event.type === 'invoice.payment_failed') {
    await handleFailedPayment({ event, clientId, client, sender_name, isAuto, configMap })
  } else if (event.type === 'checkout.session.completed') {
    await handleCheckoutCompleted({ event, clientId, client, sender_name, isAuto, configMap })
  } else if (event.type === 'invoice.payment_succeeded') {
    await handlePaymentRecovered({ event, clientId })
  } else if (event.type === 'checkout.session.expired') {
    await handleCheckoutSessionExpired({ event, clientId })
  } else if (event.type === 'customer.updated') {
    await handleCardExpUpdate({ event, clientId })
  } else if (event.type === 'payment_method.updated') {
    await handleCardExpUpdate({ event, clientId })
  }
})

async function handleFailedPayment(opts: {
  event: any
  clientId: string
  client: { email: string } | null
  sender_name: string
  isAuto: boolean
  configMap: Record<string, string>
}) {
  const { event, clientId, client, sender_name, isAuto, configMap } = opts

  const fpConfigRaw = configMap['template_failed_payment_j1']
  if (fpConfigRaw) {
    try { if (JSON.parse(fpConfigRaw).active === false) return } catch {}
  }
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

  const tplVars = {
    nom: context_json.customer_name ?? context_json.student_name ?? '',
    prenom: context_json.student_name ?? '',
    email: context_json.customer_email ?? '',
    nom_formation: context_json.product_name ?? '',
    lien_acces: context_json.hosted_invoice_url ?? context_json.payment_link ?? '',
  }

  const now = new Date()
  const j3At = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
  const j7At = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  if (!isAuto) {
    const tpl = await getEmailTemplate(clientId, 'template_failed_payment_j1', tplVars)
    await supabase.from('pending_tasks').insert({
      client_id: clientId,
      task_type: 'failed_payment',
      context_json: { ...context_json, sender_name },
      prompt_template,
      ai_response: templateToAiResponse(tpl),
      status: 'pending',
    })
    await supabase.from('scheduled_jobs').insert([
      { client_id: clientId, job_type: 'failed_payment_j3', context_json: { ...context_json, sender_name }, scheduled_for: j3At.toISOString(), status: 'pending' },
      { client_id: clientId, job_type: 'failed_payment_j7', context_json: { ...context_json, sender_name }, scheduled_for: j7At.toISOString(), status: 'pending' },
    ])
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

  await supabase.from('scheduled_jobs').insert([
    { client_id: clientId, job_type: 'failed_payment_j3', context_json: { ...context_json, sender_name }, scheduled_for: j3At.toISOString(), status: 'pending' },
    { client_id: clientId, job_type: 'failed_payment_j7', context_json: { ...context_json, sender_name }, scheduled_for: j7At.toISOString(), status: 'pending' },
  ])

  try {
    if (!context_json.customer_email) throw new Error('customer_email manquant')
    const aiResponse = await callClaude(prompt_template, 'claude-sonnet-4-6')
    const { subject, body_html } = parseClaudeResponse(aiResponse)
    const rawHtml = wrapEmailHtml(body_html, sender_name)
    let fpConfigJson: Record<string, any> | undefined
    try { fpConfigJson = configMap['template_failed_payment_j1'] ? JSON.parse(configMap['template_failed_payment_j1']) : undefined } catch { /* skip */ }
    const tplVars = {
      nom: context_json.customer_name ?? context_json.student_name ?? '',
      prenom: context_json.student_name ?? '',
      email: context_json.customer_email,
      nom_formation: context_json.product_name ?? '',
      lien_paiement: context_json.payment_link ?? context_json.hosted_invoice_url ?? '',
    }
    const trackingToken = await sendEmailWithChannels({
      clientId,
      studentEmail: context_json.customer_email,
      configType: 'template_failed_payment_j1',
      configJson: fpConfigJson,
      templateVars: tplVars,
      to: context_json.customer_email,
      subject,
      rawHtml,
      senderName: sender_name,
      replyTo: client?.email,
    })
    await supabase
      .from('pending_tasks')
      .update({ status: 'sent', ai_response: aiResponse, processed_at: new Date().toISOString() })
      .eq('id', task.id)
    await supabase.from('activity_logs').insert({
      client_id: clientId,
      action_type: 'failed_payment_email',
      payload_json: { subject, to: context_json.customer_email, amount: context_json.amount, tracking_id: trackingToken },
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
  configMap: Record<string, string>
}) {
  const { event, clientId, client, sender_name, isAuto, configMap } = opts
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

  // Stocker le numéro de téléphone dans student_profiles
  const phone = session.customer_details?.phone ?? null
  if (context_json.customer_email && phone) {
    await supabase
      .from('student_profiles')
      .upsert(
        {
          client_id: clientId,
          email: (context_json.customer_email as string).toLowerCase(),
          phone,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'client_id,email' }
      )
  }

  const now = new Date()
  const j3At  = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
  const j7At  = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const j30At = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  const followupJobs = [
    { client_id: clientId, job_type: 'onboarding_j3', context_json, scheduled_for: j3At.toISOString(),  status: 'pending' },
    { client_id: clientId, job_type: 'onboarding_j7', context_json, scheduled_for: j7At.toISOString(),  status: 'pending' },
    { client_id: clientId, job_type: 'upsell',        context_json, scheduled_for: j30At.toISOString(), status: 'pending' },
  ]

  const j0ConfigRaw = configMap['template_onboarding_j0']
  let j0Active = true
  if (j0ConfigRaw) {
    try { if (JSON.parse(j0ConfigRaw).active === false) j0Active = false } catch {}
  }

  if (!j0Active) {
    await supabase.from('scheduled_jobs').insert(followupJobs)
    return
  }

  const { prompt } = getTemplate('onboarding_j0', context_json)

  const manualAiResponse = isAuto ? undefined : templateToAiResponse(
    await getEmailTemplate(clientId, 'template_onboarding_j0', {
      nom: context_json.customer_name ?? context_json.student_name ?? '',
      prenom: context_json.student_name ?? '',
      email: context_json.customer_email ?? '',
      nom_formation: context_json.product_name ?? '',
      lien_acces: '',
    })
  )

  const { data: task, error: taskError } = await supabase
    .from('pending_tasks')
    .insert({
      client_id: clientId,
      task_type: 'onboarding_j0',
      context_json,
      prompt_template: prompt,
      ai_response: manualAiResponse,
      status: isAuto ? 'processing' : 'pending',
    })
    .select()
    .single()

  if (taskError) {
    console.error('[webhook] pending_task onboarding_j0 insert échoué:', taskError.message)
    return
  }

  await supabase.from('scheduled_jobs').insert(followupJobs)

  if (!isAuto || !task) return

  try {
    if (!context_json.customer_email) throw new Error('customer_email manquant')
    const aiResponse = await callClaude(prompt, 'claude-sonnet-4-6')
    const { subject, body_html } = parseClaudeResponse(aiResponse)
    const rawHtml = wrapEmailHtml(body_html, sender_name)
    let j0ConfigJson: Record<string, any> | undefined
    try { j0ConfigJson = configMap['template_onboarding_j0'] ? JSON.parse(configMap['template_onboarding_j0']) : undefined } catch { /* skip */ }
    const j0Vars = {
      nom: context_json.customer_name ?? context_json.student_name ?? '',
      prenom: context_json.student_name ?? '',
      email: context_json.customer_email,
      nom_formation: context_json.product_name ?? '',
      lien_acces: '',
    }
    const trackingToken = await sendEmailWithChannels({
      clientId,
      studentEmail: context_json.customer_email,
      configType: 'template_onboarding_j0',
      configJson: j0ConfigJson,
      templateVars: j0Vars,
      to: context_json.customer_email,
      subject,
      rawHtml,
      senderName: sender_name,
      replyTo: client?.email,
    })
    await supabase
      .from('pending_tasks')
      .update({ status: 'sent', ai_response: aiResponse, processed_at: new Date().toISOString() })
      .eq('id', task.id)
    await supabase.from('activity_logs').insert({
      client_id: clientId,
      action_type: 'onboarding_j0_email',
      payload_json: { subject, to: context_json.customer_email, tracking_id: trackingToken },
      status: 'sent',
    })
  } catch (err: any) {
    await supabase
      .from('pending_tasks')
      .update({ status: 'failed', ai_response: err.message })
      .eq('id', task.id)
    await supabase.from('activity_logs').insert({
      client_id: clientId,
      action_type: 'onboarding_j0_email',
      payload_json: { error: err.message, to: context_json.customer_email },
      status: 'failed',
    })
  }
}

async function handlePaymentRecovered(opts: { event: any; clientId: string }) {
  const { event, clientId } = opts
  const inv = event.data.object as any
  const customerEmail = inv.customer_email ?? inv.metadata?.customer_email ?? ''
  const amount = (inv.amount_paid ?? inv.amount_due ?? 0) / 100

  if (!customerEmail) return

  // Only log as recovery if there was a prior dunning attempt for this customer
  const { count } = await supabase
    .from('activity_logs')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .like('action_type', 'failed_payment%')
    .eq('status', 'sent')
    .contains('payload_json', { to: customerEmail })

  if (!count || count === 0) return

  await supabase.from('activity_logs').insert({
    client_id: clientId,
    action_type: 'payment_recovered',
    payload_json: { customer_email: customerEmail, amount },
    status: 'ok',
  })
  console.log(`[webhook] paiement récupéré pour ${customerEmail} — ${amount}€`)
}

async function handleCheckoutSessionExpired(opts: { event: any; clientId: string }) {
  const { event, clientId } = opts
  const session = event.data.object as any
  const customerEmail = session.customer_details?.email as string | undefined
  if (!customerEmail) return

  // Schedule 30 min from now — actual delivery depends on cron interval (max 60 min)
  const scheduledFor = new Date(Date.now() + 30 * 60 * 1000).toISOString()

  await supabase.from('scheduled_jobs').insert({
    client_id: clientId,
    job_type: 'checkout_abandon',
    context_json: {
      customer_email: customerEmail,
      customer_name: session.customer_details?.name ?? '',
      product_name: session.metadata?.product_name ?? '',
      checkout_url: session.url ?? '',
    },
    scheduled_for: scheduledFor,
    status: 'pending',
  })
  console.log(`[webhook] checkout_abandon planifié pour ${customerEmail}`)
}

async function handleCardExpUpdate(opts: { event: any; clientId: string }): Promise<void> {
  const { event, clientId } = opts
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
  let email: string | null = null
  let expMonth: number | null = null
  let expYear: number | null = null

  if (event.type === 'customer.updated') {
    const customer = event.data.object as any
    email = customer.email ?? null
    const pmId = customer.invoice_settings?.default_payment_method
    if (pmId && typeof pmId === 'string') {
      try {
        const pm = await stripe.paymentMethods.retrieve(pmId)
        expMonth = pm.card?.exp_month ?? null
        expYear  = pm.card?.exp_year  ?? null
      } catch { /* skip */ }
    }
  } else {
    // payment_method.updated
    const pm = event.data.object as any
    expMonth = pm.card?.exp_month ?? null
    expYear  = pm.card?.exp_year  ?? null
    const customerId = typeof pm.customer === 'string' ? pm.customer : null
    if (customerId) {
      try {
        const customer = await stripe.customers.retrieve(customerId)
        if ((customer as any).deleted) return
        email = (customer as any).email ?? null
      } catch { /* skip */ }
    }
  }

  if (!email || !expMonth || !expYear) return

  const cardExp = new Date(expYear, expMonth - 1, 1).toISOString()

  const { error } = await supabase
    .from('student_profiles')
    .upsert(
      { client_id: clientId, email: email.toLowerCase(), card_exp: cardExp, updated_at: new Date().toISOString() },
      { onConflict: 'client_id,email' }
    )
  if (error) console.error('[webhook] student_profiles upsert card_exp:', error.message)
  else console.log(`[webhook] card_exp mise à jour pour ${email} — expire ${expMonth}/${expYear}`)
}
