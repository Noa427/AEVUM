import { Router } from 'express'
import { supabase } from '../services/supabase'
import { requireAuth } from '../middleware/auth'
import Anthropic from '@anthropic-ai/sdk'
import { encrypt, decrypt } from '../services/encryption'
import { DEFAULT_AI_QUOTA_EUR_MONTH } from '../middleware/aiQuota'

export const settingsRouter = Router()
settingsRouter.use(requireAuth)

settingsRouter.get('/', async (_req, res) => {
  const { data } = await supabase.from('settings').select('*')
  const map: Record<string, string> = {}
  for (const row of data ?? []) map[row.key] = row.value
  res.json({
    auto_mode: map['auto_mode'] === 'true',
    has_api_key: !!map['anthropic_api_key'],
    infra_monthly_cost: parseFloat(map['infra_monthly_cost'] ?? '0') || 0,
    ai_quota_eur_month_default: (() => {
      const v = parseFloat(map['ai_quota_eur_month_default'] ?? '')
      return isNaN(v) ? DEFAULT_AI_QUOTA_EUR_MONTH : v
    })(),
  })
})

settingsRouter.get('/test-anthropic', async (_req, res) => {
  const { data } = await supabase.from('settings').select('value').eq('key', 'anthropic_api_key').single()
  if (!data?.value) return res.status(400).json({ error: 'Clé API non configurée' })
  try {
    const apiKey = decrypt(data.value)
    const client = new Anthropic({ apiKey })
    await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'hi' }],
    })
    res.json({ ok: true })
  } catch {
    res.status(400).json({ error: 'Clé API invalide ou expirée' })
  }
})

settingsRouter.put('/', async (req, res) => {
  const { auto_mode, anthropic_api_key, infra_monthly_cost, ai_quota_eur_month_default } = req.body

  if (anthropic_api_key !== undefined) {
    try {
      const client = new Anthropic({ apiKey: anthropic_api_key })
      await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      })
    } catch {
      return res.status(400).json({ error: 'Clé API Anthropic invalide' })
    }
    await supabase.from('settings').upsert({ key: 'anthropic_api_key', value: encrypt(anthropic_api_key) })
  }

  if (auto_mode !== undefined) {
    const currentKey = await supabase.from('settings').select('value').eq('key', 'anthropic_api_key').single()
    if (auto_mode === true && !currentKey.data?.value) {
      return res.status(400).json({ error: "Impossible d'activer le mode auto sans clé API" })
    }
    await supabase.from('settings').upsert({ key: 'auto_mode', value: String(auto_mode) })
  }

  if (infra_monthly_cost !== undefined) {
    const val = parseFloat(String(infra_monthly_cost))
    if (isNaN(val) || val < 0) return res.status(400).json({ error: 'Coût infra invalide' })
    await supabase.from('settings').upsert({ key: 'infra_monthly_cost', value: String(val) })
  }

  if (ai_quota_eur_month_default !== undefined) {
    const val = parseFloat(String(ai_quota_eur_month_default))
    if (isNaN(val) || val < 0) return res.status(400).json({ error: 'Quota IA invalide' })
    await supabase.from('settings').upsert({ key: 'ai_quota_eur_month_default', value: String(val) })
  }

  res.json({ ok: true })
})
