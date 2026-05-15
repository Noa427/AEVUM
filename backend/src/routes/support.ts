import { Router } from 'express'
import { supabase } from '../services/supabase'
import { decrypt } from '../services/encryption'
import { requireAuth } from '../middleware/auth'
import {
  buildPromptSupportClassify,
  buildPromptSupportAcces,
  buildPromptSupportRemboursement,
  buildPromptSupportTechnique,
  parseClaudeResponse,
  wrapEmailHtml,
  SupportCategory,
} from '../services/templates'
import { callClaude } from '../services/claude'
import { sendEmail } from '../services/resend'

export const supportRouter = Router()
supportRouter.use(requireAuth)

const VALID_CATEGORIES: SupportCategory[] = ['accès_formation', 'remboursement', 'technique', 'autre']

supportRouter.post('/inbound', async (req, res) => {
  const { from, subject, body, client_id } = req.body
  if (!from || !subject || !body || !client_id) {
    return res.status(400).json({ error: 'Champs requis : from, subject, body, client_id' })
  }

  const { data: client } = await supabase
    .from('clients')
    .select('id, email, name, auto_mode')
    .eq('id', client_id)
    .single()
  if (!client) return res.status(404).json({ error: 'Client introuvable' })

  const { data: configs } = await supabase
    .from('client_configs')
    .select('config_type, encrypted_value')
    .eq('client_id', client_id)

  const configMap: Record<string, string> = {}
  for (const c of configs ?? []) {
    try { configMap[c.config_type] = decrypt(c.encrypted_value) } catch { /* skip */ }
  }

  if (configMap['support_email_enabled'] !== 'true') {
    return res.status(403).json({ error: 'Support email non activé pour ce client' })
  }

  const sender_name = configMap['sender_name'] || 'Formateur'
  const support_auto_reply = configMap['support_auto_reply'] !== 'false'
  const politique_remboursement = configMap['politique_remboursement'] ?? null

  // Classify with Claude
  let category: SupportCategory = 'autre'
  try {
    const classifyPrompt = buildPromptSupportClassify({ from, subject, body })
    const raw = await callClaude(classifyPrompt, 'claude-haiku-4-5-20251001')
    const normalized = raw.trim().toLowerCase() as SupportCategory
    category = VALID_CATEGORIES.includes(normalized) ? normalized : 'autre'
  } catch (err: any) {
    console.error('[support] classify failed:', err.message)
    category = 'autre'
  }

  const base_ctx = { from, subject, body, sender_name, politique_remboursement }

  if (category === 'autre' || !support_auto_reply) {
    await supabase.from('pending_tasks').insert({
      client_id,
      task_type: 'support_manual',
      context_json: { ...base_ctx, category },
      prompt_template: null,
      status: 'pending',
    })
    await supabase.from('activity_logs').insert({
      client_id,
      action_type: 'support_manual',
      payload_json: { from, subject, category },
      status: 'pending',
    })
    return res.json({ ok: true, category, action: 'manual_task_created' })
  }

  // Auto-reply
  const promptFn =
    category === 'accès_formation' ? buildPromptSupportAcces :
    category === 'remboursement' ? buildPromptSupportRemboursement :
    buildPromptSupportTechnique

  try {
    const prompt = promptFn(base_ctx)
    const aiResponse = await callClaude(prompt, 'claude-sonnet-4-6')
    const { subject: replySubject, body_html } = parseClaudeResponse(aiResponse)
    const html = wrapEmailHtml(body_html, sender_name)

    await sendEmail({ to: from, subject: replySubject, html, sender_name, reply_to: client.email })

    await supabase.from('activity_logs').insert({
      client_id,
      action_type: `support_auto_${category.replace('accès_formation', 'acces')}`,
      payload_json: { from, subject, category, reply_subject: replySubject },
      status: 'sent',
    })

    res.json({ ok: true, category, action: 'auto_reply_sent' })
  } catch (err: any) {
    await supabase.from('activity_logs').insert({
      client_id,
      action_type: 'support_auto_error',
      payload_json: { from, subject, category, error: err.message },
      status: 'failed',
    })
    res.status(500).json({ error: err.message })
  }
})
