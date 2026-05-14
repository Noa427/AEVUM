import { Router } from 'express'
import { supabase } from '../services/supabase'
import { requireAuth } from '../middleware/auth'
import Anthropic from '@anthropic-ai/sdk'
import { encrypt, decrypt } from '../services/encryption'

export const settingsRouter = Router()
settingsRouter.use(requireAuth)

settingsRouter.get('/', async (_req, res) => {
  const { data } = await supabase.from('settings').select('*')
  const map: Record<string, string> = {}
  for (const row of data ?? []) map[row.key] = row.value
  res.json({
    auto_mode: map['auto_mode'] === 'true',
    has_api_key: !!map['anthropic_api_key'],
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
  const { auto_mode, anthropic_api_key } = req.body

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

  res.json({ ok: true })
})
