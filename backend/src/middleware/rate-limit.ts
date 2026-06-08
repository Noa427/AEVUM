import rateLimit from 'express-rate-limit'

const msg = (text: string) => ({ error: text })

export const webhookLimiter = rateLimit({
  windowMs: 60_000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: msg('Trop de requêtes webhook, réessayez dans une minute.'),
})

export const simulateLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: msg('Trop de simulations, réessayez dans une minute.'),
})

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: msg('Trop de requêtes, réessayez dans une minute.'),
})

export const portalLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: msg('Trop de requêtes portail, réessayez dans une minute.'),
})

export const portalAuthLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: msg('Trop de tentatives d\'authentification, réessayez dans une minute.'),
})

export const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: msg('Trop de tentatives de connexion, réessayez dans 15 minutes.'),
})

export const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: msg('Trop de tentatives, réessayez dans 15 minutes.'),
})

export const trackingLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: msg('Trop de requêtes, réessayez dans une minute.'),
})

export const aiLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  keyGenerator: (req) => `ai:${(req as any).clientId}`,
  validate: { ip: false },
  standardHeaders: true,
  legacyHeaders: false,
  message: msg('Trop de requêtes IA, réessayez dans une minute.'),
})
