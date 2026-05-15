import { Router } from 'express'
import { supabase } from '../services/supabase'
import { requireAuth } from '../middleware/auth'
import { parseClaudeResponse, wrapEmailHtml } from '../services/templates'
import { callClaude } from '../services/claude'
import { sendEmail } from '../services/resend'
import { decrypt } from '../services/encryption'

export const tasksRouter = Router()
tasksRouter.use(requireAuth)

tasksRouter.get('/', async (req, res) => {
  const { status = 'pending', client_id, page = '1', limit = '20' } = req.query
  const pageNum = Math.max(1, parseInt(page as string) || 1)
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20))
  const from = (pageNum - 1) * limitNum

  let query = supabase
    .from('pending_tasks')
    .select('*, clients(name, email)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + limitNum - 1)

  if (status !== 'all') query = query.eq('status', status as string)
  if (client_id) query = query.eq('client_id', client_id as string)

  const { data, error, count } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json({ data, total: count ?? 0, page: pageNum, limit: limitNum })
})

tasksRouter.post('/:id/preview', async (req, res) => {
  const { data: task } = await supabase
    .from('pending_tasks')
    .select('*')
    .eq('id', req.params.id)
    .single()
  if (!task) return res.status(404).json({ error: 'Tâche introuvable' })

  const { data: client } = await supabase
    .from('clients')
    .select('auto_mode')
    .eq('id', task.client_id)
    .single()
  const isAuto = client?.auto_mode ?? true

  try {
    let aiResponse: string
    if (isAuto && task.prompt_template) {
      aiResponse = await callClaude(task.prompt_template, 'claude-sonnet-4-6')
      await supabase.from('pending_tasks').update({ ai_response: aiResponse }).eq('id', task.id)
    } else {
      const { ai_response } = req.body
      if (!ai_response) return res.status(400).json({ error: 'ai_response requis en mode manuel' })
      aiResponse = ai_response as string
    }
    const parsed = parseClaudeResponse(aiResponse)
    res.json(parsed)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

tasksRouter.post('/:id/send', async (req, res) => {
  const { subject, body_html, ai_response } = req.body
  if (!subject || !body_html) return res.status(400).json({ error: 'subject et body_html requis' })

  const { data: task } = await supabase
    .from('pending_tasks')
    .select('*, clients(name, email)')
    .eq('id', req.params.id)
    .single()
  if (!task) return res.status(404).json({ error: 'Tâche introuvable' })

  const { data: configs } = await supabase
    .from('client_configs')
    .select('config_type, encrypted_value')
    .eq('client_id', task.client_id)

  const configMap: Record<string, string> = {}
  for (const c of configs ?? []) configMap[c.config_type] = decrypt(c.encrypted_value)
  const sender_name = configMap['sender_name'] || 'Formateur'

  const ctx = task.context_json as Record<string, any>
  const customer_email = ctx.customer_email as string
  if (!customer_email) return res.status(400).json({ error: 'customer_email manquant dans context' })

  const html = wrapEmailHtml(body_html, sender_name)
  const action_type = `${task.task_type}_email`

  try {
    await sendEmail({ to: customer_email, subject, html, sender_name, reply_to: (task as any).clients?.email })
    await supabase
      .from('pending_tasks')
      .update({ status: 'sent', ai_response, processed_at: new Date().toISOString() })
      .eq('id', task.id)
    await supabase.from('activity_logs').insert({
      client_id: task.client_id,
      action_type,
      payload_json: { subject, to: customer_email, amount: ctx.amount },
      status: 'sent',
    })
    res.json({ ok: true })
  } catch (err: any) {
    await supabase.from('pending_tasks').update({ status: 'failed' }).eq('id', task.id)
    await supabase.from('activity_logs').insert({
      client_id: task.client_id,
      action_type,
      payload_json: { error: err.message, to: customer_email },
      status: 'failed',
    })
    res.status(500).json({ error: err.message })
  }
})
