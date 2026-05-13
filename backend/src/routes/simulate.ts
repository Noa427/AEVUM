// backend/src/routes/simulate.ts
import { Router } from 'express'
import { supabase } from '../services/supabase'
import { requireAuth } from '../middleware/auth'
import { buildPrompt } from '../services/templates'
import { decrypt } from '../services/encryption'

export const simulateRouter = Router()
simulateRouter.use(requireAuth)

simulateRouter.post('/', async (req, res) => {
  const { client_id, amount = 197, student_name, product_name } = req.body
  if (!client_id) return res.status(400).json({ error: 'client_id requis' })

  const { data: configs } = await supabase
    .from('client_configs')
    .select('config_type, encrypted_value')
    .eq('client_id', client_id)

  const configMap: Record<string, string> = {}
  for (const c of configs ?? []) configMap[c.config_type] = decrypt(c.encrypted_value)

  const sender_name = configMap['sender_name'] || 'Formateur'
  const payment_link = 'https://example.com/pay'
  const prompt_template = buildPrompt({ sender_name, amount, payment_link, student_name, product_name })
  const context_json = {
    amount,
    customer_email: 'test@example.com',
    payment_link,
    student_name,
    product_name,
    simulated: true,
  }

  const { data, error } = await supabase
    .from('pending_tasks')
    .insert({
      client_id,
      task_type: 'failed_payment',
      context_json,
      prompt_template,
      status: 'pending',
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})
