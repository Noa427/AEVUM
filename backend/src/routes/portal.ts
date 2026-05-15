import { Router } from 'express'
import { supabase } from '../services/supabase'
import { encrypt, decrypt } from '../services/encryption'
import { portalAuthLimiter } from '../middleware/rate-limit'

export const portalRouter = Router()

const TEMPLATE_KEYS = ['failed_payment', 'onboarding_j0', 'onboarding_j3', 'onboarding_j7'] as const

async function getClientByToken(token: string) {
  const { data, error } = await supabase
    .from('clients')
    .select('id, name, client_email')
    .eq('portal_token', token)
    .single()
  if (error || !data) return null
  return data
}

async function getClientConfigs(clientId: string): Promise<Record<string, string>> {
  const { data } = await supabase
    .from('client_configs')
    .select('config_type, encrypted_value')
    .eq('client_id', clientId)
  const map: Record<string, string> = {}
  for (const c of data ?? []) {
    try { map[c.config_type] = decrypt(c.encrypted_value) } catch { /* skip corrupt entries */ }
  }
  return map
}

// POST /api/portal/:token/auth
portalRouter.post('/:token/auth', portalAuthLimiter, async (req, res) => {
  const client = await getClientByToken(req.params.token)
  if (!client) return res.status(404).json({ error: 'Token invalide' })

  const { email } = req.body
  if (!email || client.client_email?.toLowerCase() !== (email as string).toLowerCase()) {
    return res.status(401).json({ error: 'Email incorrect' })
  }

  res.json({ ok: true })
})

// GET /api/portal/:token
portalRouter.get('/:token', async (req, res) => {
  const client = await getClientByToken(req.params.token)
  if (!client) return res.status(404).json({ error: 'Token invalide' })

  const configs = await getClientConfigs(client.id)

  res.json({
    name: client.name,
    sender_name: configs['sender_name'] ?? '',
    templates: {
      failed_payment: configs['template_failed_payment'] ?? null,
      onboarding_j0: configs['template_onboarding_j0'] ?? null,
      onboarding_j3: configs['template_onboarding_j3'] ?? null,
      onboarding_j7: configs['template_onboarding_j7'] ?? null,
    },
  })
})

// PUT /api/portal/:token
portalRouter.put('/:token', async (req, res) => {
  const client = await getClientByToken(req.params.token)
  if (!client) return res.status(404).json({ error: 'Token invalide' })

  const { sender_name, templates } = req.body
  const upserts: Array<{ client_id: string; config_type: string; encrypted_value: string }> = []

  if (sender_name !== undefined) {
    if (typeof sender_name !== 'string' || sender_name.trim().length === 0) {
      return res.status(400).json({ error: 'sender_name invalide' })
    }
    upserts.push({ client_id: client.id, config_type: 'sender_name', encrypted_value: encrypt(sender_name.trim()) })
  }

  if (templates !== null && typeof templates === 'object') {
    for (const key of TEMPLATE_KEYS) {
      if (!(key in templates)) continue
      const val = templates[key]
      if (typeof val !== 'string') return res.status(400).json({ error: `template.${key} doit être une string` })
      upserts.push({ client_id: client.id, config_type: `template_${key}`, encrypted_value: encrypt(val) })
    }
  }

  if (upserts.length === 0) return res.status(400).json({ error: 'Aucune donnée à mettre à jour' })

  const { error } = await supabase
    .from('client_configs')
    .upsert(upserts, { onConflict: 'client_id,config_type' })
  if (error) return res.status(500).json({ error: error.message })

  res.json({ ok: true })
})

// GET /api/portal/:token/history
portalRouter.get('/:token/history', async (req, res) => {
  const client = await getClientByToken(req.params.token)
  if (!client) return res.status(404).json({ error: 'Token invalide' })

  const page = Math.max(1, parseInt(req.query.page as string) || 1)
  const limit = 20
  const from = (page - 1) * limit

  const { data, error, count } = await supabase
    .from('activity_logs')
    .select('id, action_type, status, payload_json, created_at', { count: 'exact' })
    .eq('client_id', client.id)
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1)

  if (error) return res.status(500).json({ error: error.message })

  res.json({
    data: data ?? [],
    pagination: { page, total: count ?? 0, total_pages: Math.ceil((count ?? 0) / limit) },
  })
})
