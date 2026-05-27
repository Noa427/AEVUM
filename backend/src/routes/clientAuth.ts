import { Router } from 'express'
import argon2 from 'argon2'
import jwt from 'jsonwebtoken'
import { randomInt } from 'crypto'
import { supabase } from '../services/supabase'
import { encrypt, decrypt } from '../services/encryption'
import { authenticateClient } from '../middleware/authenticateClient'
import { loginLimiter, portalAuthLimiter, aiLimiter, forgotPasswordLimiter, portalLimiter } from '../middleware/rate-limit'
import { validate } from '../middleware/validate'
import { callClaudeChat } from '../services/claude'
import { parseClaudeResponse, wrapEmailHtml } from '../services/templates'
import { sendEmail } from '../services/resend'
import { getEmailTemplate } from '../utils/getEmailTemplate'
import {
  LoginSchema, PasswordSchema, EmailSchema, ConfigSchema,
  AutomationSchema, AutomationUpdateSchema, AiGenerateSchema, AiImproveSchema,
  ForgotPasswordSchema, ResetPasswordSchema,
  ALLOWED_CONFIG_TYPES, TestSendSchema, TEMPLATE_CONFIG_TYPES,
  PauseSchema, BlacklistAddSchema,
} from '../schemas/client'

export const clientAuthRouter = Router()

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function randomDelay() {
  await new Promise(resolve => setTimeout(resolve, randomInt(750, 1501)))
}

// POST /client/login
clientAuthRouter.post('/login', loginLimiter, validate(LoginSchema), async (req, res) => {
  const { email, password } = req.body

  const { data: client } = await supabase
    .from('clients')
    .select('id, client_email, password_hash')
    .eq('client_email', email.toLowerCase())
    .single()

  if (!client || !client.password_hash) {
    await randomDelay()
    return res.status(401).json({ error: 'Identifiants incorrects' })
  }

  const valid = await argon2.verify(client.password_hash, password)
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

// POST /client/forgot-password
clientAuthRouter.post('/forgot-password', forgotPasswordLimiter, validate(ForgotPasswordSchema), async (req, res) => {
  const { email } = req.body

  const { data: client } = await supabase
    .from('clients')
    .select('id, password_hash')
    .eq('client_email', email.toLowerCase())
    .single()

  // Toujours 200 — pas d'énumération d'emails
  if (!client?.password_hash) {
    await randomDelay()
    return res.json({ ok: true })
  }

  const token = jwt.sign(
    {
      purpose: 'password_reset',
      clientId: client.id,
      pwdFingerprint: client.password_hash.slice(-8),
    },
    process.env.JWT_SECRET!,
    { expiresIn: '1h' }
  )

  const resetUrl = `${process.env.VITRINE_URL}/client/reset-password?token=${token}`

  await sendEmail({
    to: email,
    subject: 'Réinitialisation de votre mot de passe AEVUM',
    html: `
      <p>Bonjour,</p>
      <p>Vous avez demandé la réinitialisation de votre mot de passe.</p>
      <p><a href="${resetUrl}">Réinitialiser mon mot de passe</a></p>
      <p>Ce lien expire dans 1 heure. Si vous n'avez pas fait cette demande, ignorez cet email.</p>
    `,
  })

  res.json({ ok: true })
})

// POST /client/reset-password
clientAuthRouter.post('/reset-password', validate(ResetPasswordSchema), async (req, res) => {
  const { token, newPassword } = req.body

  let payload: any
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET!)
  } catch {
    return res.status(400).json({ error: 'Lien invalide ou expiré' })
  }

  if (payload.purpose !== 'password_reset') {
    return res.status(400).json({ error: 'Lien invalide ou expiré' })
  }

  const { data: client } = await supabase
    .from('clients')
    .select('id, password_hash')
    .eq('id', payload.clientId)
    .single()

  if (!client?.password_hash) {
    return res.status(400).json({ error: 'Lien invalide ou expiré' })
  }

  // Auto-invalide si le mot de passe a déjà été changé
  if (client.password_hash.slice(-8) !== payload.pwdFingerprint) {
    return res.status(400).json({ error: 'Lien invalide ou expiré' })
  }

  const newHash = await argon2.hash(newPassword, ARGON2_OPTIONS)

  const { error: updateError } = await supabase
    .from('clients')
    .update({ password_hash: newHash, must_change_password: false })
    .eq('id', client.id)

  if (updateError) return res.status(500).json({ error: updateError.message })

  res.json({ ok: true })
})

// GET /client/me
clientAuthRouter.get('/me', authenticateClient, async (req, res) => {
  const clientId = (req as any).clientId

  const { data, error } = await supabase
    .from('clients')
    .select('client_email, must_change_password, created_at, paused_until')
    .eq('id', clientId)
    .single()

  if (error || !data) return res.status(404).json({ error: 'Client introuvable' })

  res.json({
    email: data.client_email,
    mustChangePassword: data.must_change_password,
    createdAt: data.created_at,
    pausedUntil: data.paused_until ?? null,
  })
})

// PUT /client/settings/password
clientAuthRouter.put('/settings/password', authenticateClient, validate(PasswordSchema), async (req, res) => {
  const clientId = (req as any).clientId
  const { currentPassword, newPassword } = req.body

  const { data, error } = await supabase
    .from('clients')
    .select('password_hash')
    .eq('id', clientId)
    .single()

  if (error || !data?.password_hash) return res.status(404).json({ error: 'Client introuvable' })

  const valid = await argon2.verify(data.password_hash, currentPassword)
  if (!valid) return res.status(401).json({ error: 'Mot de passe actuel incorrect' })

  const newHash = await argon2.hash(newPassword, ARGON2_OPTIONS)

  const { error: updateError } = await supabase
    .from('clients')
    .update({ password_hash: newHash, must_change_password: false })
    .eq('id', clientId)

  if (updateError) return res.status(500).json({ error: updateError.message })

  res.json({ ok: true })
})

// PUT /client/settings/email
clientAuthRouter.put('/settings/email', authenticateClient, validate(EmailSchema), async (req, res) => {
  const clientId = (req as any).clientId
  const { currentPassword, newEmail } = req.body

  const { data, error } = await supabase
    .from('clients')
    .select('password_hash')
    .eq('id', clientId)
    .single()

  if (error || !data?.password_hash) return res.status(404).json({ error: 'Client introuvable' })

  const valid = await argon2.verify(data.password_hash, currentPassword)
  if (!valid) return res.status(401).json({ error: 'Mot de passe actuel incorrect' })

  const normalizedEmail = newEmail.toLowerCase()

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
clientAuthRouter.post('/ai/generate', authenticateClient, aiLimiter, validate(AiGenerateSchema), async (req, res) => {
  const { emailType, formationName, tone, objective } = req.body

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
clientAuthRouter.post('/ai/improve', authenticateClient, aiLimiter, validate(AiImproveSchema), async (req, res) => {
  const { content, emailType } = req.body

  const userMessage = emailType ? `Type d'email : ${emailType}\n\n${content}` : content

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

// POST /client/automations/custom
clientAuthRouter.post('/automations/custom', authenticateClient, validate(AutomationSchema), async (req, res) => {
  const clientId = (req as any).clientId
  const { name, trigger_type, trigger_delay_days, trigger_date, subject, body } = req.body

  if (trigger_type === 'delay_after_purchase' && trigger_delay_days == null) {
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
clientAuthRouter.put('/automations/custom/:id', authenticateClient, validate(AutomationUpdateSchema), async (req, res) => {
  const clientId = (req as any).clientId
  const { id } = req.params

  if (!UUID_RE.test(String(id))) return res.status(400).json({ error: 'ID invalide' })

  const { data, error } = await supabase
    .from('custom_automations')
    .update(req.body)
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

  if (!UUID_RE.test(String(id))) return res.status(400).json({ error: 'ID invalide' })

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
clientAuthRouter.put('/configs', authenticateClient, validate(ConfigSchema), async (req, res) => {
  const clientId = (req as any).clientId
  const { config_type, value } = req.body

  const encrypted_value = encrypt(value)

  const { error } = await supabase
    .from('client_configs')
    .upsert({ client_id: clientId, config_type, encrypted_value }, { onConflict: 'client_id,config_type' })

  if (error) return res.status(500).json({ error: error.message })

  res.json({ success: true })
})

const TEST_VARS: Record<string, string> = {
  nom: 'Marie',
  prenom: 'Dupont',
  email: 'marie.dupont@exemple.com',
  nom_formation: 'Formation Excel Pro',
  lien_acces: 'https://exemple.com/acces',
  mot_de_passe: 'MotDeP4sse!',
  montant: '97',
  lien_paiement: 'https://stripe.com/pay/exemple',
}

// POST /client/test-send
clientAuthRouter.post('/test-send', authenticateClient, portalLimiter, validate(TestSendSchema), async (req, res) => {
  const clientId = (req as any).clientId as string
  const clientEmail = (req as any).clientEmail as string
  const { config_type } = req.body

  try {
    const { data: senderRow } = await supabase
      .from('client_configs')
      .select('encrypted_value')
      .eq('client_id', clientId)
      .eq('config_type', 'sender_name')
      .single()

    const senderName = senderRow?.encrypted_value
      ? (() => { try { return decrypt(senderRow.encrypted_value) } catch { return 'Test' } })()
      : 'Test'

    const tpl = await getEmailTemplate(clientId, config_type as any, TEST_VARS)
    const html = wrapEmailHtml(tpl.body.replace(/\n/g, '<br>'), senderName)

    await sendEmail({
      to: clientEmail,
      subject: `[TEST] ${tpl.subject}`,
      html,
      sender_name: senderName,
    })

    const { error: logError } = await supabase.from('activity_logs').insert({
      client_id: clientId,
      action_type: 'test_email_sent',
      payload_json: { config_type, to: clientEmail },
      status: 'sent',
    })
    if (logError) console.warn('[test-send] activity log insert failed:', logError.message)

    res.json({ success: true, message: `Email de test envoyé à ${clientEmail}` })
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// POST /client/pause
clientAuthRouter.post('/pause', authenticateClient, validate(PauseSchema), async (req, res) => {
  const clientId = (req as any).clientId as string
  const { days } = req.body

  const pausedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()

  const { error } = await supabase
    .from('clients')
    .update({ paused_until: pausedUntil })
    .eq('id', clientId)

  if (error) return res.status(500).json({ error: error.message })

  const { error: logError } = await supabase.from('activity_logs').insert({
    client_id: clientId,
    action_type: 'pause_enabled',
    payload_json: { days, paused_until: pausedUntil },
    status: 'ok',
  })
  if (logError) console.warn('[pause] activity log insert failed:', logError.message)

  res.json({ ok: true, pausedUntil })
})

// DELETE /client/pause
clientAuthRouter.delete('/pause', authenticateClient, async (req, res) => {
  const clientId = (req as any).clientId as string

  const { error } = await supabase
    .from('clients')
    .update({ paused_until: null })
    .eq('id', clientId)

  if (error) return res.status(500).json({ error: error.message })

  const { error: logError } = await supabase.from('activity_logs').insert({
    client_id: clientId,
    action_type: 'pause_disabled',
    payload_json: {},
    status: 'ok',
  })
  if (logError) console.warn('[pause] activity log insert failed:', logError.message)

  res.json({ ok: true })
})

// GET /client/blacklist
clientAuthRouter.get('/blacklist', authenticateClient, async (req, res) => {
  const clientId = (req as any).clientId as string

  const { data, error } = await supabase
    .from('client_blacklist')
    .select('email, reason, blacklisted_at')
    .eq('client_id', clientId)
    .order('blacklisted_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })

  res.json(data ?? [])
})

// POST /client/blacklist
clientAuthRouter.post('/blacklist', authenticateClient, validate(BlacklistAddSchema), async (req, res) => {
  const clientId = (req as any).clientId as string
  const { email, reason } = req.body

  const { error } = await supabase
    .from('client_blacklist')
    .insert({ client_id: clientId, email: email.toLowerCase(), reason: reason ?? null })

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Cet email est déjà blacklisté' })
    return res.status(500).json({ error: error.message })
  }

  const { error: logError } = await supabase.from('activity_logs').insert({
    client_id: clientId,
    action_type: 'blacklist_add',
    payload_json: { email: email.toLowerCase(), reason: reason ?? null },
    status: 'ok',
  })
  if (logError) console.warn('[blacklist] log insert failed:', logError.message)

  res.status(201).json({ ok: true })
})

// DELETE /client/blacklist/:email
clientAuthRouter.delete('/blacklist/:email', authenticateClient, async (req, res) => {
  const clientId = (req as any).clientId as string
  const email = decodeURIComponent(req.params.email).toLowerCase()

  const { error, count } = await supabase
    .from('client_blacklist')
    .delete({ count: 'exact' })
    .eq('client_id', clientId)
    .eq('email', email)

  if (error) return res.status(500).json({ error: error.message })
  if (count === 0) return res.status(404).json({ error: 'Email introuvable dans la blacklist' })

  const { error: logError } = await supabase.from('activity_logs').insert({
    client_id: clientId,
    action_type: 'blacklist_remove',
    payload_json: { email },
    status: 'ok',
  })
  if (logError) console.warn('[blacklist] log insert failed:', logError.message)

  res.json({ ok: true })
})
