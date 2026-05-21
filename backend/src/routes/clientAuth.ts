import { Router } from 'express'
import argon2 from 'argon2'
import jwt from 'jsonwebtoken'
import { randomInt } from 'crypto'
import { supabase } from '../services/supabase'
import { encrypt, decrypt } from '../services/encryption'
import { authenticateClient } from '../middleware/authenticateClient'
import { portalAuthLimiter, aiLimiter } from '../middleware/rate-limit'
import { callClaudeChat } from '../services/claude'
import { parseClaudeResponse } from '../services/templates'

const ALLOWED_CONFIG_TYPES = [
  'sender_name',
  'template_onboarding_j0',
  'template_onboarding_j3',
  'template_onboarding_j7',
  'template_failed_payment',
  'upsell_enabled',
  'upsell_product_name',
  'upsell_url',
  'upsell_price',
  'support_email_enabled',
  'support_auto_reply',
  'politique_remboursement',
] as const

export const clientAuthRouter = Router()

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
}

async function randomDelay() {
  await new Promise(resolve => setTimeout(resolve, randomInt(750, 1501)))
}

// POST /client/login
clientAuthRouter.post('/login', portalAuthLimiter, async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) {
    await randomDelay()
    return res.status(401).json({ error: 'Identifiants incorrects' })
  }

  const { data: client } = await supabase
    .from('clients')
    .select('id, client_email, password_hash')
    .eq('client_email', (email as string).toLowerCase())
    .single()

  if (!client || !client.password_hash) {
    await randomDelay()
    return res.status(401).json({ error: 'Identifiants incorrects' })
  }

  const valid = await argon2.verify(client.password_hash, password as string)
  if (!valid) {
    await randomDelay()
    return res.status(401).json({ error: 'Identifiants incorrects' })
  }

  const token = jwt.sign(
    { clientId: client.id, email: client.client_email },
    process.env.JWT_SECRET!,
    { expiresIn: '7d' }
  )

  res.json({ token })
})

// GET /client/me
clientAuthRouter.get('/me', authenticateClient, async (req, res) => {
  const clientId = (req as any).clientId

  const { data, error } = await supabase
    .from('clients')
    .select('client_email, must_change_password, created_at')
    .eq('id', clientId)
    .single()

  if (error || !data) return res.status(404).json({ error: 'Client introuvable' })

  res.json({
    email: data.client_email,
    mustChangePassword: data.must_change_password,
    createdAt: data.created_at,
  })
})

// PUT /client/settings/password
clientAuthRouter.put('/settings/password', authenticateClient, async (req, res) => {
  const clientId = (req as any).clientId
  const { currentPassword, newPassword } = req.body

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Champs requis manquants' })
  }

  const { data, error } = await supabase
    .from('clients')
    .select('password_hash')
    .eq('id', clientId)
    .single()

  if (error || !data?.password_hash) return res.status(404).json({ error: 'Client introuvable' })

  const valid = await argon2.verify(data.password_hash, currentPassword as string)
  if (!valid) return res.status(401).json({ error: 'Mot de passe actuel incorrect' })

  const newHash = await argon2.hash(newPassword as string, ARGON2_OPTIONS)

  const { error: updateError } = await supabase
    .from('clients')
    .update({ password_hash: newHash, must_change_password: false })
    .eq('id', clientId)

  if (updateError) return res.status(500).json({ error: updateError.message })

  res.json({ ok: true })
})

// PUT /client/settings/email
clientAuthRouter.put('/settings/email', authenticateClient, async (req, res) => {
  const clientId = (req as any).clientId
  const { currentPassword, newEmail } = req.body

  if (!currentPassword || !newEmail) {
    return res.status(400).json({ error: 'Champs requis manquants' })
  }

  const { data, error } = await supabase
    .from('clients')
    .select('password_hash')
    .eq('id', clientId)
    .single()

  if (error || !data?.password_hash) return res.status(404).json({ error: 'Client introuvable' })

  const valid = await argon2.verify(data.password_hash, currentPassword as string)
  if (!valid) return res.status(401).json({ error: 'Mot de passe actuel incorrect' })

  const normalizedEmail = (newEmail as string).toLowerCase()

  const { data: existing } = await supabase
    .from('clients')
    .select('id')
    .eq('client_email', normalizedEmail)
    .single()

  if (existing) return res.status(409).json({ error: 'Cet email est déjà utilisé' })

  const { error: updateError } = await supabase
    .from('clients')
    .update({ client_email: normalizedEmail })
    .eq('id', clientId)

  if (updateError) return res.status(500).json({ error: updateError.message })

  res.json({ ok: true })
})

// GET /client/automations
clientAuthRouter.get('/automations', authenticateClient, async (req, res) => {
  const clientId = (req as any).clientId

  const { data, error } = await supabase
    .from('client_configs')
    .select('config_type, encrypted_value')
    .eq('client_id', clientId)

  if (error) return res.status(500).json({ error: error.message })

  const types = new Set((data ?? []).map((c: { config_type: string }) => c.config_type))
  const senderRow = (data ?? []).find((c: { config_type: string; encrypted_value: string }) => c.config_type === 'sender_name')
  let senderName = ''
  if (senderRow) {
    try { senderName = decrypt(senderRow.encrypted_value) } catch { /* skip */ }
  }

  res.json({
    onboarding: types.has('template_onboarding_j0'),
    recouvrement: types.has('stripe_webhook_secret'),
    support: types.has('support_email_enabled'),
    upsell: types.has('upsell_enabled'),
    senderName,
  })
})

// GET /client/history
clientAuthRouter.get('/history', authenticateClient, async (req, res) => {
  const clientId = (req as any).clientId
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200)
  const offset = parseInt(req.query.offset as string) || 0

  const { data, error } = await supabase
    .from('activity_logs')
    .select('id, action_type, payload_json, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return res.status(500).json({ error: error.message })

  res.json(
    (data ?? []).map((row: { id: string; action_type: string; payload_json: Record<string, unknown>; created_at: string }) => ({
      id: row.id,
      action: row.action_type,
      details: row.payload_json,
      created_at: row.created_at,
    }))
  )
})

// GET /client/stats
clientAuthRouter.get('/stats', authenticateClient, async (req, res) => {
  const clientId = (req as any).clientId
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)
  const monthTs = startOfMonth.toISOString()

  const base = () => supabase.from('activity_logs').select('*', { count: 'exact', head: true }).eq('client_id', clientId)

  const [total, monthly, onboarding, relances, upsells] = await Promise.all([
    base(),
    base().gte('created_at', monthTs),
    base().like('action_type', '%onboarding%'),
    base().or('action_type.like.%payment%,action_type.like.%relance%'),
    base().like('action_type', '%upsell%'),
  ])

  const err = total.error ?? monthly.error ?? onboarding.error ?? relances.error ?? upsells.error
  if (err) return res.status(500).json({ error: err.message })

  res.json({
    total_emails: total.count ?? 0,
    ce_mois: monthly.count ?? 0,
    onboarding_envoyes: onboarding.count ?? 0,
    relances_envoyees: relances.count ?? 0,
    upsells_envoyes: upsells.count ?? 0,
  })
})

// GET /client/configs
clientAuthRouter.get('/configs', authenticateClient, async (req, res) => {
  const clientId = (req as any).clientId

  const { data, error } = await supabase
    .from('client_configs')
    .select('config_type, encrypted_value')
    .eq('client_id', clientId)

  if (error) return res.status(500).json({ error: error.message })

  const result = (data ?? []).flatMap((c: { config_type: string; encrypted_value: string }) => {
    try {
      return [{ config_type: c.config_type, value: decrypt(c.encrypted_value) }]
    } catch {
      return []
    }
  })

  res.json(result)
})

const VALID_EMAIL_TYPES = ['onboarding_j0', 'onboarding_j3', 'onboarding_j7', 'failed_payment'] as const
type EmailType = typeof VALID_EMAIL_TYPES[number]

const AI_GENERATE_SYSTEM = `Tu es un expert en email marketing pour infopreneurs francophones.
Génère un email professionnel et chaleureux, maximum 150 mots.
Utilise les variables {{nom}}, {{prenom}}, {{nom_formation}}, {{lien_acces}} là où c'est pertinent.

Format de ta réponse (OBLIGATOIRE) :
[SUBJECT]Objet de l'email[/SUBJECT]

Corps de l'email en texte brut.`

const AI_IMPROVE_SYSTEM = `Tu es un expert en email marketing pour infopreneurs francophones.
Améliore cet email : rends-le plus engageant, chaleureux et professionnel.
Conserve le sens et les variables ({{nom}}, {{prenom}}, {{nom_formation}}, {{lien_acces}}).
Maximum 150 mots. Retourne uniquement l'email amélioré.

Format de ta réponse (OBLIGATOIRE) :
[SUBJECT]Objet de l'email[/SUBJECT]

Corps de l'email en texte brut.`

// POST /client/ai/generate
clientAuthRouter.post('/ai/generate', authenticateClient, aiLimiter, async (req, res) => {
  const { emailType, formationName, tone, objective } = req.body

  if (!emailType || !formationName) {
    return res.status(400).json({ error: 'emailType et formationName requis' })
  }
  if (!(VALID_EMAIL_TYPES as readonly string[]).includes(emailType)) {
    return res.status(400).json({ error: `emailType invalide. Valeurs : ${VALID_EMAIL_TYPES.join(', ')}` })
  }

  const userMessage = [
    `Type d'email : ${emailType}`,
    `Formation : "${formationName}"`,
    `Ton : ${tone || 'chaleureux et professionnel'}`,
    `Objectif : ${objective || 'engager et rassurer le destinataire'}`,
  ].join('\n')

  try {
    const raw = await callClaudeChat(userMessage, AI_GENERATE_SYSTEM, 'claude-haiku-4-5-20251001')
    const { subject, body_html } = parseClaudeResponse(raw)
    res.json({ subject, body: body_html })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// POST /client/ai/improve
clientAuthRouter.post('/ai/improve', authenticateClient, aiLimiter, async (req, res) => {
  const { content, emailType } = req.body

  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'content requis' })
  }

  const userMessage = emailType
    ? `Type d'email : ${emailType}\n\n${content}`
    : content

  try {
    const raw = await callClaudeChat(userMessage, AI_IMPROVE_SYSTEM, 'claude-haiku-4-5-20251001')
    const { subject, body_html } = parseClaudeResponse(raw)
    res.json({ subject, body: body_html })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// GET /client/automations/custom
clientAuthRouter.get('/automations/custom', authenticateClient, async (req, res) => {
  const clientId = (req as any).clientId

  const { data, error } = await supabase
    .from('custom_automations')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })

  res.json(data ?? [])
})

const VALID_TRIGGER_TYPES = ['delay_after_purchase', 'specific_date', 'payment_failed', 'manual'] as const

// POST /client/automations/custom
clientAuthRouter.post('/automations/custom', authenticateClient, async (req, res) => {
  const clientId = (req as any).clientId
  const { name, trigger_type, trigger_delay_days, trigger_date, subject, body } = req.body

  if (!name || !trigger_type || !subject || !body) {
    return res.status(400).json({ error: 'name, trigger_type, subject, body requis' })
  }

  if (!(VALID_TRIGGER_TYPES as readonly string[]).includes(trigger_type)) {
    return res.status(400).json({ error: `trigger_type invalide. Valeurs : ${VALID_TRIGGER_TYPES.join(', ')}` })
  }

  if (trigger_type === 'delay_after_purchase' && (trigger_delay_days == null || typeof trigger_delay_days !== 'number')) {
    return res.status(400).json({ error: 'trigger_delay_days requis pour delay_after_purchase' })
  }

  if (trigger_type === 'specific_date' && !trigger_date) {
    return res.status(400).json({ error: 'trigger_date requis pour specific_date' })
  }

  const { data, error } = await supabase
    .from('custom_automations')
    .insert({ client_id: clientId, name, trigger_type, trigger_delay_days, trigger_date, subject, body })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })

  res.status(201).json(data)
})

// PUT /client/automations/custom/:id
clientAuthRouter.put('/automations/custom/:id', authenticateClient, async (req, res) => {
  const clientId = (req as any).clientId
  const { id } = req.params
  const { name, trigger_type, trigger_delay_days, trigger_date, subject, body, active } = req.body

  const updates: Record<string, any> = {}
  if (name !== undefined) updates.name = name
  if (trigger_type !== undefined) updates.trigger_type = trigger_type
  if (trigger_delay_days !== undefined) updates.trigger_delay_days = trigger_delay_days
  if (trigger_date !== undefined) updates.trigger_date = trigger_date
  if (subject !== undefined) updates.subject = subject
  if (body !== undefined) updates.body = body
  if (active !== undefined) updates.active = active

  const { data, error } = await supabase
    .from('custom_automations')
    .update(updates)
    .eq('id', id)
    .eq('client_id', clientId)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  if (!data) return res.status(404).json({ error: 'Automation introuvable ou accès refusé' })

  res.json(data)
})

// DELETE /client/automations/custom/:id
clientAuthRouter.delete('/automations/custom/:id', authenticateClient, async (req, res) => {
  const clientId = (req as any).clientId
  const { id } = req.params

  const { error, count } = await supabase
    .from('custom_automations')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('client_id', clientId)

  if (error) return res.status(500).json({ error: error.message })
  if (count === 0) return res.status(404).json({ error: 'Automation introuvable ou accès refusé' })

  res.json({ ok: true })
})

// PUT /client/configs
clientAuthRouter.put('/configs', authenticateClient, async (req, res) => {
  const clientId = (req as any).clientId
  const { config_type, value } = req.body

  if (!config_type || typeof value !== 'string') {
    return res.status(400).json({ error: 'config_type et value requis' })
  }

  if (!(ALLOWED_CONFIG_TYPES as readonly string[]).includes(config_type)) {
    return res.status(400).json({ error: `config_type non autorisé : ${config_type}` })
  }

  const encrypted_value = encrypt(value)

  const { error } = await supabase
    .from('client_configs')
    .upsert({ client_id: clientId, config_type, encrypted_value }, { onConflict: 'client_id,config_type' })

  if (error) return res.status(500).json({ error: error.message })

  res.json({ success: true })
})
