import 'dotenv/config'

const REQUIRED_ENV = [
  'JWT_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY', 'ENCRYPTION_KEY', 'FRONTEND_URL', 'VITRINE_URL',
]
const missing = REQUIRED_ENV.filter(k => !process.env[k])
if (missing.length) {
  console.error('Variables d\'environnement manquantes:', missing.join(', '))
  process.exit(1)
}

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { clientsRouter } from './routes/clients'
import { settingsRouter } from './routes/settings'
import { dashboardRouter } from './routes/dashboard'
import { webhooksRouter } from './routes/webhooks'
import { tasksRouter } from './routes/tasks'
import { historyRouter } from './routes/history'
import { simulateRouter } from './routes/simulate'
import { portalRouter } from './routes/portal'
import { supportRouter } from './routes/support'
import { clientAuthRouter } from './routes/clientAuth'
import { errorHandler } from './middleware/error-handler'
import { apiLimiter, webhookLimiter, simulateLimiter, portalLimiter } from './middleware/rate-limit'
import { runScheduledJobs, runCustomAutomations } from './cron'

const app = express()
const PORT = process.env.PORT || 3001

const adminCors = cors({ origin: process.env.FRONTEND_URL, credentials: true })
const portalCors = cors({ origin: process.env.VITRINE_URL, credentials: false })

app.set('trust proxy', 1)

app.use(helmet({
  contentSecurityPolicy: false,
  hsts: { maxAge: 31536000, includeSubDomains: true },
}))

app.use((req, _res, next) => {
  if (req.path.startsWith('/api/webhooks')) return next()
  express.json({ limit: '64kb' })(req, _res, next)
})

app.get('/health', (_, res) => res.json({ ok: true, timestamp: new Date().toISOString() }))

app.use('/api', adminCors, apiLimiter)
app.use('/api/clients', clientsRouter)
app.use('/api/settings', settingsRouter)
app.use('/api/dashboard', dashboardRouter)
app.use('/api/webhooks', webhookLimiter, express.raw({ type: 'application/json' }), webhooksRouter)
app.use('/api/tasks', tasksRouter)
app.use('/api/history', historyRouter)
app.use('/api/simulate', simulateLimiter, simulateRouter)
app.use('/api/portal', portalCors, portalLimiter, portalRouter)
app.use('/client', portalCors, clientAuthRouter)
app.use('/api/support', adminCors, apiLimiter, supportRouter)

app.use(errorHandler)

app.listen(PORT, () => {
  console.log(`Backend démarré sur le port ${PORT}`)
  if (process.env.ENABLE_CRON === 'true') {
    runScheduledJobs()
    runCustomAutomations()
    setInterval(runScheduledJobs, 60 * 60 * 1000)
    setInterval(runCustomAutomations, 60 * 60 * 1000)
  }
})
