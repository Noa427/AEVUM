import { Router } from 'express'
import { supabase } from '../services/supabase'
import { requireAuth } from '../middleware/auth'
import { buildPromptFailedPayment, getTemplate } from '../services/templates'
import { decrypt } from '../services/encryption'

export const simulateRouter = Router()
simulateRouter.use(requireAuth)

simulateRouter.post('/', async (req, res) => {
  const { client_id, event_type = 'failed_payment', custom_data } = req.body
  if (!client_id) return res.status(400).json({ error: 'client_id requis' })
  if (!['failed_payment', 'checkout_completed'].includes(event_type)) {
    return res.status(400).json({ error: 'event_type invalide (failed_payment | checkout_completed)' })
  }

  const { data: configs } = await supabase
    .from('client_configs')
    .select('config_type, encrypted_value')
    .eq('client_id', client_id)

  const configMap: Record<string, string> = {}
  for (const c of configs ?? []) {
    try { configMap[c.config_type] = decrypt(c.encrypted_value) } catch { /* skip malformed */ }
  }
  const sender_name = configMap['sender_name'] || 'Formateur'

  let task_type: string
  let context_json: Record<string, any>
  let prompt_template: string

  if (event_type === 'failed_payment') {
    const base = {
      amount: 197,
      currency: 'eur',
      customer_email: 'test@example.com',
      hosted_invoice_url: 'https://pay.stripe.com/simulated',
      payment_link: 'https://pay.stripe.com/simulated',
      sender_name,
      simulated: true,
    }
    context_json = { ...base, ...(custom_data ?? {}) }
    task_type = 'failed_payment'
    prompt_template = buildPromptFailedPayment(context_json)
  } else {
    const base = {
      amount: 297,
      currency: 'eur',
      customer_email: 'test@example.com',
      customer_name: 'Élève Test',
      student_name: 'Élève Test',
      payment_intent_id: 'pi_simulated',
      sender_name,
      simulated: true,
    }
    context_json = { ...base, ...(custom_data ?? {}) }
    task_type = 'onboarding_j0'
    prompt_template = getTemplate('onboarding_j0', context_json).prompt
  }

  const { data, error } = await supabase
    .from('pending_tasks')
    .insert({ client_id, task_type, context_json, prompt_template, status: 'pending' })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})
