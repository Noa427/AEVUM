import { Router } from 'express'
import { supabase } from '../services/supabase'
import { encrypt, decrypt } from '../services/encryption'
import { requireAuth } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { ClientUpdateSchema } from '../schemas/client'
import { generateClientCredentials } from '../utils/generateClientCredentials'
import { OPTION_ADDON_MAP, OptionKey } from '../middleware/planGate'
import { USD_TO_EUR, planMrr, EXCLUDED_FROM_STATS_CLIENT_IDS } from '../utils/pricing'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ADDON_CONFIG_TYPES = ['addon_f11', 'addon_f13', 'addon_f18'] as const

export const clientsRouter = Router()
clientsRouter.use(requireAuth)

clientsRouter.get('/', async (_req, res) => {
  const { data, error } = await supabase
    .from('clients')
    .select('id, user_id, name, email, plan, payment_status, created_at')
    .order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })

  const clientIds = (data ?? []).map(c => c.id)
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const [taskRows, logRows, addonRows] = await Promise.all([
    clientIds.length
      ? supabase.from('pending_tasks').select('client_id, status').in('client_id', clientIds).in('status', ['pending', 'failed'])
      : { data: [] },
    clientIds.length
      ? supabase.from('activity_logs').select('client_id').in('client_id', clientIds).eq('status', 'sent').gte('created_at', startOfMonth.toISOString())
      : { data: [] },
    clientIds.length
      ? supabase.from('client_configs').select('client_id, config_type, encrypted_value')
          .in('client_id', clientIds)
          .in('config_type', [...ADDON_CONFIG_TYPES])
      : { data: [] },
  ])

  const taskCounts: Record<string, number> = {}
  const failedTaskClients = new Set<string>()
  for (const t of (taskRows as any).data ?? []) {
    if (t.status === 'pending') taskCounts[t.client_id] = (taskCounts[t.client_id] ?? 0) + 1
    if (t.status === 'failed') failedTaskClients.add(t.client_id)
  }

  const logCounts: Record<string, number> = {}
  for (const l of (logRows as any).data ?? []) logCounts[l.client_id] = (logCounts[l.client_id] ?? 0) + 1

  const addonsMap: Record<string, string[]> = {}
  for (const r of (addonRows as any).data ?? []) {
    try {
      if (decrypt(r.encrypted_value) === 'true') {
        if (!addonsMap[r.client_id]) addonsMap[r.client_id] = []
        addonsMap[r.client_id].push(r.config_type)
      }
    } catch {}
  }

  res.json((data ?? []).map(c => ({
    ...c,
    pending_tasks: taskCounts[c.id] ?? 0,
    emails_sent: logCounts[c.id] ?? 0,
    addons: addonsMap[c.id] ?? [],
    has_issue: c.payment_status === 'unpaid' || failedTaskClients.has(c.id),
    excluded_from_stats: EXCLUDED_FROM_STATS_CLIENT_IDS.has(c.id),
  })))
})

clientsRouter.get('/:id', async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'ID invalide' })
  const { data, error } = await supabase
    .from('clients')
    .select('id, user_id, name, email, auto_mode, paused_until, whatsapp_phone_number_id, whatsapp_active, must_change_password, plan, payment_status, created_at')
    .eq('id', req.params.id)
    .single()
  if (error || !data) return res.status(404).json({ error: 'Client introuvable' })

  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const [studentRes, emailsRes, lastActivityRes, aiRes, addonRes] = await Promise.all([
    supabase.from('student_profiles').select('email', { count: 'exact', head: true }).eq('client_id', data.id),
    supabase.from('activity_logs').select('id', { count: 'exact', head: true }).eq('client_id', data.id).eq('status', 'sent'),
    supabase.from('activity_logs').select('created_at').eq('client_id', data.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('ai_usage_logs').select('cost_usd').eq('client_id', data.id).gte('created_at', startOfMonth.toISOString()),
    supabase.from('client_configs').select('config_type, encrypted_value').eq('client_id', data.id).in('config_type', [...ADDON_CONFIG_TYPES]),
  ])

  const addons = new Set<string>()
  for (const r of addonRes.data ?? []) {
    try { if (decrypt(r.encrypted_value) === 'true') addons.add(r.config_type) } catch {}
  }
  const aiCostUsd = (aiRes.data ?? []).reduce((sum, r) => sum + r.cost_usd, 0)

  res.json({
    ...data,
    addons: [...addons],
    mrr: planMrr(data.plan, addons),
    student_count: studentRes.count ?? 0,
    emails_sent_total: emailsRes.count ?? 0,
    ai_cost_eur_month: Math.round(aiCostUsd * USD_TO_EUR * 100) / 100,
    last_activity: lastActivityRes.data?.created_at ?? null,
  })
})

clientsRouter.post('/', async (req, res) => {
  const userId = (req as any).userId
  const { name, email, stripe_webhook_secret, sender_name, auto_mode = true } = req.body
  const plan = req.body.plan ?? 'standard'
  const options: Record<OptionKey, boolean> = {
    option_checkout: req.body.option_checkout ?? false,
    option_vocal: req.body.option_vocal ?? false,
    option_notaire: req.body.option_notaire ?? false,
  }

  if (!name || !email || !stripe_webhook_secret || !sender_name) {
    return res.status(400).json({ error: 'Champs requis : name, email, stripe_webhook_secret, sender_name' })
  }
  if (!['standard', 'premium'].includes(plan)) {
    return res.status(400).json({ error: 'Plan invalide' })
  }
  for (const [key, val] of Object.entries(options)) {
    if (typeof val !== 'boolean') return res.status(400).json({ error: `${key} doit être un booléen` })
  }

  const { data: client, error } = await supabase
    .from('clients')
    .insert({ user_id: userId, name, email, auto_mode, plan })
    .select()
    .single()
  if (error) return res.status(500).json({ error: error.message })

  const { error: configError } = await supabase.from('client_configs').insert([
    { client_id: client.id, config_type: 'stripe_webhook_secret', encrypted_value: encrypt(stripe_webhook_secret) },
    { client_id: client.id, config_type: 'sender_name', encrypted_value: encrypt(sender_name) },
    ...Object.entries(options).map(([optionKey, val]) => ({
      client_id: client.id,
      config_type: OPTION_ADDON_MAP[optionKey as OptionKey],
      encrypted_value: encrypt(String(val)),
    })),
  ])
  if (configError) {
    await supabase.from('clients').delete().eq('id', client.id)
    return res.status(500).json({ error: configError.message })
  }

  try {
    await generateClientCredentials(client.id, email)
  } catch (err: any) {
    console.error(`[clients] generateClientCredentials failed for ${client.id}:`, err.message)
  }

  res.status(201).json(client)
})

clientsRouter.put('/:id', validate(ClientUpdateSchema), async (req, res) => {
  if (!UUID_RE.test(String(req.params.id))) return res.status(400).json({ error: 'ID invalide' })
  const userId = (req as any).userId
  const { name, email, stripe_webhook_secret, sender_name, auto_mode, plan, payment_status } = req.body

  const update: Record<string, any> = {}
  if (typeof name !== 'undefined') update.name = name
  if (typeof email !== 'undefined') update.email = email
  if (typeof auto_mode !== 'undefined') update.auto_mode = auto_mode
  if (typeof plan !== 'undefined') update.plan = plan
  if (typeof payment_status !== 'undefined') update.payment_status = payment_status

  if (Object.keys(update).length === 0 && typeof stripe_webhook_secret === 'undefined' && typeof sender_name === 'undefined') {
    return res.status(400).json({ error: 'Aucun champ à mettre à jour' })
  }

  let client: any
  if (Object.keys(update).length > 0) {
    const { data, error } = await supabase
      .from('clients')
      .update(update)
      .eq('id', req.params.id)
      .eq('user_id', userId)
      .select()
      .single()
    if (error || !data) return res.status(404).json({ error: 'Client introuvable' })
    client = data
  } else {
    const { data, error } = await supabase
      .from('clients')
      .select()
      .eq('id', req.params.id)
      .eq('user_id', userId)
      .single()
    if (error || !data) return res.status(404).json({ error: 'Client introuvable' })
    client = data
  }

  if (stripe_webhook_secret) {
    await supabase.from('client_configs').upsert(
      { client_id: client.id, config_type: 'stripe_webhook_secret', encrypted_value: encrypt(stripe_webhook_secret) },
      { onConflict: 'client_id,config_type,formation_key' }
    )
  }
  if (sender_name) {
    await supabase.from('client_configs').upsert(
      { client_id: client.id, config_type: 'sender_name', encrypted_value: encrypt(sender_name) },
      { onConflict: 'client_id,config_type,formation_key' }
    )
  }

  res.json(client)
})

clientsRouter.put('/:id/plan', async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'ID invalide' })
  const userId = (req as any).userId
  const { plan } = req.body

  if (plan !== undefined && !['standard', 'premium'].includes(plan)) {
    return res.status(400).json({ error: 'Plan invalide' })
  }

  const optionUpdates: Partial<Record<OptionKey, boolean>> = {}
  for (const optionKey of Object.keys(OPTION_ADDON_MAP) as OptionKey[]) {
    const val = req.body[optionKey]
    if (val === undefined) continue
    if (typeof val !== 'boolean') return res.status(400).json({ error: `${optionKey} doit être un booléen` })
    optionUpdates[optionKey] = val
  }

  if (plan === undefined && Object.keys(optionUpdates).length === 0) {
    return res.status(400).json({ error: 'Aucun champ à mettre à jour' })
  }

  const { data: existing, error: fetchError } = await supabase
    .from('clients')
    .select('id, user_id, name, email, plan, payment_status, created_at')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single()
  if (fetchError || !existing) return res.status(404).json({ error: 'Client introuvable' })

  const ancien_plan = existing.plan
  let client = existing

  if (plan !== undefined && plan !== ancien_plan) {
    const { data, error } = await supabase
      .from('clients')
      .update({ plan })
      .eq('id', req.params.id)
      .eq('user_id', userId)
      .select('id, user_id, name, email, plan, payment_status, created_at')
      .single()
    if (error || !data) return res.status(500).json({ error: error?.message ?? 'Mise à jour impossible' })
    client = data
  }

  if (Object.keys(optionUpdates).length > 0) {
    const { error: configError } = await supabase.from('client_configs').upsert(
      Object.entries(optionUpdates).map(([optionKey, val]) => ({
        client_id: req.params.id,
        config_type: OPTION_ADDON_MAP[optionKey as OptionKey],
        encrypted_value: encrypt(String(val)),
      })),
      { onConflict: 'client_id,config_type,formation_key' }
    )
    if (configError) return res.status(500).json({ error: configError.message })
  }

  await supabase.from('activity_logs').insert({
    client_id: req.params.id,
    user_id: userId,
    action_type: 'plan_updated',
    payload_json: { ancien_plan, nouveau_plan: client.plan, options: optionUpdates },
    status: 'ok',
  })

  res.json(client)
})

const PILIER_CONFIG_TYPES = [
  'support_email_enabled',
  'support_auto_reply',
  'politique_remboursement',
  'upsell_enabled',
  'upsell_product_name',
  'upsell_url',
  'upsell_price',
] as const

clientsRouter.get('/:id/configs', async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'ID invalide' })
  const { data: client } = await supabase
    .from('clients')
    .select('id')
    .eq('id', req.params.id)
    .single()
  if (!client) return res.status(404).json({ error: 'Client introuvable' })

  const ALL_CONFIG_TYPES = [...PILIER_CONFIG_TYPES, ...ADDON_CONFIG_TYPES] as const

  const { data: rows } = await supabase
    .from('client_configs')
    .select('config_type, encrypted_value')
    .eq('client_id', req.params.id)
    .in('config_type', [...ALL_CONFIG_TYPES])

  const result: Record<string, string> = {}
  for (const r of rows ?? []) {
    try { result[r.config_type] = decrypt(r.encrypted_value) } catch { /* skip */ }
  }
  res.json(result)
})

clientsRouter.put('/:id/configs', async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'ID invalide' })
  const userId = (req as any).userId
  const { data: client } = await supabase
    .from('clients')
    .select('id')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single()
  if (!client) return res.status(404).json({ error: 'Client introuvable' })

  const ALL_WRITABLE_TYPES = [...PILIER_CONFIG_TYPES, ...ADDON_CONFIG_TYPES] as const
  const upserts: Array<{ client_id: string; config_type: string; encrypted_value: string }> = []
  for (const key of ALL_WRITABLE_TYPES) {
    if (!(key in req.body)) continue
    const val = req.body[key]
    if (typeof val !== 'string' && typeof val !== 'boolean') continue
    upserts.push({ client_id: req.params.id, config_type: key, encrypted_value: encrypt(String(val)) })
  }

  if (upserts.length === 0) return res.status(400).json({ error: 'Aucune config valide fournie' })

  const { error } = await supabase
    .from('client_configs')
    .upsert(upserts, { onConflict: 'client_id,config_type,formation_key' })
  if (error) return res.status(500).json({ error: error.message })

  res.json({ ok: true })
})

clientsRouter.delete('/:id', async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'ID invalide' })
  const userId = (req as any).userId
  const { error } = await supabase
    .from('clients')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', userId)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).send()
})
