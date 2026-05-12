import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { clientsRouter } from './routes/clients'
import { settingsRouter } from './routes/settings'
import { dashboardRouter } from './routes/dashboard'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000', credentials: true }))

// Le parser JSON standard pour toutes les routes sauf les webhooks Stripe (qui nécessitent le raw body)
app.use((req, res, next) => {
  if (req.path.startsWith('/api/webhooks')) return next()
  express.json()(req, res, next)
})

app.get('/health', (_, res) => res.json({ ok: true, timestamp: new Date().toISOString() }))
app.use('/api/clients', clientsRouter)
app.use('/api/settings', settingsRouter)
app.use('/api/dashboard', dashboardRouter)

app.listen(PORT, () => console.log(`Backend démarré sur le port ${PORT}`))
