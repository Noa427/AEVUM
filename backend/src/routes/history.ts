import { Router } from 'express'
import { supabase } from '../services/supabase'
import { requireAuth } from '../middleware/auth'

export const historyRouter = Router()
historyRouter.use(requireAuth)

historyRouter.get('/', async (req, res) => {
  const userId = (req as any).userId
  const { status, client_id, page = '1', limit = '20', date_from, date_to } = req.query
  const pageNum = Math.max(1, parseInt(page as string) || 1)
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20))
  const from = (pageNum - 1) * limitNum

  let query = supabase
    .from('activity_logs')
    .select('*, clients!inner(name)', { count: 'exact' })
    .eq('clients.user_id', userId)
    .order('created_at', { ascending: false })
    .range(from, from + limitNum - 1)

  if (status && status !== 'all') query = query.eq('status', status as string)
  if (client_id) query = query.eq('client_id', client_id as string)
  if (date_from) query = query.gte('created_at', date_from as string)
  if (date_to) query = query.lte('created_at', date_to as string)

  const { data, error, count } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json({ data, total: count ?? 0, page: pageNum, limit: limitNum })
})
