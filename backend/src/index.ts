import 'dotenv/config'
import express from 'express'
import cors from 'cors'
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

const adminCors = cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000', credentials: true })
const portalCors = cors({ origin: process.env.VITRINE_URL || 'http://localhost:3000', credentials: false })

app.set('trust proxy', 1)

app.use((req, _res, next) => {
  if (req.path.startsWith('/api/webhooks')) return next()
  express.json()(req, _res, next)
})

app.get('/health', (_, res) => res.json({ ok: true, timestamp: new Date().toISOString() }))

// Routes admin (dashboard/admin frontend)
app.use('/api', adminCors, apiLimiter)
app.use('/api/clients', clientsRouter)
app.use('/api/settings', settingsRouter)
app.use('/api/dashboard', dashboardRouter)
app.use('/api/webhooks', webhookLimiter, express.raw({ type: 'application/json' }), webhooksRouter)
app.use('/api/tasks', tasksRouter)
app.use('/api/history', historyRouter)
app.use('/api/simulate', simulateLimiter, simulateRouter)

// Routes portail client (site vitrine)
app.use('/api/portal', portalCors, portalLimiter, portalRouter)

// Auth client — portalAuthLimiter (5/min) appliqué sur /client/login dans le router
app.use('/client', portalCors, clientAuthRouter)

// Routes support IA (admin-protected)
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
