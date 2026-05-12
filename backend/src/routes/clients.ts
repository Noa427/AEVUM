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
    // Rollback: supprimer le client créé pour éviter un enregistrement sans configs
    await supabase.from('clients').delete().eq('id', client.id)
    return res.status(500).json({ error: configError.message })
  }

  res.status(201).json(client)
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
