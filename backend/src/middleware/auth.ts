import { Request, Response, NextFunction } from 'express'
import { createClient } from '@supabase/supabase-js'

// Utilise anon key + JWT user pour valider les sessions frontend
const supabaseAuth = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
)

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Non authentifié' })

  const { data: { user }, error } = await supabaseAuth.auth.getUser(token)
  if (error || !user) return res.status(401).json({ error: 'Token invalide' })

  ;(req as any).userId = user.id
  next()
}
