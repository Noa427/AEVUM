// backend/src/routes/tasks.ts
import { Router } from 'express'
import { supabase } from '../services/supabase'
import { requireAuth } from '../middleware/auth'
import { parseClaudeResponse, wrapEmailHtml } from '../services/templates'
import { sendEmail } from '../services/resend'
import { decrypt } from '../services/encryption'

export const tasksRouter = Router()
tasksRouter.use(requireAuth)

tasksRouter.get('/', async (_req, res) => {
  const { data, error } = await supabase
    .from('pending_tasks')
    .select('*, clients(name, email)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

tasksRouter.post('/:id/preview', async (req, res) => {
  const { ai_response } = req.body
  if (!ai_response) return res.status(400).json({ error: 'ai_response requis' })
  try {
    const parsed = parseClaudeResponse(ai_response)
    res.json(parsed)
  } catch {
    res.status(400).json({ error: 'Format de réponse invalide' })
  }
})

tasksRouter.post('/:id/send', async (req, res) => {
  const { subject, body_html, ai_response } = req.body
  if (!subject || !body_html) return res.status(400).json({ error: 'subject et body_html requis' })

  const { data: task, error: taskError } = await supabase
    .from('pending_tasks')
    .select('*, clients(email)')
    .eq('id', req.params.id)
    .single()
  if (taskError || !task) return res.status(404).json({ error: 'Tâche introuvable' })

  const { data: configs } = await supabase
    .from('client_configs')
    .select('config_type, encrypted_value')
    .eq('client_id', task.client_id)

  const configMap: Record<string, string> = {}
  for (const c of configs ?? []) configMap[c.config_type] = decrypt(c.encrypted_value)
  const sender_name = configMap['sender_name'] || 'Formateur'

  const customer_email = (task.context_json as any).customer_email as string
  const html = wrapEmailHtml(body_html, sender_name)

  try {
    await sendEmail({ to: customer_email, subject, html, reply_to: (task as any).clients?.email })
    await supabase
      .from('pending_tasks')
      .update({ status: 'sent', ai_response, processed_at: new Date().toISOString() })
      .eq('id', task.id)
    await supabase.from('activity_logs').insert({
      client_id: task.client_id,
      action_type: 'failed_payment_email',
      payload_json: { subject, to: customer_email },
      status: 'sent',
    })
    res.json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})
