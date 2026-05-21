import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export interface ClientJwtPayload {
  clientId: string
  email: string
}

export function authenticateClient(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Non autorisé' })

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as ClientJwtPayload
    ;(req as any).clientId = payload.clientId
    next()
  } catch {
    return res.status(401).json({ error: 'Non autorisé' })
  }
}
