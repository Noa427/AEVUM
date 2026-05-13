# Phase 2 — Pilier Récupération impayés — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implémenter le pilier "Récupération impayés" — réception webhook Stripe → création tâche → génération email de relance (mode manuel ou automatique) → envoi via Resend.

**Architecture:** Le webhook Stripe crée une `pending_task` en base. En mode manuel, l'admin ouvre un drawer, colle la réponse Claude.ai, prévisualise, puis envoie. En mode auto, Claude API génère et Resend envoie directement. La page /history liste les `activity_logs`.

**Tech Stack:** Express/TypeScript (Stripe SDK, Anthropic SDK, Resend SDK), Next.js 14, Supabase, Tailwind/shadcn Dialog.

---

## File Map

**Backend — nouveaux fichiers :**
- `backend/src/services/templates.ts` — buildPrompt, parseClaudeResponse, wrapEmailHtml
- `backend/src/services/claude.ts` — callClaude (lit clé API depuis settings)
- `backend/src/services/resend.ts` — sendEmail
- `backend/src/middleware/stripe-sig.ts` — verifyStripeSignature
- `backend/src/routes/webhooks.ts` — POST /api/webhooks/stripe/:clientId
- `backend/src/routes/tasks.ts` — GET /api/tasks, POST /:id/preview, POST /:id/send
- `backend/src/routes/history.ts` — GET /api/history
- `backend/src/routes/simulate.ts` — POST /api/simulate

**Backend — fichiers modifiés :**
- `backend/src/index.ts` — mount 4 nouveaux routers
- `backend/.env.example` — ajouter RESEND_FROM

**Frontend — fichiers modifiés :**
- `frontend/app/(app)/tasks/page.tsx` — liste tâches + bouton simuler
- `frontend/app/(app)/history/page.tsx` — tableau activity_logs

**Frontend — nouveaux fichiers :**
- `frontend/components/simulate-modal.tsx` — Dialog : client + montant + nom élève
- `frontend/components/task-drawer.tsx` — Dialog latéral 3 états : saisie → aperçu → envoi

---

### Task 1: Service templates (buildPrompt, parseClaudeResponse, wrapEmailHtml)

**Files:**
- Create: `backend/src/services/templates.ts`

- [ ] **Step 1: Créer le fichier**

```typescript
// backend/src/services/templates.ts

export function buildPrompt(params: {
  sender_name: string
  amount: number
  payment_link: string
  student_name?: string
  product_name?: string
}): string {
  const lines = [
    'Tu es expert en communication pour formateurs en ligne.',
    'Rédige un email de relance pour un élève dont le paiement a échoué.',
    '',
    `Formateur : ${params.sender_name}`,
  ]
  if (params.student_name) lines.push(`Prénom élève : ${params.student_name}`)
  if (params.product_name) lines.push(`Formation : ${params.product_name}`)
  lines.push(
    `Montant : ${params.amount}€`,
    `Lien de paiement : ${params.payment_link}`,
    '',
    'Format de ta réponse (OBLIGATOIRE) :',
    'Objet: [sujet de l\'email ici]',
    '',
    '<p>...</p>',
    `<p>...<a href="${params.payment_link}">Régulariser mon paiement</a>...</p>`,
    '',
    'Ton empathique et professionnel, 3 paragraphes max.',
    'HTML simple uniquement : <p>, <strong>, <a> autorisés.',
  )
  return lines.join('\n')
}

export function parseClaudeResponse(response: string): { subject: string; body_html: string } {
  const lines = response.trim().split('\n')
  const subject = lines[0].replace(/^Objet:\s*/i, '').trim()
  const body_html = lines.slice(2).join('\n').trim()
  return { subject, body_html }
}

export function wrapEmailHtml(body_html: string, sender_name: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
  ${body_html}
  <hr style="border:none;border-top:1px solid #eee;margin:30px 0">
  <p style="font-size:12px;color:#999">Envoyé via AEVUM pour ${sender_name}</p>
</body>
</html>`
}
```

- [ ] **Step 2: Vérifier la compilation TypeScript**

```bash
cd backend && npx tsc --noEmit
```
Attendu : aucune erreur

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/templates.ts
git commit -m "feat: service templates (buildPrompt, parseClaudeResponse, wrapEmailHtml)"
```

---

### Task 2: Service Claude API

**Files:**
- Create: `backend/src/services/claude.ts`

- [ ] **Step 1: Créer le fichier**

```typescript
// backend/src/services/claude.ts
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from './supabase'
import { decrypt } from './encryption'

export async function callClaude(prompt: string): Promise<string> {
  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'anthropic_api_key')
    .single()
  if (!data?.value) throw new Error('Clé API Anthropic non configurée')

  const apiKey = decrypt(data.value)
  const client = new Anthropic({ apiKey })
  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })
  const block = message.content[0]
  if (block.type !== 'text') throw new Error('Réponse Claude inattendue')
  return block.text
}
```

- [ ] **Step 2: Vérifier la compilation**

```bash
cd backend && npx tsc --noEmit
```
Attendu : aucune erreur

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/claude.ts
git commit -m "feat: service Claude API"
```

---

### Task 3: Service Resend

**Files:**
- Create: `backend/src/services/resend.ts`

- [ ] **Step 1: Créer le fichier**

```typescript
// backend/src/services/resend.ts
import { Resend } from 'resend'

export async function sendEmail(params: {
  to: string
  subject: string
  html: string
  reply_to?: string
}): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY!)
  const from = process.env.RESEND_FROM || 'onboarding@resend.dev'
  const { error } = await resend.emails.send({
    from,
    to: params.to,
    subject: params.subject,
    html: params.html,
    ...(params.reply_to ? { replyTo: params.reply_to } : {}),
  })
  if (error) throw new Error(error.message)
}
```

- [ ] **Step 2: Vérifier la compilation**

```bash
cd backend && npx tsc --noEmit
```
Attendu : aucune erreur

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/resend.ts
git commit -m "feat: service Resend email"
```

---

### Task 4: Route simulate

**Files:**
- Create: `backend/src/routes/simulate.ts`

- [ ] **Step 1: Créer le fichier**

```typescript
// backend/src/routes/simulate.ts
import { Router } from 'express'
import { supabase } from '../services/supabase'
import { requireAuth } from '../middleware/auth'
import { buildPrompt } from '../services/templates'
import { decrypt } from '../services/encryption'

export const simulateRouter = Router()
simulateRouter.use(requireAuth)

simulateRouter.post('/', async (req, res) => {
  const { client_id, amount = 197, student_name, product_name } = req.body
  if (!client_id) return res.status(400).json({ error: 'client_id requis' })

  const { data: configs } = await supabase
    .from('client_configs')
    .select('config_type, encrypted_value')
    .eq('client_id', client_id)

  const configMap: Record<string, string> = {}
  for (const c of configs ?? []) configMap[c.config_type] = decrypt(c.encrypted_value)

  const sender_name = configMap['sender_name'] || 'Formateur'
  const payment_link = 'https://example.com/pay'
  const prompt_template = buildPrompt({ sender_name, amount, payment_link, student_name, product_name })
  const context_json = {
    amount,
    customer_email: 'test@example.com',
    payment_link,
    student_name,
    product_name,
    simulated: true,
  }

  const { data, error } = await supabase
    .from('pending_tasks')
    .insert({
      client_id,
      task_type: 'failed_payment',
      context_json,
      prompt_template,
      status: 'pending',
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})
```

- [ ] **Step 2: Vérifier la compilation**

```bash
cd backend && npx tsc --noEmit
```
Attendu : aucune erreur

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/simulate.ts
git commit -m "feat: route POST /api/simulate"
```

---

### Task 5: Middleware Stripe signature

**Files:**
- Create: `backend/src/middleware/stripe-sig.ts`

- [ ] **Step 1: Créer le fichier**

```typescript
// backend/src/middleware/stripe-sig.ts
import { Request, Response, NextFunction } from 'express'
import Stripe from 'stripe'
import { supabase } from '../services/supabase'
import { decrypt } from '../services/encryption'

export async function verifyStripeSignature(req: Request, res: Response, next: NextFunction) {
  const clientId = req.params.clientId
  const sig = req.headers['stripe-signature'] as string | undefined
  if (!sig) return res.status(400).json({ error: 'Signature Stripe manquante' })

  const { data: configs } = await supabase
    .from('client_configs')
    .select('encrypted_value')
    .eq('client_id', clientId)
    .eq('config_type', 'stripe_webhook_secret')

  if (!configs || configs.length === 0) {
    return res.status(400).json({ error: 'Client ou secret introuvable' })
  }

  const secret = decrypt(configs[0].encrypted_value)
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

  try {
    const event = stripe.webhooks.constructEvent(req.body as Buffer, sig, secret)
    ;(req as any).stripeEvent = event
    next()
  } catch (err: any) {
    return res.status(400).json({ error: `Signature invalide: ${err.message}` })
  }
}
```

- [ ] **Step 2: Vérifier la compilation**

```bash
cd backend && npx tsc --noEmit
```
Attendu : aucune erreur

- [ ] **Step 3: Commit**

```bash
git add backend/src/middleware/stripe-sig.ts
git commit -m "feat: middleware vérification signature Stripe"
```

---

### Task 6: Route webhooks Stripe

**Files:**
- Create: `backend/src/routes/webhooks.ts`

- [ ] **Step 1: Créer le fichier**

```typescript
// backend/src/routes/webhooks.ts
import { Router } from 'express'
import Stripe from 'stripe'
import { supabase } from '../services/supabase'
import { decrypt } from '../services/encryption'
import { buildPrompt, parseClaudeResponse, wrapEmailHtml } from '../services/templates'
import { callClaude } from '../services/claude'
import { sendEmail } from '../services/resend'
import { verifyStripeSignature } from '../middleware/stripe-sig'

export const webhooksRouter = Router()

webhooksRouter.post('/:clientId', verifyStripeSignature, async (req, res) => {
  const event = (req as any).stripeEvent as Stripe.Event

  if (event.type !== 'payment_intent.payment_failed') return res.json({ ok: true })

  const pi = event.data.object as Stripe.PaymentIntent
  const clientId = req.params.clientId

  const amount = pi.amount / 100
  const customer_email = pi.receipt_email ?? pi.metadata?.customer_email ?? ''
  const payment_link = pi.metadata?.hosted_invoice_url ?? ''
  const student_name = pi.metadata?.student_name
  const product_name = pi.metadata?.product_name

  const { data: client } = await supabase
    .from('clients')
    .select('email')
    .eq('id', clientId)
    .single()

  const { data: configs } = await supabase
    .from('client_configs')
    .select('config_type, encrypted_value')
    .eq('client_id', clientId)

  const configMap: Record<string, string> = {}
  for (const c of configs ?? []) configMap[c.config_type] = decrypt(c.encrypted_value)
  const sender_name = configMap['sender_name'] || 'Formateur'

  const prompt_template = buildPrompt({ sender_name, amount, payment_link, student_name, product_name })
  const context_json = { amount, customer_email, payment_link, student_name, product_name }

  const { data: autoMode } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'auto_mode')
    .single()
  const isAuto = autoMode?.value === 'true'

  if (!isAuto) {
    await supabase.from('pending_tasks').insert({
      client_id: clientId,
      task_type: 'failed_payment',
      context_json,
      prompt_template,
      status: 'pending',
    })
    return res.json({ ok: true })
  }

  const { data: task } = await supabase
    .from('pending_tasks')
    .insert({
      client_id: clientId,
      task_type: 'failed_payment',
      context_json,
      prompt_template,
      status: 'processing',
    })
    .select()
    .single()

  try {
    const aiResponse = await callClaude(prompt_template)
    const { subject, body_html } = parseClaudeResponse(aiResponse)
    const html = wrapEmailHtml(body_html, sender_name)
    await sendEmail({ to: customer_email, subject, html, reply_to: client?.email })
    await supabase
      .from('pending_tasks')
      .update({ status: 'sent', ai_response: aiResponse, processed_at: new Date().toISOString() })
      .eq('id', task!.id)
    await supabase.from('activity_logs').insert({
      client_id: clientId,
      action_type: 'failed_payment_email',
      payload_json: { subject, to: customer_email, amount },
      status: 'sent',
    })
  } catch {
    await supabase.from('pending_tasks').update({ status: 'failed' }).eq('id', task!.id)
  }

  res.json({ ok: true })
})
```

- [ ] **Step 2: Vérifier la compilation**

```bash
cd backend && npx tsc --noEmit
```
Attendu : aucune erreur

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/webhooks.ts
git commit -m "feat: route POST /api/webhooks/stripe/:clientId (dual mode)"
```

---

### Task 7: Route tasks (GET, preview, send)

**Files:**
- Create: `backend/src/routes/tasks.ts`

- [ ] **Step 1: Créer le fichier**

```typescript
// backend/src/routes/tasks.ts
import { Router } from 'express'
import { supabase } from '../services/supabase'
import { requireAuth } from '../middleware/auth'
import { parseClaudeResponse, wrapEmailHtml } from '../services/templates'
import { sendEmail } from '../services/resend'
import { decrypt } from '../services/encryption'

export const tasksRouter = Router()
tasksRouter.use(requireAuth)

tasksRouter.get('/', async (_req, res) => {
  const { data, error } = await supabase
    .from('pending_tasks')
    .select('*, clients(name, email)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

tasksRouter.post('/:id/preview', async (req, res) => {
  const { ai_response } = req.body
  if (!ai_response) return res.status(400).json({ error: 'ai_response requis' })
  try {
    const parsed = parseClaudeResponse(ai_response)
    res.json(parsed)
  } catch {
    res.status(400).json({ error: 'Format de réponse invalide' })
  }
})

tasksRouter.post('/:id/send', async (req, res) => {
  const { subject, body_html, ai_response } = req.body
  if (!subject || !body_html) return res.status(400).json({ error: 'subject et body_html requis' })

  const { data: task, error: taskError } = await supabase
    .from('pending_tasks')
    .select('*, clients(email)')
    .eq('id', req.params.id)
    .single()
  if (taskError || !task) return res.status(404).json({ error: 'Tâche introuvable' })

  const { data: configs } = await supabase
    .from('client_configs')
    .select('config_type, encrypted_value')
    .eq('client_id', task.client_id)

  const configMap: Record<string, string> = {}
  for (const c of configs ?? []) configMap[c.config_type] = decrypt(c.encrypted_value)
  const sender_name = configMap['sender_name'] || 'Formateur'

  const customer_email = (task.context_json as any).customer_email as string
  const html = wrapEmailHtml(body_html, sender_name)

  try {
    await sendEmail({ to: customer_email, subject, html, reply_to: (task as any).clients?.email })
    await supabase
      .from('pending_tasks')
      .update({ status: 'sent', ai_response, processed_at: new Date().toISOString() })
      .eq('id', task.id)
    await supabase.from('activity_logs').insert({
      client_id: task.client_id,
      action_type: 'failed_payment_email',
      payload_json: { subject, to: customer_email },
      status: 'sent',
    })
    res.json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})
```

- [ ] **Step 2: Vérifier la compilation**

```bash
cd backend && npx tsc --noEmit
```
Attendu : aucune erreur

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/tasks.ts
git commit -m "feat: routes GET /api/tasks, POST /:id/preview, POST /:id/send"
```

---

### Task 8: Route history

**Files:**
- Create: `backend/src/routes/history.ts`

- [ ] **Step 1: Créer le fichier**

```typescript
// backend/src/routes/history.ts
import { Router } from 'express'
import { supabase } from '../services/supabase'
import { requireAuth } from '../middleware/auth'

export const historyRouter = Router()
historyRouter.use(requireAuth)

historyRouter.get('/', async (_req, res) => {
  const { data, error } = await supabase
    .from('activity_logs')
    .select('*, clients(name)')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})
```

- [ ] **Step 2: Vérifier la compilation**

```bash
cd backend && npx tsc --noEmit
```
Attendu : aucune erreur

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/history.ts
git commit -m "feat: route GET /api/history"
```

---

### Task 9: Wiring — index.ts + env.example

**Files:**
- Modify: `backend/src/index.ts`
- Modify: `backend/.env.example`

- [ ] **Step 1: Modifier index.ts**

Remplacer le contenu de `backend/src/index.ts` par :

```typescript
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
```

- [ ] **Step 2: Mettre à jour .env.example**

Ajouter à `backend/.env.example` la ligne `RESEND_FROM=onboarding@resend.dev` après `RESEND_API_KEY=`.

Le fichier complet doit être :
```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
RESEND_FROM=onboarding@resend.dev
ENCRYPTION_KEY=
ANTHROPIC_API_KEY=
STRIPE_SECRET_KEY=
FRONTEND_URL=http://localhost:3000
PORT=3001
```

- [ ] **Step 3: Vérifier la compilation**

```bash
cd backend && npx tsc --noEmit
```
Attendu : aucune erreur

- [ ] **Step 4: Vérifier que le backend démarre**

```bash
cd backend && npm run dev
```
Attendu dans la console : `Backend démarré sur le port 3001`

- [ ] **Step 5: Commit**

```bash
git add backend/src/index.ts backend/.env.example
git commit -m "feat: wiring Phase 2 routes dans index.ts"
```

---

### Task 10: Frontend — page /history

**Files:**
- Modify: `frontend/app/(app)/history/page.tsx`

- [ ] **Step 1: Remplacer le placeholder**

```typescript
// frontend/app/(app)/history/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'

interface LogRow {
  id: string
  action_type: string
  status: string
  created_at: string
  payload_json: Record<string, any>
  clients: { name: string } | null
}

export default function HistoryPage() {
  const [logs, setLogs] = useState<LogRow[]>([])

  useEffect(() => {
    api.get<LogRow[]>('/api/history').then(setLogs).catch(() => {})
  }, [])

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Historique</h1>
      {logs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun envoi pour l'instant.</p>
      ) : (
        <div className="border border-border rounded-lg divide-y divide-border">
          {logs.map(log => (
            <div key={log.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium">{log.clients?.name ?? '—'}</p>
                <p className="text-xs text-muted-foreground">
                  {log.action_type} · {new Date(log.created_at).toLocaleString('fr-FR')}
                </p>
                {log.payload_json?.to && (
                  <p className="text-xs text-muted-foreground">{log.payload_json.to}</p>
                )}
              </div>
              <Badge variant={log.status === 'sent' ? 'default' : 'destructive'}>
                {log.status}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/(app)/history/page.tsx
git commit -m "feat: page /history (activity_logs)"
```

---

### Task 11: Frontend — SimulateModal

**Files:**
- Create: `frontend/components/simulate-modal.tsx`

- [ ] **Step 1: Créer le fichier**

```typescript
// frontend/components/simulate-modal.tsx
'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface Client { id: string; name: string }

interface Props {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

export function SimulateModal({ open, onClose, onCreated }: Props) {
  const [clients, setClients] = useState<Client[]>([])
  const [clientId, setClientId] = useState('')
  const [amount, setAmount] = useState('197')
  const [studentName, setStudentName] = useState('')
  const [productName, setProductName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) api.get<Client[]>('/api/clients').then(setClients).catch(() => {})
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!clientId) { setError('Sélectionner un client'); return }
    setLoading(true)
    setError('')
    try {
      await api.post('/api/simulate', {
        client_id: clientId,
        amount: Number(amount),
        student_name: studentName || undefined,
        product_name: productName || undefined,
      })
      setClientId('')
      setAmount('197')
      setStudentName('')
      setProductName('')
      onCreated()
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Simuler un événement</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 mt-2">
          <select
            value={clientId}
            onChange={e => setClientId(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Sélectionner un client</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <Input
            type="number"
            placeholder="Montant (€)"
            value={amount}
            onChange={e => setAmount(e.target.value)}
          />
          <Input
            placeholder="Prénom élève (optionnel)"
            value={studentName}
            onChange={e => setStudentName(e.target.value)}
          />
          <Input
            placeholder="Nom formation (optionnel)"
            value={productName}
            onChange={e => setProductName(e.target.value)}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Simulation...' : 'Simuler'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/simulate-modal.tsx
git commit -m "feat: SimulateModal — créer fausse tâche pending"
```

---

### Task 12: Frontend — TaskDrawer (3 états)

**Files:**
- Create: `frontend/components/task-drawer.tsx`

Le drawer est implémenté avec Dialog positionné à droite (pas de dépendance Sheet supplémentaire).

- [ ] **Step 1: Créer le fichier**

```typescript
// frontend/components/task-drawer.tsx
'use client'
import { useState } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'

interface Task {
  id: string
  task_type: string
  context_json: Record<string, any>
  prompt_template: string | null
  clients: { name: string; email: string } | null
}

interface Props {
  task: Task | null
  onClose: () => void
  onSent: () => void
}

type DrawerState = 'input' | 'preview' | 'sending' | 'done'

export function TaskDrawer({ task, onClose, onSent }: Props) {
  const [aiResponse, setAiResponse] = useState('')
  const [preview, setPreview] = useState<{ subject: string; body_html: string } | null>(null)
  const [state, setState] = useState<DrawerState>('input')
  const [error, setError] = useState('')

  function handleClose() {
    setAiResponse('')
    setPreview(null)
    setState('input')
    setError('')
    onClose()
  }

  async function handlePreview() {
    setError('')
    try {
      const data = await api.post<{ subject: string; body_html: string }>(
        `/api/tasks/${task!.id}/preview`,
        { ai_response: aiResponse }
      )
      setPreview(data)
      setState('preview')
    } catch (err: any) {
      setError(err.message)
    }
  }

  async function handleSend() {
    setState('sending')
    setError('')
    try {
      await api.post(`/api/tasks/${task!.id}/send`, {
        subject: preview!.subject,
        body_html: preview!.body_html,
        ai_response: aiResponse,
      })
      setState('done')
      setTimeout(() => { handleClose(); onSent() }, 1500)
    } catch (err: any) {
      setError(err.message)
      setState('preview')
    }
  }

  function copyPrompt() {
    if (task?.prompt_template) navigator.clipboard.writeText(task.prompt_template)
  }

  return (
    <Dialog open={!!task} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            {task?.task_type === 'failed_payment' ? 'Paiement échoué' : task?.task_type} —{' '}
            {task?.clients?.name}
          </DialogTitle>
        </DialogHeader>

        {task && state !== 'done' && (
          <div className="flex flex-col gap-4 flex-1 overflow-y-auto">
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Montant : <span className="text-foreground font-medium">{task.context_json.amount}€</span></p>
              <p>Email élève : <span className="text-foreground">{task.context_json.customer_email}</span></p>
            </div>

            {state === 'input' && (
              <>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-medium uppercase text-muted-foreground">Prompt</p>
                    <Button variant="ghost" size="sm" onClick={copyPrompt}>Copier</Button>
                  </div>
                  <pre className="text-xs bg-muted rounded-md p-3 whitespace-pre-wrap break-words">
                    {task.prompt_template}
                  </pre>
                </div>
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Réponse Claude</p>
                  <textarea
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[140px] resize-none"
                    placeholder="Coller la réponse Claude ici..."
                    value={aiResponse}
                    onChange={e => setAiResponse(e.target.value)}
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <div className="flex justify-end">
                  <Button onClick={handlePreview} disabled={!aiResponse.trim()}>
                    Aperçu →
                  </Button>
                </div>
              </>
            )}

            {state === 'preview' && preview && (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Objet :</span>
                  <Badge variant="secondary">{preview.subject}</Badge>
                </div>
                <div
                  className="border border-border rounded-md p-4 text-sm overflow-y-auto flex-1"
                  dangerouslySetInnerHTML={{ __html: preview.body_html }}
                />
                {error && <p className="text-sm text-destructive">{error}</p>}
                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setState('input')}>← Modifier</Button>
                  <Button onClick={handleSend}>Envoyer l'email →</Button>
                </div>
              </>
            )}

            {state === 'sending' && (
              <div className="flex items-center justify-center flex-1 text-sm text-muted-foreground">
                Envoi en cours...
              </div>
            )}
          </div>
        )}

        {state === 'done' && (
          <div className="flex items-center justify-center flex-1 text-sm font-medium text-green-500">
            Email envoyé ✓
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/task-drawer.tsx
git commit -m "feat: TaskDrawer 3 états (saisie → aperçu → envoi)"
```

---

### Task 13: Frontend — page /tasks

**Files:**
- Modify: `frontend/app/(app)/tasks/page.tsx`

- [ ] **Step 1: Remplacer le placeholder**

```typescript
// frontend/app/(app)/tasks/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SimulateModal } from '@/components/simulate-modal'
import { TaskDrawer } from '@/components/task-drawer'

interface Task {
  id: string
  task_type: string
  context_json: Record<string, any>
  prompt_template: string | null
  created_at: string
  clients: { name: string; email: string } | null
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [showSimulate, setShowSimulate] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)

  async function load() {
    const data = await api.get<Task[]>('/api/tasks').catch(() => [])
    setTasks(data)
  }

  useEffect(() => { load() }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Tâches en attente</h1>
        <Button variant="outline" onClick={() => setShowSimulate(true)}>
          Simuler un événement
        </Button>
      </div>

      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune tâche en attente.</p>
      ) : (
        <div className="border border-border rounded-lg divide-y divide-border">
          {tasks.map(task => (
            <div
              key={task.id}
              className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-accent/30 transition-colors"
              onClick={() => setSelectedTask(task)}
            >
              <div>
                <p className="text-sm font-medium">{task.clients?.name ?? '—'}</p>
                <p className="text-xs text-muted-foreground">
                  {task.context_json.amount}€ · {new Date(task.created_at).toLocaleString('fr-FR')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {task.context_json.simulated && (
                  <Badge variant="outline">simulé</Badge>
                )}
                <Badge variant="secondary">en attente</Badge>
              </div>
            </div>
          ))}
        </div>
      )}

      <SimulateModal
        open={showSimulate}
        onClose={() => setShowSimulate(false)}
        onCreated={load}
      />
      <TaskDrawer
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onSent={load}
      />
    </div>
  )
}
```

- [ ] **Step 2: Commit final**

```bash
git add frontend/app/(app)/tasks/page.tsx
git commit -m "feat: page /tasks — liste + SimulateModal + TaskDrawer"
```

---

## Vérification end-to-end

Après les 13 tâches, tester le flux complet :

1. Démarrer les deux serveurs (`npm run dev` dans `/backend` et `/frontend`)
2. Naviguer vers `http://localhost:3000/tasks`
3. Cliquer "Simuler un événement" → sélectionner un client → "Simuler"
4. La tâche apparaît dans la liste → cliquer dessus
5. Copier le prompt → aller sur claude.ai → coller → copier la réponse
6. Coller dans le drawer → "Aperçu →" → vérifier sujet + corps email
7. "Envoyer l'email →" → vérifier "Email envoyé ✓"
8. Naviguer vers `/history` → l'entrée apparaît
