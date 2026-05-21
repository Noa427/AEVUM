import { Request, Response, NextFunction } from 'express'

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    type: err.name || 'Error',
    message: err.message,
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
  }))
  const status = err.status || err.statusCode || 500
  const isDev = process.env.NODE_ENV !== 'production'
  res.status(status).json({
    error: isDev ? (err.message || 'Erreur interne') : 'Erreur interne',
    ...(isDev && { code: err.code || 'INTERNAL_ERROR' }),
  })
}
