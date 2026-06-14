import { Router } from 'express'
import { supabase } from '../services/supabase'
import { requireAuth } from '../middleware/auth'
import { generateBusinessReport } from '../services/businessReport'

export const reportsRouter = Router()
reportsRouter.use(requireAuth)

reportsRouter.get('/', async (req, res) => {
  const userId = (req as any).userId
  const page = Math.max(1, parseInt(String(req.query.page ?? '1')) || 1)
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? '20')) || 20))
  const from = (page - 1) * limit

  const { data, error, count } = await supabase
    .from('business_reports')
    .select('id, content, metrics_json, created_at', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ data, total: count ?? 0, page, limit })
})

reportsRouter.get('/:id', async (req, res) => {
  const userId = (req as any).userId
  const { data, error } = await supabase
    .from('business_reports')
    .select('id, content, metrics_json, created_at')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single()

  if (error || !data) return res.status(404).json({ error: 'Rapport introuvable' })
  res.json(data)
})

reportsRouter.post('/generate', async (req, res) => {
  const userId = (req as any).userId
  try {
    const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(userId)
    const email = userData?.user?.email
    if (userErr || !email) return res.status(400).json({ error: 'Email admin introuvable' })

    const report = await generateBusinessReport(userId, email)
    res.status(201).json(report)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})
