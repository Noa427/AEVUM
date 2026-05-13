// backend/src/routes/history.ts
import { Router } from 'express'
import { supabase } from '../services/supabase'
import { requireAuth } from '../middleware/auth'

export const historyRouter = Router()
historyRouter.use(requireAuth)

historyRouter.get('/', async (_req, res) => {
  const { data, error } = await supabase
    .from('activity_logs')
    .select('*, clients(name)')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})
