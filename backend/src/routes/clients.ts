import { Router } from 'express'
import { supabase } from '../services/supabase'
import { encrypt } from '../services/encryption'
import { requireAuth } from '../middleware/auth'

export const clientsRouter = Router()
clientsRouter.use(requireAuth)

clientsRouter.get('/', async (req, res) => {
  const userId = (req as any).userId
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })

  const clientIds = (data ?? []).map(c => c.id)

  const [taskRows, logRows] = await Promise.all([
    clientIds.length
      ? supabase.from('pending_tasks').select('client_id').in('client_id', clientIds).eq('status', 'pending')
      : { data: [] },
    clientIds.length
      ? supabase.from('activity_logs').select('client_id').in('client_id', clientIds).eq('status', 'sent')
      : { data: [] },
  ])

  const taskCounts: Record<string, number> = {}
  for (const t of (taskRows as any).data ?? []) taskCounts[t.client_id] = (taskCounts[t.client_id] ?? 0) + 1

  const logCounts: Record<string, number> = {}
  for (const l of (logRows as any).data ?? []) logCounts[l.client_id] = (logCounts[l.client_id] ?? 0) + 1

  res.json((data ?? []).map(c => ({
    ...c,
    pending_tasks: taskCounts[c.id] ?? 0,
    emails_sent: logCounts[c.id] ?? 0,
  })))
})

clientsRouter.get('/:id', async (req, res) => {
  const userId = (req as any).userId
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single()
  if (error || !data) return res.status(404).json({ error: 'Client introuvable' })
  res.json(data)
})

clientsRouter.post('/', async (req, res) => {
  const userId = (req as any).userId
  const { name, email, stripe_webhook_secret, sender_name } = req.body

  if (!name || !email || !stripe_webhook_secret || !sender_name) {
    return res.status(400).json({ error: 'Champs requis : name, email, stripe_webhook_secret, sender_name' })
  }

  const { data: client, error } = await supabase
    .from('clients')
    .insert({ user_id: userId, name, email })
    .select()
    .single()
  if (error) return res.status(500).json({ error: error.message })

  const { error: configError } = await supabase.from('client_configs').insert([
    { client_id: client.id, config_type: 'stripe_webhook_secret', encrypted_value: encrypt(stripe_webhook_secret) },
    { client_id: client.id, config_type: 'sender_name', encrypted_value: encrypt(sender_name) },
  ])
  if (configError) {
    await supabase.from('clients').delete().eq('id', client.id)
    return res.status(500).json({ error: configError.message })
  }

  res.status(201).json(client)
})

clientsRouter.put('/:id', async (req, res) => {
  const userId = (req as any).userId
  const { name, email, stripe_webhook_secret, sender_name } = req.body

  const { data: client, error } = await supabase
    .from('clients')
    .update({ name, email })
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .select()
    .single()
  if (error || !client) return res.status(404).json({ error: 'Client introuvable' })

  if (stripe_webhook_secret) {
    await supabase.from('client_configs').upsert(
      { client_id: client.id, config_type: 'stripe_webhook_secret', encrypted_value: encrypt(stripe_webhook_secret) },
      { onConflict: 'client_id,config_type' }
    )
  }
  if (sender_name) {
    await supabase.from('client_configs').upsert(
      { client_id: client.id, config_type: 'sender_name', encrypted_value: encrypt(sender_name) },
      { onConflict: 'client_id,config_type' }
    )
  }

  res.json(client)
})

clientsRouter.delete('/:id', async (req, res) => {
  const userId = (req as any).userId
  const { error } = await supabase
    .from('clients')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', userId)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).send()
})
