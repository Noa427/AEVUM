import 'dotenv/config'

const REQUIRED_ENV = [
  'JWT_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY', 'ENCRYPTION_KEY', 'FRONTEND_URL', 'VITRINE_URL', 'BACKEND_URL',
  'RESEND_API_KEY', 'RESEND_FROM_EMAIL',
]
const missing = REQUIRED_ENV.filter(k => !process.env[k])
if (missing.length) {
  console.error('Variables d\'environnement manquantes:', missing.join(', '))
  process.exit(1)
}

const OPTIONAL_ENV_GROUPS = [
  { keys: ['ELEVENLABS_API_KEY'], feature: 'Feature 17 (rapport vidéo)' },
  { keys: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER'], feature: 'Feature 20 (SMS)' },
]
for (const { keys, feature } of OPTIONAL_ENV_GROUPS) {
  if (keys.some(k => !process.env[k])) {
    console.warn(`[config] ${feature} désactivée — variables manquantes: ${keys.filter(k => !process.env[k]).join(', ')}`)
  }
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
import { supportRouter } from './routes/support'
import { clientAuthRouter } from './routes/clientAuth'
import { trackingRouter } from './routes/tracking'
import { errorHandler } from './middleware/error-handler'
import { apiLimiter, webhookLimiter, simulateLimiter, portalLimiter } from './middleware/rate-limit'
import {
  runScheduledJobs,
  runCustomAutomations,
  runTestimonialEmails,
  runPredunning,
  runChurnDetection,
  runStudentCoaching,
  sendVideoReport,
} from './cron'

const app = express()
const PORT = process.env.PORT || 3001

const adminCors = cors({ origin: process.env.FRONTEND_URL, credentials: true })
const portalCors = cors({ origin: process.env.VITRINE_URL, credentials: false })

app.set('trust proxy', 1)

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
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
app.use('/client', portalCors, portalLimiter, clientAuthRouter)
app.use('/api/support', adminCors, apiLimiter, supportRouter)
app.use('/track', trackingRouter)

app.use(errorHandler)

app.listen(PORT, () => {
  console.log(`Backend démarré sur le port ${PORT}`)
  if (process.env.ENABLE_CRON === 'true') {
    runScheduledJobs()
    runCustomAutomations()
    runTestimonialEmails()
    runPredunning()
    runChurnDetection()
    runStudentCoaching()
    sendVideoReport()
    setInterval(runScheduledJobs,     60 * 60 * 1000)
    setInterval(runCustomAutomations, 60 * 60 * 1000)
    setInterval(runTestimonialEmails, 60 * 60 * 1000)
    setInterval(runPredunning,        60 * 60 * 1000)
    setInterval(runChurnDetection,    60 * 60 * 1000)
    setInterval(runStudentCoaching,   60 * 60 * 1000)
    setInterval(sendVideoReport,      60 * 60 * 1000)
  }
})
