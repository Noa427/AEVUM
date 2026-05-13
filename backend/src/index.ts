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

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000', credentials: true }))

app.use((req, res, next) => {
  if (req.path.startsWith('/api/webhooks')) return next()
  express.json()(req, res, next)
})

app.get('/health', (_, res) => res.json({ ok: true, timestamp: new Date().toISOString() }))
app.use('/api/clients', clientsRouter)
app.use('/api/settings', settingsRouter)
app.use('/api/dashboard', dashboardRouter)
app.use('/api/webhooks', express.raw({ type: 'application/json' }), webhooksRouter)
app.use('/api/tasks', tasksRouter)
app.use('/api/history', historyRouter)
app.use('/api/simulate', simulateRouter)

app.listen(PORT, () => console.log(`Backend démarré sur le port ${PORT}`))
