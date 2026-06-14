import { Router } from 'express'
import argon2 from 'argon2'
import jwt from 'jsonwebtoken'
import { randomInt } from 'crypto'
import { supabase } from '../services/supabase'
import { encrypt, decrypt } from '../services/encryption'
import { authenticateClient } from '../middleware/authenticateClient'
import { planGate, checkGate, getClientOptions } from '../middleware/planGate'
import { loginLimiter, aiLimiter, forgotPasswordLimiter, portalLimiter } from '../middleware/rate-limit'
import { validate } from '../middleware/validate'
import { callClaudeChat } from '../services/claude'
import { parseClaudeResponse, wrapEmailHtml } from '../services/templates'
import { sendEmail } from '../services/resend'
import { validateWhatsApp } from '../services/whatsapp'
import { sendVocalRecovery } from '../services/vocal'
import { getEmailTemplate } from '../utils/getEmailTemplate'
import { insertTrackingRow } from '../utils/tracking'
import { maskEmail } from '../utils/maskEmail'
import {
  LoginSchema, PasswordSchema, EmailSchema, ConfigSchema,
  AutomationSchema, AutomationUpdateSchema, AiGenerateSchema, AiImproveSchema,
  ForgotPasswordSchema, ResetPasswordSchema,
  ALLOWED_CONFIG_TYPES, TestSendSchema, TEMPLATE_CONFIG_TYPES,
  PauseSchema, BlacklistAddSchema, ManualSendSchema,
  FormationSchema, FormationUpdateSchema,
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

async function getFormationContext(
  clientId: string,
  req: any
): Promise<{ formationId: string | null; unauthorized: boolean }> {
  const headerValue = req.headers['x-formation-id'] as string | undefined

  if (headerValue) {
    if (!UUID_RE.test(headerValue)) return { formationId: null, unauthorized: true }
    const { data } = await supabase
      .from('formations')
      .select('id')
      .eq('id', headerValue)
      .eq('client_id', clientId)
      .single()
    if (!data) return { formationId: null, unauthorized: true }
    return { formationId: data.id, unauthorized: false }
  }

  const { data } = await supabase
    .from('formations')
    .select('id')
    .eq('client_id', clientId)
    .order('created_at', { ascending: true })
    .limit(1)
    .single()
  return { formationId: data?.id ?? null, unauthorized: false }
}

// POST /client/login
clientAuthRouter.post('/login', loginLimiter, validate(LoginSchema), async (req, res) => {
  const { email, password } = req.body

  const { data: client } = await supabase
    .from('clients')
    .select('id, client_email, password_hash, token_version')
    .eq('client_email', email.toLowerCase())
    .single()

  if (!client || !client.password_hash) {
    await randomDelay()
    console.warn(`[auth] login échoué — email introuvable: ${maskEmail(email.toLowerCase())}`)
    return res.status(401).json({ error: 'Identifiants incorrects' })
  }

  const valid = await argon2.verify(client.password_hash, password)
  if (!valid) {
    await randomDelay()
    console.warn(`[auth] login échoué — mauvais mot de passe: ${maskEmail(email.toLowerCase())}`)
    return res.status(401).json({ error: 'Identifiants incorrects' })
  }

  const token = jwt.sign(
    { clientId: client.id, email: client.client_email, tv: client.token_version ?? 0 },
    process.env.JWT_SECRET!,
    { algorithm: 'HS256', expiresIn: '7d' }
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

  // Nouvelle demande → on réarme le verrou used_at pour autoriser ce nouveau token
  await supabase.from('clients').update({ password_reset_used_at: null }).eq('id', client.id)

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
clientAuthRouter.post('/reset-password', forgotPasswordLimiter, validate(ResetPasswordSchema), async (req, res) => {
  const { token, newPassword } = req.body

  let payload: any
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET!, { algorithms: ['HS256'] })
  } catch {
    return res.status(400).json({ error: 'Lien invalide ou expiré' })
  }

  if (payload.purpose !== 'password_reset') {
    return res.status(400).json({ error: 'Lien invalide ou expiré' })
  }

  const { data: client } = await supabase
    .from('clients')
    .select('id, password_hash, token_version, password_reset_used_at')
    .eq('id', payload.clientId)
    .single()

  if (!client?.password_hash) {
    return res.status(400).json({ error: 'Lien invalide ou expiré' })
  }

  // Auto-invalide si le mot de passe a déjà été changé
  if (client.password_hash.slice(-8) !== payload.pwdFingerprint) {
    return res.status(400).json({ error: 'Lien invalide ou expiré' })
  }

  if (client.password_reset_used_at) {
    return res.status(400).json({ error: 'TOKEN_ALREADY_USED' })
  }

  const newHash = await argon2.hash(newPassword, ARGON2_OPTIONS)

  const { error: updateError } = await supabase
    .from('clients')
    .update({
      password_hash: newHash,
      must_change_password: false,
      token_version: (client.token_version ?? 0) + 1,
      password_reset_used_at: new Date().toISOString(),
    })
    .eq('id', client.id)

  if (updateError) return res.status(500).json({ error: updateError.message })

  res.json({ ok: true })
})

// GET /client/me
clientAuthRouter.get('/me', authenticateClient, async (req, res) => {
  const clientId = (req as any).clientId

  const { data, error } = await supabase
    .from('clients')
    .select('client_email, must_change_password, created_at, paused_until, whatsapp_active, plan')
    .eq('id', clientId)
    .single()

  if (error || !data) return res.status(404).json({ error: 'Client introuvable' })

  const options = await getClientOptions(clientId)

  res.json({
    email: data.client_email,
    mustChangePassword: data.must_change_password,
    createdAt: data.created_at,
    pausedUntil: data.paused_until ?? null,
    whatsappConnected: data.whatsapp_active ?? false,
    plan: data.plan ?? 'standard',
    option_checkout: options.option_checkout,
    option_vocal: options.option_vocal,
    option_notaire: options.option_notaire,
  })
})

// PUT /client/settings/password
clientAuthRouter.put('/settings/password', authenticateClient, validate(PasswordSchema), async (req, res) => {
  const clientId = (req as any).clientId
  const { currentPassword, newPassword } = req.body

  const { data, error } = await supabase
    .from('clients')
    .select('password_hash, token_version')
    .eq('id', clientId)
    .single()

  if (error || !data?.password_hash) return res.status(404).json({ error: 'Client introuvable' })

  const valid = await argon2.verify(data.password_hash, currentPassword)
  if (!valid) return res.status(401).json({ error: 'Mot de passe actuel incorrect' })

  const newHash = await argon2.hash(newPassword, ARGON2_OPTIONS)

  const { error: updateError } = await supabase
    .from('clients')
    .update({ password_hash: newHash, must_change_password: false, token_version: (data.token_version ?? 0) + 1 })
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

// POST /client/settings/whatsapp
clientAuthRouter.post('/settings/whatsapp', authenticateClient, async (req, res) => {
  const clientId = (req as any).clientId as string
  const { phone_number_id, access_token } = req.body ?? {}

  if (!phone_number_id || !access_token) {
    return res.status(400).json({ error: 'phone_number_id et access_token requis' })
  }

  try {
    const { phone_number } = await validateWhatsApp(phone_number_id as string, access_token as string)

    const { error } = await supabase
      .from('clients')
      .update({
        whatsapp_phone_number_id: phone_number_id,
        whatsapp_access_token: encrypt(access_token as string),
        whatsapp_active: true,
      })
      .eq('id', clientId)

    if (error) return res.status(500).json({ error: error.message })

    res.json({ success: true, phone_number })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// DELETE /client/settings/whatsapp
clientAuthRouter.delete('/settings/whatsapp', authenticateClient, async (req, res) => {
  const clientId = (req as any).clientId as string

  const { error } = await supabase
    .from('clients')
    .update({
      whatsapp_phone_number_id: null,
      whatsapp_access_token: null,
      whatsapp_active: false,
    })
    .eq('id', clientId)

  if (error) return res.status(500).json({ error: error.message })
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
    recouvrement: types.has('template_failed_payment_j1'),
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
  const clientId = (req as any).clientId as string
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)
  const monthTs = startOfMonth.toISOString()

  const base = () => supabase.from('activity_logs').select('*', { count: 'exact', head: true }).eq('client_id', clientId)

  const [total, monthly, onboarding, relances, upsells, recoveredRows] = await Promise.all([
    base(),
    base().gte('created_at', monthTs),
    base().like('action_type', '%onboarding%'),
    base().or('action_type.like.%payment%,action_type.like.%relance%'),
    base().like('action_type', '%upsell%'),
    supabase
      .from('activity_logs')
      .select('payload_json')
      .eq('client_id', clientId)
      .eq('action_type', 'payment_recovered')
      .gte('created_at', monthTs),
  ])

  const err = total.error ?? monthly.error ?? onboarding.error ?? relances.error ?? upsells.error ?? recoveredRows.error
  if (err) return res.status(500).json({ error: err.message })

  // dunning sent this month (j1/j3/j7)
  const { count: dunningCount } = await supabase
    .from('activity_logs')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .like('action_type', 'failed_payment%')
    .eq('status', 'sent')
    .gte('created_at', monthTs)

  const recouvrements = recoveredRows.data ?? []
  const montantRecupere = recouvrements.reduce(
    (sum: number, r: any) => sum + ((r.payload_json as any)?.amount ?? 0),
    0
  )
  const recoveredCount = recouvrements.length
  const totalDunning = dunningCount ?? 0
  const taux = totalDunning > 0 ? Math.round((recoveredCount / totalDunning) * 100) : 0

  // Tracking — 30 derniers jours
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const tBase = () =>
    supabase.from('email_tracking').select('id', { count: 'exact', head: true })
      .eq('client_id', clientId).gte('sent_at', thirtyDaysAgo)
  const [tSent, tOpened, tClicked] = await Promise.all([
    tBase(),
    tBase().not('opened_at', 'is', null),
    tBase().not('clicked_at', 'is', null),
  ])
  const sent30 = tSent.count ?? 0
  const opened = tOpened.count ?? 0
  const clicked = tClicked.count ?? 0

  res.json({
    total_emails: total.count ?? 0,
    ce_mois: monthly.count ?? 0,
    onboarding_envoyes: onboarding.count ?? 0,
    relances_envoyees: relances.count ?? 0,
    upsells_envoyes: upsells.count ?? 0,
    recouvrement_montant_recupere: Math.round(montantRecupere * 100) / 100,
    recouvrement_taux: Math.min(taux, 100),
    emails_opened: opened,
    emails_clicked: clicked,
    open_rate_this_month: sent30 > 0 ? Math.round((opened / sent30) * 100) : 0,
    click_rate_this_month: sent30 > 0 ? Math.round((clicked / sent30) * 100) : 0,
  })
})

// GET /client/configs
clientAuthRouter.get('/configs', authenticateClient, async (req, res) => {
  const clientId = (req as any).clientId

  const { formationId, unauthorized } = await getFormationContext(clientId, req)
  if (unauthorized) return res.status(403).json({ error: 'Formation introuvable ou accès refusé' })

  let cfgQuery = supabase
    .from('client_configs')
    .select('config_type, encrypted_value')
    .eq('client_id', clientId)
  cfgQuery = formationId
    ? cfgQuery.or(`formation_id.eq.${formationId},formation_id.is.null`)
    : cfgQuery.is('formation_id', null)
  const { data, error } = await cfgQuery

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

const PROMPT_INJECTION_RE = /ignore (?:all )?previous instructions|forget your instructions|you are now|system\s*:|<\|im_start\|>/gi

// Retire les séquences connues de prompt injection et logue une alerte si détecté — ne bloque pas la requête
function sanitizeAiInput(text: string, clientId: string): string
function sanitizeAiInput(text: string | undefined, clientId: string): string | undefined
function sanitizeAiInput(text: string | undefined, clientId: string): string | undefined {
  if (!text) return text
  let detected = false
  const cleaned = text.replace(PROMPT_INJECTION_RE, () => { detected = true; return '' })
  if (detected) console.warn(`[ai] tentative de prompt injection détectée — clientId: ${clientId}`)
  return cleaned
}

// POST /client/ai/generate
clientAuthRouter.post('/ai/generate', authenticateClient, aiLimiter, validate(AiGenerateSchema), async (req, res) => {
  const { emailType } = req.body
  const clientId = (req as any).clientId as string
  const formationName = sanitizeAiInput(req.body.formationName, clientId)
  const tone = sanitizeAiInput(req.body.tone, clientId)
  const objective = sanitizeAiInput(req.body.objective, clientId)

  const userMessage = [
    `Type d'email : ${emailType}`,
    `Formation : "${formationName}"`,
    `Ton : ${tone || 'chaleureux et professionnel'}`,
    `Objectif : ${objective || 'engager et rassurer le destinataire'}`,
  ].join('\n')

  try {
    const raw = await callClaudeChat(userMessage, AI_GENERATE_SYSTEM, 'claude-haiku-4-5-20251001', (req as any).clientId)
    const { subject, body_html } = parseClaudeResponse(raw)
    res.json({ subject, body: body_html })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// POST /client/ai/improve
clientAuthRouter.post('/ai/improve', authenticateClient, aiLimiter, validate(AiImproveSchema), async (req, res) => {
  const { emailType } = req.body
  const clientId = (req as any).clientId as string
  const content = sanitizeAiInput(req.body.content, clientId)

  const userMessage = emailType ? `Type d'email : ${emailType}\n\n${content}` : content

  try {
    const raw = await callClaudeChat(userMessage, AI_IMPROVE_SYSTEM, 'claude-haiku-4-5-20251001', (req as any).clientId)
    const { subject, body_html } = parseClaudeResponse(raw)
    res.json({ subject, body: body_html })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// GET /client/automations/custom
clientAuthRouter.get('/automations/custom', authenticateClient, async (req, res) => {
  const clientId = (req as any).clientId

  const { formationId, unauthorized } = await getFormationContext(clientId, req)
  if (unauthorized) return res.status(403).json({ error: 'Formation introuvable ou accès refusé' })

  let autoQuery = supabase.from('custom_automations').select('*').eq('client_id', clientId)
  if (formationId) autoQuery = autoQuery.eq('formation_id', formationId)
  const { data, error } = await autoQuery.order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })

  res.json(data ?? [])
})

// POST /client/automations/custom
clientAuthRouter.post('/automations/custom', authenticateClient, validate(AutomationSchema), async (req, res) => {
  const clientId = (req as any).clientId
  const { name, trigger_type, trigger_delay_days, trigger_date, subject, body } = req.body

  const { formationId, unauthorized } = await getFormationContext(clientId, req)
  if (unauthorized) return res.status(403).json({ error: 'Formation introuvable ou accès refusé' })

  if (trigger_type === 'delay_after_purchase' && trigger_delay_days == null) {
    return res.status(400).json({ error: 'trigger_delay_days requis pour delay_after_purchase' })
  }
  if (trigger_type === 'specific_date' && !trigger_date) {
    return res.status(400).json({ error: 'trigger_date requis pour specific_date' })
  }

  let countQuery = supabase
    .from('custom_automations')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
  if (formationId) countQuery = countQuery.eq('formation_id', formationId)
  const { count, error: countError } = await countQuery
  if (countError) return res.status(500).json({ error: countError.message })
  if ((count ?? 0) >= 10) {
    return res.status(400).json({ error: 'Limite de 10 automatisations personnalisées atteinte' })
  }

  const { data, error } = await supabase
    .from('custom_automations')
    .insert({ client_id: clientId, name, trigger_type, trigger_delay_days, trigger_date, subject, body, formation_id: formationId })
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

  const { formationId, unauthorized } = await getFormationContext(clientId, req)
  if (unauthorized) return res.status(403).json({ error: 'Formation introuvable ou accès refusé' })

  if (config_type === 'rapport_video_active' && value === 'true') {
    const failure = await checkGate(clientId, { plan: 'premium' })
    if (failure) return res.status(403).json(failure)
  }

  if (config_type === 'vocal_ia_active' && value === 'true') {
    const failure = await checkGate(clientId, { option: 'option_vocal' })
    if (failure) return res.status(403).json(failure)
  }

  const encrypted_value = encrypt(value)
  const isFormationScoped = config_type.startsWith('template_')

  const { error } = await supabase
    .from('client_configs')
    .upsert(
      { client_id: clientId, config_type, encrypted_value, formation_id: isFormationScoped ? formationId : null },
      { onConflict: 'client_id,config_type,formation_key' }
    )

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
    const { formationId } = await getFormationContext(clientId, req)

    const { data: senderRow } = await supabase
      .from('client_configs')
      .select('encrypted_value')
      .eq('client_id', clientId)
      .eq('config_type', 'sender_name')
      .single()

    const senderName = senderRow?.encrypted_value
      ? (() => { try { return decrypt(senderRow.encrypted_value) } catch { return 'Test' } })()
      : 'Test'

    const tpl = await getEmailTemplate(clientId, config_type as any, TEST_VARS, formationId)
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
  const email = decodeURIComponent(req.params.email as string).toLowerCase()

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

type StudentStatus = 'actif' | 'en_dunning' | 'suspendu' | 'blackliste'

interface StudentSummary {
  id: string
  nom: string
  prenom: string
  email: string
  formation: string
  status: StudentStatus
  date_inscription: string
  derniere_action: string | null
  emails_recus: number
}

// GET /client/students
clientAuthRouter.get('/students', authenticateClient, async (req, res) => {
  const clientId = (req as any).clientId as string

  const { formationId, unauthorized } = await getFormationContext(clientId, req)
  if (unauthorized) return res.status(403).json({ error: 'Formation introuvable ou accès refusé' })

  const page = Math.max(1, parseInt(req.query.page as string) || 1)
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200)
  const statusFilter = (req.query.status as string) || 'all'
  const search = ((req.query.search as string) || '').toLowerCase().trim()

  const [tasksResult, blacklistResult, pendingDunningResult, j7DoneResult, recoveredLogsResult, sentLogsResult] =
    await Promise.all([
      (() => {
        let q = supabase.from('pending_tasks').select('context_json, created_at').eq('client_id', clientId).order('created_at', { ascending: true }).limit(5000)
        if (formationId) q = q.eq('formation_id', formationId)
        return q
      })(),
      supabase.from('client_blacklist').select('email').eq('client_id', clientId),
      supabase
        .from('scheduled_jobs')
        .select('context_json')
        .eq('client_id', clientId)
        .like('job_type', 'failed_payment%')
        .eq('status', 'pending'),
      supabase
        .from('scheduled_jobs')
        .select('context_json')
        .eq('client_id', clientId)
        .eq('job_type', 'failed_payment_j7')
        .eq('status', 'done'),
      supabase
        .from('activity_logs')
        .select('payload_json')
        .eq('client_id', clientId)
        .eq('action_type', 'payment_recovered'),
      supabase
        .from('activity_logs')
        .select('payload_json, created_at')
        .eq('client_id', clientId)
        .eq('status', 'sent')
        .order('created_at', { ascending: false })
        .limit(5000),
    ])

  const blacklistedEmails = new Set((blacklistResult.data ?? []).map((b: any) => b.email as string))
  const dunningEmails = new Set(
    (pendingDunningResult.data ?? [])
      .map((j: any) => (j.context_json as any)?.customer_email as string | undefined)
      .filter(Boolean) as string[]
  )
  const j7Emails = new Set(
    (j7DoneResult.data ?? [])
      .map((j: any) => (j.context_json as any)?.customer_email as string | undefined)
      .filter(Boolean) as string[]
  )
  const recoveredEmails = new Set(
    (recoveredLogsResult.data ?? [])
      .map((l: any) => (l.payload_json as any)?.customer_email as string | undefined)
      .filter(Boolean) as string[]
  )
  const suspendedEmails = new Set([...j7Emails].filter(e => !recoveredEmails.has(e)))

  const logMap = new Map<string, { count: number; derniere: string }>()
  for (const log of sentLogsResult.data ?? []) {
    const email = (log.payload_json as any)?.to as string | undefined
    if (!email) continue
    if (!logMap.has(email)) logMap.set(email, { count: 0, derniere: log.created_at })
    logMap.get(email)!.count++
  }

  const studentMap = new Map<string, StudentSummary>()
  for (const t of tasksResult.data ?? []) {
    const ctx = t.context_json as Record<string, any>
    const email = ctx?.customer_email as string | undefined
    if (!email || studentMap.has(email)) continue

    const logInfo = logMap.get(email)
    const status: StudentStatus = blacklistedEmails.has(email)
      ? 'blackliste'
      : dunningEmails.has(email)
      ? 'en_dunning'
      : suspendedEmails.has(email)
      ? 'suspendu'
      : 'actif'

    studentMap.set(email, {
      id: email,
      nom: ctx?.customer_name ?? ctx?.student_name ?? '',
      prenom: ctx?.student_name ?? '',
      email,
      formation: ctx?.product_name ?? '',
      status,
      date_inscription: t.created_at,
      derniere_action: logInfo?.derniere ?? null,
      emails_recus: logInfo?.count ?? 0,
    })
  }

  let students = [...studentMap.values()]

  if (statusFilter !== 'all') {
    students = students.filter(s => s.status === statusFilter)
  }
  if (search) {
    students = students.filter(
      s =>
        s.email.toLowerCase().includes(search) ||
        s.nom.toLowerCase().includes(search) ||
        s.prenom.toLowerCase().includes(search)
    )
  }

  const total = students.length
  const offset = (page - 1) * limit
  const paginated = students.slice(offset, offset + limit)

  res.json({ total, page, limit, students: paginated })
})

// GET /client/students/:id  (id = email URL-encoded)
clientAuthRouter.get('/students/:id', authenticateClient, async (req, res) => {
  const clientId = (req as any).clientId as string
  const email = decodeURIComponent(req.params.id as string).toLowerCase()

  const { data: tasks } = await supabase
    .from('pending_tasks')
    .select('context_json, task_type, status, created_at')
    .eq('client_id', clientId)
    .contains('context_json', { customer_email: email })
    .order('created_at', { ascending: false })

  if (!tasks || tasks.length === 0) {
    return res.status(404).json({ error: 'Élève introuvable' })
  }

  const latest = tasks[tasks.length - 1].context_json as Record<string, any>

  const { data: logs } = await supabase
    .from('activity_logs')
    .select('action_type, payload_json, created_at')
    .eq('client_id', clientId)
    .eq('status', 'sent')
    .contains('payload_json', { to: email })
    .order('created_at', { ascending: false })

  // Fetch tracking rows for emails that have a tracking_id in their payload
  const trackingIds = (logs ?? [])
    .map((l: any) => (l.payload_json as any)?.tracking_id as string | undefined)
    .filter(Boolean) as string[]

  const trackingMap = new Map<string, { opened_at: string | null; clicked_at: string | null }>()
  if (trackingIds.length > 0) {
    const { data: tRows } = await supabase
      .from('email_tracking')
      .select('id, opened_at, clicked_at')
      .in('id', trackingIds)
    for (const t of tRows ?? []) {
      trackingMap.set(t.id, { opened_at: t.opened_at ?? null, clicked_at: t.clicked_at ?? null })
    }
  }

  const emailHistory = (logs ?? []).map((l: any) => {
    const tid = (l.payload_json as any)?.tracking_id as string | undefined
    const tr = tid ? trackingMap.get(tid) : undefined
    return {
      type: l.action_type as string,
      sent_at: l.created_at as string,
      subject: (l.payload_json as any)?.subject ?? '',
      opened_at: tr?.opened_at ?? null,
      clicked_at: tr?.clicked_at ?? null,
    }
  })

  res.json({
    id: email,
    nom: latest?.customer_name ?? latest?.student_name ?? '',
    prenom: latest?.student_name ?? '',
    email,
    formation: latest?.product_name ?? '',
    date_inscription: tasks[tasks.length - 1].created_at,
    emails_recus: emailHistory.length,
    email_history: emailHistory,
  })
})

// POST /client/send-manual
clientAuthRouter.post('/send-manual', authenticateClient, validate(ManualSendSchema), async (req, res) => {
  const clientId = (req as any).clientId as string
  const { student_email, config_type } = req.body

  const isTemplateType = (TEMPLATE_CONFIG_TYPES as readonly string[]).includes(config_type)
  const isCustomUUID = UUID_RE.test(config_type)

  if (!isTemplateType && !isCustomUUID) {
    return res.status(400).json({ error: 'config_type invalide' })
  }

  const { formationId } = await getFormationContext(clientId, req)

  const { data: senderRow } = await supabase
    .from('client_configs')
    .select('encrypted_value')
    .eq('client_id', clientId)
    .eq('config_type', 'sender_name')
    .single()

  const senderName = senderRow?.encrypted_value
    ? (() => { try { return decrypt(senderRow.encrypted_value) } catch { return 'Formateur' } })()
    : 'Formateur'

  const { data: latestTask } = await supabase
    .from('pending_tasks')
    .select('context_json')
    .eq('client_id', clientId)
    .contains('context_json', { customer_email: student_email.toLowerCase() })
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const ctx = (latestTask?.context_json as Record<string, any>) ?? {}
  const vars: Record<string, string> = {
    nom: ctx?.customer_name ?? ctx?.student_name ?? '',
    prenom: ctx?.student_name ?? '',
    email: student_email,
    nom_formation: ctx?.product_name ?? '',
    lien_acces: ctx?.lien_acces ?? '',
    mot_de_passe: '',
    montant: String(ctx?.amount ?? ''),
    lien_paiement: ctx?.payment_link ?? ctx?.hosted_invoice_url ?? '',
  }

  let subject: string
  let htmlBody: string

  if (isTemplateType) {
    const tpl = await getEmailTemplate(clientId, config_type as any, vars, formationId)
    subject = tpl.subject
    htmlBody = wrapEmailHtml(tpl.body.replace(/\n/g, '<br>'), senderName)
  } else {
    const { data: automation } = await supabase
      .from('custom_automations')
      .select('subject, body, active')
      .eq('id', config_type)
      .eq('client_id', clientId)
      .single()

    if (!automation) return res.status(404).json({ error: 'Automation introuvable' })

    const injectVars = (text: string) =>
      text.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`)

    subject = injectVars(automation.subject)
    htmlBody = wrapEmailHtml(injectVars(automation.body).replace(/\n/g, '<br>'), senderName)
  }

  try {
    await sendEmail({
      to: student_email.toLowerCase(),
      subject,
      html: htmlBody,
      sender_name: senderName,
    })

    insertTrackingRow({
      clientId,
      studentEmail: student_email.toLowerCase(),
      configType: config_type,
      channel: 'email',
    }).catch((e: Error) => console.warn('[send-manual] tracking insert failed:', e.message))

    const { error: logError } = await supabase.from('activity_logs').insert({
      client_id: clientId,
      action_type: 'manual_send',
      payload_json: { config_type, student_email: student_email.toLowerCase(), subject },
      status: 'sent',
    })
    if (logError) console.warn('[send-manual] log insert failed:', logError.message)

    res.json({ success: true })
  } catch (err: any) {
    await supabase.from('activity_logs').insert({
      client_id: clientId,
      action_type: 'manual_send',
      payload_json: { config_type, student_email: student_email.toLowerCase(), error: err.message },
      status: 'failed',
    })
    res.status(500).json({ success: false, error: err.message })
  }
})

// GET /client/formations
clientAuthRouter.get('/formations', authenticateClient, async (req, res) => {
  const clientId = (req as any).clientId as string
  const { data, error } = await supabase
    .from('formations')
    .select('id, name, stripe_product_id, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: true })
  if (error) return res.status(500).json({ error: error.message })
  res.json(data ?? [])
})

// POST /client/formations
clientAuthRouter.post('/formations', authenticateClient, validate(FormationSchema), async (req, res) => {
  const clientId = (req as any).clientId as string
  const { name, stripe_product_id } = req.body
  const { data, error } = await supabase
    .from('formations')
    .insert({ client_id: clientId, name, stripe_product_id: stripe_product_id ?? null })
    .select('id, name, stripe_product_id, created_at')
    .single()
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// PUT /client/formations/:id
clientAuthRouter.put('/formations/:id', authenticateClient, validate(FormationUpdateSchema), async (req, res) => {
  const clientId = (req as any).clientId as string
  const updates: Record<string, any> = {}
  if (req.body.name !== undefined) updates.name = req.body.name
  if (req.body.stripe_product_id !== undefined) updates.stripe_product_id = req.body.stripe_product_id
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Aucune modification fournie' })

  const { data, error } = await supabase
    .from('formations')
    .update(updates)
    .eq('id', req.params.id)
    .eq('client_id', clientId)
    .select('id, name, stripe_product_id, created_at')
    .single()
  if (error || !data) return res.status(404).json({ error: 'Formation introuvable' })
  res.json(data)
})

// DELETE /client/formations/:id
clientAuthRouter.delete('/formations/:id', authenticateClient, async (req, res) => {
  const clientId = (req as any).clientId as string
  const { id } = req.params

  const { count: activeAuto } = await supabase
    .from('custom_automations')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('formation_id', id)
    .eq('active', true)
  if (activeAuto && activeAuto > 0)
    return res.status(409).json({ error: `Impossible de supprimer : ${activeAuto} automation(s) active(s) liée(s)` })

  const { count: cfgCount } = await supabase
    .from('client_configs')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('formation_id', id)
  if (cfgCount && cfgCount > 0)
    return res.status(409).json({ error: `Impossible de supprimer : ${cfgCount} configuration(s) liée(s)` })

  const { error, count } = await supabase
    .from('formations')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('client_id', clientId)
  if (error) return res.status(500).json({ error: error.message })
  if (count === 0) return res.status(404).json({ error: 'Formation introuvable' })
  res.json({ ok: true })
})

// POST /client/vocal/send
clientAuthRouter.post('/vocal/send', authenticateClient, planGate({ option: 'option_vocal' }), aiLimiter, async (req, res) => {
  const clientId = (req as any).clientId as string
  const { student_id } = req.body as { student_id?: string }

  if (!student_id || !UUID_RE.test(student_id)) {
    return res.status(400).json({ error: 'student_id invalide' })
  }

  if (!process.env.TWILIO_FROM_NUMBER) {
    return res.status(503).json({ error: 'SERVICE_UNAVAILABLE', message: 'Appel vocal temporairement indisponible.' })
  }

  const { data: vocalCfg } = await supabase
    .from('client_configs')
    .select('encrypted_value')
    .eq('client_id', clientId)
    .eq('config_type', 'vocal_ia_active')
    .single()

  let vocalActive = false
  if (vocalCfg?.encrypted_value) {
    try { vocalActive = JSON.parse(decrypt(vocalCfg.encrypted_value))?.active === true } catch {}
  }

  if (!vocalActive) {
    return res.status(403).json({ error: 'Option vocal non activée pour ce compte' })
  }

  const { data: profile } = await supabase
    .from('student_profiles')
    .select('email, phone')
    .eq('id', student_id)
    .eq('client_id', clientId)
    .single()

  if (!profile) {
    return res.status(404).json({ error: 'Élève introuvable' })
  }

  if (!profile.phone) {
    return res.status(400).json({ error: 'Numéro de téléphone non renseigné pour cet élève' })
  }

  if (!profile.email) {
    return res.status(400).json({ error: 'Email non renseigné pour cet élève' })
  }

  await sendVocalRecovery(clientId, profile.email)
  res.json({ success: true, message: 'Appel vocal déclenché' })
})

