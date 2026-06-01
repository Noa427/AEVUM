import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { supabase } from '../services/supabase'

export interface ClientJwtPayload {
  clientId: string
  email: string
  tv?: number
}

export async function authenticateClient(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Non autorisé' })

  let payload: ClientJwtPayload
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET!, { algorithms: ['HS256'] }) as ClientJwtPayload
  } catch {
    return res.status(401).json({ error: 'Non autorisé' })
  }

  const { data: client } = await supabase
    .from('clients')
    .select('token_version')
    .eq('id', payload.clientId)
    .single()

  if (!client || client.token_version !== (payload.tv ?? 0)) {
    return res.status(401).json({ error: 'Non autorisé' })
  }

  ;(req as any).clientId = payload.clientId
  ;(req as any).clientEmail = payload.email
  next()
}
