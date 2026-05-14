import { Router } from 'express'
import { supabase } from '../services/supabase'
import { requireAuth } from '../middleware/auth'

export const dashboardRouter = Router()
dashboardRouter.use(requireAuth)

dashboardRouter.get('/', async (req, res) => {
  const userId = (req as any).userId

  const clientIds = await getClientIds(userId)

  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const [clientsRes, pendingRes, sentRes] = await Promise.all([
    supabase.from('clients').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('pending_tasks').select('id', { count: 'exact', head: true })
      .in('client_id', clientIds.length ? clientIds : [''])
      .eq('status', 'pending'),
    supabase.from('activity_logs').select('id', { count: 'exact', head: true })
      .in('client_id', clientIds.length ? clientIds : [''])
      .eq('status', 'sent')
      .gte('created_at', startOfMonth.toISOString()),
  ])

  res.json({
    clients: clientsRes.count ?? 0,
    pending_tasks: pendingRes.count ?? 0,
    emails_sent: sentRes.count ?? 0,
  })
})

async function getClientIds(userId: string): Promise<string[]> {
  const { data } = await supabase.from('clients').select('id').eq('user_id', userId)
  return (data ?? []).map(c => c.id)
}
