import { Request } from 'express'
import { supabase } from '../services/supabase'

export function logAdminAccess(req: Request, userId: string): void {
  const forwarded = req.headers['x-forwarded-for'] as string | undefined
  const ip = forwarded?.split(',')[0].trim() ?? req.ip ?? 'unknown'

  void supabase.from('activity_logs').insert({
    user_id: userId,
    action_type: 'admin_request',
    category: 'admin_access',
    payload_json: { route: req.path, method: req.method, ip },
    status: 'ok',
  })
}
