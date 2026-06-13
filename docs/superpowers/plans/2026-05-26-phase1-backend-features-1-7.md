# Phase 1 Backend — Features 1-7 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 7 backend features: test-send, global pause mode, blacklist management, ROI dunning stats, students panel, and manual email trigger.

**Architecture:** All new endpoints added to `backend/src/routes/clientAuth.ts` (existing pattern). Two new DB migrations. Pause check integrated into webhooks and cron via a helper pattern. Students derived from pending_tasks (no new table needed).

**Tech Stack:** Node.js/Express/TypeScript, Supabase (PostgREST + JS SDK), Resend, Zod, JWT (existing stack)

---

## File Map

| File | Action | Reason |
|---|---|---|
| `supabase/migrations/012_add_paused_until.sql` | Create | Feature 2 — pause column on clients |
| `supabase/migrations/013_client_blacklist.sql` | Create | Feature 4 — blacklist table |
| `backend/src/middleware/authenticateClient.ts` | Modify | Attach clientEmail from JWT payload |
| `backend/src/schemas/client.ts` | Modify | Add Zod schemas: TestSendSchema, PauseSchema, BlacklistAddSchema, ManualSendSchema |
| `backend/src/routes/clientAuth.ts` | Modify | Add all new endpoints (Features 1, 2, 4, 5, 6, 7) |
| `backend/src/routes/webhooks.ts` | Modify | Feature 2 (pause check) + Feature 5 (payment_recovered tracking) |
| `backend/src/cron.ts` | Modify | Feature 2 — pause check in all job handlers |

---

## Task 1: Migrations

**Files:**
- Create: `supabase/migrations/012_add_paused_until.sql`
- Create: `supabase/migrations/013_client_blacklist.sql`

- [ ] **Step 1: Create migration 012**

```sql
-- supabase/migrations/012_add_paused_until.sql
ALTER TABLE clients ADD COLUMN IF NOT EXISTS paused_until TIMESTAMPTZ;
```

- [ ] **Step 2: Create migration 013**

```sql
-- supabase/migrations/013_client_blacklist.sql
CREATE TABLE client_blacklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  email TEXT NOT NULL,
  reason TEXT,
  blacklisted_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT client_blacklist_unique UNIQUE (client_id, email)
);

CREATE INDEX idx_client_blacklist_client ON client_blacklist(client_id);
CREATE INDEX idx_client_blacklist_email ON client_blacklist(client_id, email);
```

- [ ] **Step 3: Apply migrations in Supabase Dashboard SQL Editor**

Run both SQL files in order. Verify: `SELECT column_name FROM information_schema.columns WHERE table_name='clients' AND column_name='paused_until'` returns one row. Verify: `SELECT table_name FROM information_schema.tables WHERE table_name='client_blacklist'` returns one row.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/012_add_paused_until.sql supabase/migrations/013_client_blacklist.sql
git commit -m "feat(db): add paused_until column + client_blacklist table"
```

---

## Task 2: Update authenticateClient Middleware

**Files:**
- Modify: `backend/src/middleware/authenticateClient.ts`

- [ ] **Step 1: Attach clientEmail from JWT payload**

Replace:
```typescript
;(req as any).clientId = payload.clientId
next()
```
With:
```typescript
;(req as any).clientId = payload.clientId
;(req as any).clientEmail = payload.email
next()
```

The JWT already encodes `email: client.client_email` at login time. No other change needed.

- [ ] **Step 2: Verify no regressions**

Existing routes use `(req as any).clientId` only — adding `clientEmail` is additive, no breakage.

---

## Task 3: Zod Schemas

**Files:**
- Modify: `backend/src/schemas/client.ts`

- [ ] **Step 1: Add new schemas at end of file**

```typescript
// Template config types accepted for test-send and manual-send
export const TEMPLATE_CONFIG_TYPES = [
  'template_onboarding_j0',
  'template_onboarding_j3',
  'template_onboarding_j7',
  'template_failed_payment',
  'template_failed_payment_j1',
  'template_failed_payment_j3',
  'template_failed_payment_j7',
] as const

export const TestSendSchema = z.object({
  config_type: z.enum(TEMPLATE_CONFIG_TYPES),
})

export const PauseSchema = z.object({
  days: z.number().int().min(1).max(30),
})

export const BlacklistAddSchema = z.object({
  email: z.string().email().max(254),
  reason: z.string().max(500).optional(),
})

export const ManualSendSchema = z.object({
  student_email: z.string().email().max(254),
  config_type: z.string().min(1).max(100),
})
```

---

## Task 4: Feature 1 — POST /client/test-send

**Files:**
- Modify: `backend/src/routes/clientAuth.ts`

- [ ] **Step 1: Add imports at top of clientAuth.ts**

After the existing imports, add (if not already present):
```typescript
import { getEmailTemplate, templateToAiResponse } from '../utils/getEmailTemplate'
import { wrapEmailHtml } from '../services/templates'
```

Also add to the destructured imports from `'../schemas/client'`:
```typescript
import {
  LoginSchema, PasswordSchema, EmailSchema, ConfigSchema,
  AutomationSchema, AutomationUpdateSchema, AiGenerateSchema, AiImproveSchema,
  ForgotPasswordSchema, ResetPasswordSchema,
  ALLOWED_CONFIG_TYPES,
  TestSendSchema, PauseSchema, BlacklistAddSchema, ManualSendSchema,
  TEMPLATE_CONFIG_TYPES,
} from '../schemas/client'
```

- [ ] **Step 2: Add test-send endpoint (append to clientAuth.ts)**

```typescript
// POST /client/test-send
const TEST_VARS: Record<string, string> = {
  nom: 'Marie',
  prenom: 'Dupont',
  email: 'marie.dupont@exemple.com',
  nom_formation: 'Formation Excel Pro',
  lien_acces: 'https://exemple.com/acces',
  mot_de_passe: 'MotDeP4sse!',
  montant: '97',
  lien_paiement: 'https://stripe.com/pay/exemple',
}

clientAuthRouter.post('/test-send', authenticateClient, validate(TestSendSchema), async (req, res) => {
  const clientId = (req as any).clientId as string
  const clientEmail = (req as any).clientEmail as string
  const { config_type } = req.body

  try {
    const { data: senderRow } = await supabase
      .from('client_configs')
      .select('encrypted_value')
      .eq('client_id', clientId)
      .eq('config_type', 'sender_name')
      .single()

    const senderName = senderRow?.encrypted_value
      ? (() => { try { return decrypt(senderRow.encrypted_value) } catch { return 'Test' } })()
      : 'Test'

    const tpl = await getEmailTemplate(clientId, config_type, TEST_VARS)
    const html = wrapEmailHtml(tpl.body.replace(/\n/g, '<br>'), senderName)

    await sendEmail({
      to: clientEmail,
      subject: `[TEST] ${tpl.subject}`,
      html,
      sender_name: senderName,
    })

    await supabase.from('activity_logs').insert({
      client_id: clientId,
      action_type: 'test_email_sent',
      payload_json: { config_type, to: clientEmail },
      status: 'sent',
    })

    res.json({ success: true, message: `Email de test envoyé à ${clientEmail}` })
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message })
  }
})
```

- [ ] **Step 3: Manual verification**

POST to `/client/test-send` with `{ "config_type": "template_onboarding_j0" }` and a valid JWT. Expect `{ success: true, message: "..." }`. Without JWT → 401.

---

## Task 5: Feature 2 — Pause Endpoints

**Files:**
- Modify: `backend/src/routes/clientAuth.ts`

- [ ] **Step 1: Update GET /client/me to include paused_until**

Find the existing GET /client/me handler and replace the select + response:
```typescript
// OLD select
.select('client_email, must_change_password, created_at')

// NEW select
.select('client_email, must_change_password, created_at, paused_until')
```

Replace the response:
```typescript
// OLD
res.json({
  email: data.client_email,
  mustChangePassword: data.must_change_password,
  createdAt: data.created_at,
})

// NEW
res.json({
  email: data.client_email,
  mustChangePassword: data.must_change_password,
  createdAt: data.created_at,
  pausedUntil: data.paused_until ?? null,
})
```

- [ ] **Step 2: Add pause endpoints (append to clientAuth.ts)**

```typescript
// POST /client/pause
clientAuthRouter.post('/pause', authenticateClient, validate(PauseSchema), async (req, res) => {
  const clientId = (req as any).clientId as string
  const { days } = req.body

  const pausedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()

  const { error } = await supabase
    .from('clients')
    .update({ paused_until: pausedUntil })
    .eq('id', clientId)

  if (error) return res.status(500).json({ error: error.message })

  await supabase.from('activity_logs').insert({
    client_id: clientId,
    action_type: 'pause_enabled',
    payload_json: { days, paused_until: pausedUntil },
    status: 'ok',
  })

  res.json({ ok: true, pausedUntil })
})

// DELETE /client/pause
clientAuthRouter.delete('/pause', authenticateClient, async (req, res) => {
  const clientId = (req as any).clientId as string

  const { error } = await supabase
    .from('clients')
    .update({ paused_until: null })
    .eq('id', clientId)

  if (error) return res.status(500).json({ error: error.message })

  await supabase.from('activity_logs').insert({
    client_id: clientId,
    action_type: 'pause_disabled',
    payload_json: {},
    status: 'ok',
  })

  res.json({ ok: true })
})
```

- [ ] **Step 3: Manual verification**

POST `/client/pause` with `{ days: 0 }` → 422 (Zod rejects min:1). POST `/client/pause` with `{ days: 3 }` → `{ ok: true, pausedUntil: "..." }`. GET `/client/me` → includes `pausedUntil`. DELETE `/client/pause` → `{ ok: true }`. GET `/client/me` → `pausedUntil: null`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/middleware/authenticateClient.ts backend/src/schemas/client.ts backend/src/routes/clientAuth.ts
git commit -m "feat(portal): test-send + pause endpoints"
```

---

## Task 6: Feature 2 — Pause Check Integration

**Files:**
- Modify: `backend/src/routes/webhooks.ts`
- Modify: `backend/src/cron.ts`

### webhooks.ts

- [ ] **Step 1: Extend client query to include paused_until**

In `webhooksRouter.post('/:clientId', ...)`, find:
```typescript
const { data: client } = await supabase
  .from('clients')
  .select('email, auto_mode')
  .eq('id', clientId)
  .single()
```

Replace with:
```typescript
const { data: client } = await supabase
  .from('clients')
  .select('email, auto_mode, paused_until')
  .eq('id', clientId)
  .single()
```

- [ ] **Step 2: Add pause guard after client fetch**

After the client query and before the `event.type` check, insert:
```typescript
const pausedUntil = (client as any)?.paused_until
if (pausedUntil && new Date() < new Date(pausedUntil)) {
  await supabase.from('activity_logs').insert({
    client_id: clientId,
    action_type: 'webhook_skipped',
    payload_json: {
      event_type: event.type,
      reason: `Envoi ignoré — compte en pause jusqu'au ${new Date(pausedUntil).toLocaleDateString('fr-FR')}`,
    },
    status: 'skipped',
  })
  return
}
```

### cron.ts

- [ ] **Step 3: Batch-fetch paused clients in runScheduledJobs**

In `runScheduledJobs`, after `if (!jobs || jobs.length === 0) return`, add:
```typescript
const { data: pausedRows } = await supabase
  .from('clients')
  .select('id, paused_until')
  .not('paused_until', 'is', null)
  .gt('paused_until', new Date().toISOString())

const pausedMap = new Map<string, string>(
  (pausedRows ?? []).map((c: any) => [c.id as string, c.paused_until as string])
)
```

- [ ] **Step 4: Add pause check in job loop**

In the `for (const job of jobs)` loop, at the very beginning (before the try block), add:
```typescript
const pausedUntil = pausedMap.get(job.client_id)
if (pausedUntil) {
  await supabase.from('scheduled_jobs').update({ status: 'done' }).eq('id', job.id)
  await supabase.from('activity_logs').insert({
    client_id: job.client_id,
    action_type: 'job_skipped',
    payload_json: {
      job_type: job.job_type,
      reason: `Envoi ignoré — compte en pause jusqu'au ${new Date(pausedUntil).toLocaleDateString('fr-FR')}`,
    },
    status: 'skipped',
  })
  continue
}
```

- [ ] **Step 5: Add paused_until to clients query in runCustomAutomations**

In `runCustomAutomations`, in the `Promise.all` batch, update the clients query:
```typescript
// OLD
supabase.from('clients').select('id, email, name, created_at').in('id', clientIds),

// NEW
supabase.from('clients').select('id, email, name, created_at, paused_until').in('id', clientIds),
```

After building `clientMap` and `senderMap`, add:
```typescript
const pausedAutomationMap = new Map<string, string>()
for (const c of clientsResult.data ?? []) {
  if ((c as any).paused_until && new Date() < new Date((c as any).paused_until)) {
    pausedAutomationMap.set(c.id, (c as any).paused_until)
  }
}
```

In the automation `for` loop, after `if (!client) continue`, add:
```typescript
const autoPausedUntil = pausedAutomationMap.get(automation.client_id)
if (autoPausedUntil) {
  await supabase.from('activity_logs').insert({
    client_id: automation.client_id,
    action_type: 'automation_skipped',
    payload_json: {
      automation_id: automation.id,
      reason: `Envoi ignoré — compte en pause jusqu'au ${new Date(autoPausedUntil).toLocaleDateString('fr-FR')}`,
    },
    status: 'skipped',
  })
  continue
}
```

- [ ] **Step 6: Add pause check in sendWeeklyReport**

In `sendWeeklyReport`, add `paused_until` to the clients query:
```typescript
// OLD
const { data: clients } = await supabase.from('clients').select('id, name, email')

// NEW
const { data: clients } = await supabase.from('clients').select('id, name, email, paused_until')
```

In the `for (const client of clients)` loop, at the start (before logs query), add:
```typescript
if ((client as any).paused_until && new Date() < new Date((client as any).paused_until)) {
  console.log(`[cron] rapport hebdo ignoré pour ${client.name} — compte en pause`)
  continue
}
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/webhooks.ts backend/src/cron.ts
git commit -m "feat(pause): check pause before all email sends in webhooks + cron"
```

---

## Task 7: Feature 4 — Blacklist CRUD

**Files:**
- Modify: `backend/src/routes/clientAuth.ts`

- [ ] **Step 1: Add blacklist endpoints (append to clientAuth.ts)**

```typescript
// GET /client/blacklist
clientAuthRouter.get('/blacklist', authenticateClient, async (req, res) => {
  const clientId = (req as any).clientId as string

  const { data, error } = await supabase
    .from('client_blacklist')
    .select('email, reason, blacklisted_at')
    .eq('client_id', clientId)
    .order('blacklisted_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })

  res.json(data ?? [])
})

// POST /client/blacklist
clientAuthRouter.post('/blacklist', authenticateClient, validate(BlacklistAddSchema), async (req, res) => {
  const clientId = (req as any).clientId as string
  const { email, reason } = req.body

  const { error } = await supabase
    .from('client_blacklist')
    .insert({ client_id: clientId, email: email.toLowerCase(), reason: reason ?? null })

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Cet email est déjà blacklisté' })
    return res.status(500).json({ error: error.message })
  }

  await supabase.from('activity_logs').insert({
    client_id: clientId,
    action_type: 'blacklist_add',
    payload_json: { email: email.toLowerCase(), reason: reason ?? null },
    status: 'ok',
  })

  res.status(201).json({ ok: true })
})

// DELETE /client/blacklist/:email
clientAuthRouter.delete('/blacklist/:email', authenticateClient, async (req, res) => {
  const clientId = (req as any).clientId as string
  const email = decodeURIComponent(req.params.email).toLowerCase()

  const { error, count } = await supabase
    .from('client_blacklist')
    .delete({ count: 'exact' })
    .eq('client_id', clientId)
    .eq('email', email)

  if (error) return res.status(500).json({ error: error.message })
  if (count === 0) return res.status(404).json({ error: 'Email introuvable dans la blacklist' })

  await supabase.from('activity_logs').insert({
    client_id: clientId,
    action_type: 'blacklist_remove',
    payload_json: { email },
    status: 'ok',
  })

  res.json({ ok: true })
})
```

- [ ] **Step 2: Manual verification**

POST `/client/blacklist` `{ email: "not-an-email" }` → 422 (Zod). POST `{ email: "test@test.com" }` → 201. POST again → 409. GET `/client/blacklist` → `[{ email: "test@test.com", reason: null, blacklisted_at: "..." }]`. DELETE `/client/blacklist/test%40test.com` → `{ ok: true }`. GET again → `[]`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/clientAuth.ts
git commit -m "feat(portal): blacklist CRUD endpoints"
```

---

## Task 8: Feature 5 — ROI Dunning Stats

**Files:**
- Modify: `backend/src/routes/webhooks.ts`
- Modify: `backend/src/routes/clientAuth.ts`

### webhooks.ts — track payment recoveries

- [ ] **Step 1: Add invoice.payment_succeeded handler to webhooksRouter**

In `webhooksRouter.post('/:clientId', ...)`, add a new branch in the event type check:
```typescript
// After the existing conditions:
if (event.type === 'payment_intent.payment_failed' || event.type === 'invoice.payment_failed') {
  await handleFailedPayment(...)
} else if (event.type === 'checkout.session.completed') {
  await handleCheckoutCompleted(...)
} else if (event.type === 'invoice.payment_succeeded') {
  await handlePaymentRecovered({ event, clientId })
}
```

- [ ] **Step 2: Add handlePaymentRecovered function in webhooks.ts**

```typescript
async function handlePaymentRecovered(opts: { event: any; clientId: string }) {
  const { event, clientId } = opts
  const inv = event.data.object as any
  const customerEmail = inv.customer_email ?? inv.metadata?.customer_email ?? ''
  const amount = (inv.amount_paid ?? inv.amount_due ?? 0) / 100

  if (!customerEmail) return

  // Only log as recovery if there was a prior dunning attempt for this customer
  const { count } = await supabase
    .from('activity_logs')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .like('action_type', 'failed_payment%')
    .eq('status', 'sent')
    .contains('payload_json', { to: customerEmail })

  if (!count || count === 0) return

  await supabase.from('activity_logs').insert({
    client_id: clientId,
    action_type: 'payment_recovered',
    payload_json: { customer_email: customerEmail, amount },
    status: 'ok',
  })
  console.log(`[webhook] paiement récupéré pour ${customerEmail} — ${amount}€`)
}
```

### clientAuth.ts — extend GET /client/stats

- [ ] **Step 3: Replace GET /client/stats handler**

Find and replace the entire GET /client/stats handler:
```typescript
// GET /client/stats
clientAuthRouter.get('/stats', authenticateClient, async (req, res) => {
  const clientId = (req as any).clientId as string
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)
  const monthTs = startOfMonth.toISOString()

  const base = () => supabase.from('activity_logs').select('*', { count: 'exact', head: true }).eq('client_id', clientId)

  const [total, monthly, onboarding, relances, upsells, recoveredRows] = await Promise.all([
    base(),
    base().gte('created_at', monthTs),
    base().like('action_type', '%onboarding%'),
    base().or('action_type.like.%payment%,action_type.like.%relance%'),
    base().like('action_type', '%upsell%'),
    supabase
      .from('activity_logs')
      .select('payload_json')
      .eq('client_id', clientId)
      .eq('action_type', 'payment_recovered')
      .gte('created_at', monthTs),
  ])

  const err = total.error ?? monthly.error ?? onboarding.error ?? relances.error ?? upsells.error ?? recoveredRows.error
  if (err) return res.status(500).json({ error: err.message })

  // dunning sent this month (j1/j3/j7)
  const { count: dunningCount } = await supabase
    .from('activity_logs')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .like('action_type', 'failed_payment%')
    .eq('status', 'sent')
    .gte('created_at', monthTs)

  const recouvrements = recoveredRows.data ?? []
  const montantRecupere = recouvrements.reduce(
    (sum: number, r: any) => sum + ((r.payload_json as any)?.amount ?? 0),
    0
  )
  const recoveredCount = recouvrements.length
  const totalDunning = dunningCount ?? 0
  const taux = totalDunning > 0 ? Math.round((recoveredCount / totalDunning) * 100) : 0

  res.json({
    total_emails: total.count ?? 0,
    ce_mois: monthly.count ?? 0,
    onboarding_envoyes: onboarding.count ?? 0,
    relances_envoyees: relances.count ?? 0,
    upsells_envoyes: upsells.count ?? 0,
    recouvrement_montant_recupere: Math.round(montantRecupere * 100) / 100,
    recouvrement_taux: Math.min(taux, 100),
  })
})
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/webhooks.ts backend/src/routes/clientAuth.ts
git commit -m "feat(stats): ROI dunning — payment_recovered tracking + stats fields"
```

---

## Task 9: Feature 6 — Students Panel

**Files:**
- Modify: `backend/src/routes/clientAuth.ts`

- [ ] **Step 1: Add GET /client/students endpoint**

Append to clientAuth.ts:

```typescript
type StudentStatus = 'actif' | 'en_dunning' | 'suspendu' | 'blackliste'

interface StudentSummary {
  id: string
  nom: string
  prenom: string
  email: string
  formation: string
  status: StudentStatus
  date_inscription: string
  derniere_action: string | null
  emails_recus: number
}

// GET /client/students
clientAuthRouter.get('/students', authenticateClient, async (req, res) => {
  const clientId = (req as any).clientId as string
  const page = Math.max(1, parseInt(req.query.page as string) || 1)
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200)
  const statusFilter = (req.query.status as string) || 'all'
  const search = ((req.query.search as string) || '').toLowerCase().trim()

  // 1. All tasks for this client — source of student data
  const { data: allTasks } = await supabase
    .from('pending_tasks')
    .select('context_json, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: true })
    .limit(5000)

  // 2. Blacklisted emails
  const { data: blacklistRows } = await supabase
    .from('client_blacklist')
    .select('email')
    .eq('client_id', clientId)
  const blacklistedEmails = new Set((blacklistRows ?? []).map((b: any) => b.email as string))

  // 3. Pending dunning jobs (en_dunning status)
  const { data: pendingDunning } = await supabase
    .from('scheduled_jobs')
    .select('context_json')
    .eq('client_id', clientId)
    .like('job_type', 'failed_payment%')
    .eq('status', 'pending')
  const dunningEmails = new Set(
    (pendingDunning ?? [])
      .map((j: any) => (j.context_json as any)?.customer_email as string | undefined)
      .filter(Boolean) as string[]
  )

  // 4. Exhausted dunning (j7 done, no recovery → suspendu)
  const { data: j7Done } = await supabase
    .from('scheduled_jobs')
    .select('context_json')
    .eq('client_id', clientId)
    .eq('job_type', 'failed_payment_j7')
    .eq('status', 'done')
  const j7Emails = new Set(
    (j7Done ?? [])
      .map((j: any) => (j.context_json as any)?.customer_email as string | undefined)
      .filter(Boolean) as string[]
  )
  const { data: recoveredLogs } = await supabase
    .from('activity_logs')
    .select('payload_json')
    .eq('client_id', clientId)
    .eq('action_type', 'payment_recovered')
  const recoveredEmails = new Set(
    (recoveredLogs ?? [])
      .map((l: any) => (l.payload_json as any)?.customer_email as string | undefined)
      .filter(Boolean) as string[]
  )
  const suspendedEmails = new Set([...j7Emails].filter(e => !recoveredEmails.has(e)))

  // 5. Activity logs for derniere_action + emails_recus
  const { data: sentLogs } = await supabase
    .from('activity_logs')
    .select('payload_json, created_at')
    .eq('client_id', clientId)
    .eq('status', 'sent')
    .order('created_at', { ascending: false })
    .limit(5000)

  const logMap = new Map<string, { count: number; derniere: string }>()
  for (const log of sentLogs ?? []) {
    const email = (log.payload_json as any)?.to as string | undefined
    if (!email) continue
    if (!logMap.has(email)) logMap.set(email, { count: 0, derniere: log.created_at })
    logMap.get(email)!.count++
  }

  // 6. Build deduplicated student list (first occurrence = date_inscription)
  const studentMap = new Map<string, StudentSummary>()
  for (const t of allTasks ?? []) {
    const ctx = t.context_json as Record<string, any>
    const email = ctx?.customer_email as string | undefined
    if (!email || studentMap.has(email)) continue

    const logInfo = logMap.get(email)
    const status: StudentStatus = blacklistedEmails.has(email)
      ? 'blackliste'
      : dunningEmails.has(email)
      ? 'en_dunning'
      : suspendedEmails.has(email)
      ? 'suspendu'
      : 'actif'

    studentMap.set(email, {
      id: email,
      nom: ctx?.customer_name ?? ctx?.student_name ?? '',
      prenom: ctx?.student_name ?? '',
      email,
      formation: ctx?.product_name ?? '',
      status,
      date_inscription: t.created_at,
      derniere_action: logInfo?.derniere ?? null,
      emails_recus: logInfo?.count ?? 0,
    })
  }

  let students = [...studentMap.values()]

  // 7. Filter by status and search
  if (statusFilter !== 'all') {
    students = students.filter(s => s.status === statusFilter)
  }
  if (search) {
    students = students.filter(
      s =>
        s.email.toLowerCase().includes(search) ||
        s.nom.toLowerCase().includes(search) ||
        s.prenom.toLowerCase().includes(search)
    )
  }

  const total = students.length
  const offset = (page - 1) * limit
  const paginated = students.slice(offset, offset + limit)

  res.json({ total, page, limit, students: paginated })
})
```

- [ ] **Step 2: Add GET /client/students/:id endpoint**

```typescript
// GET /client/students/:id  (id = email)
clientAuthRouter.get('/students/:id', authenticateClient, async (req, res) => {
  const clientId = (req as any).clientId as string
  const email = decodeURIComponent(req.params.id).toLowerCase()

  // Get all tasks for this student
  const { data: tasks } = await supabase
    .from('pending_tasks')
    .select('context_json, task_type, status, created_at')
    .eq('client_id', clientId)
    .contains('context_json', { customer_email: email })
    .order('created_at', { ascending: false })

  if (!tasks || tasks.length === 0) {
    return res.status(404).json({ error: 'Élève introuvable' })
  }

  // Most recent task has freshest name/formation data
  const latest = tasks[tasks.length - 1].context_json as Record<string, any>

  // Email history from activity_logs
  const { data: logs } = await supabase
    .from('activity_logs')
    .select('action_type, payload_json, created_at')
    .eq('client_id', clientId)
    .eq('status', 'sent')
    .contains('payload_json', { to: email })
    .order('created_at', { ascending: false })

  const emailHistory = (logs ?? []).map((l: any) => ({
    type: l.action_type as string,
    sent_at: l.created_at as string,
    subject: (l.payload_json as any)?.subject ?? '',
  }))

  res.json({
    id: email,
    nom: latest?.customer_name ?? latest?.student_name ?? '',
    prenom: latest?.student_name ?? '',
    email,
    formation: latest?.product_name ?? '',
    date_inscription: tasks[tasks.length - 1].created_at,
    emails_recus: emailHistory.length,
    email_history: emailHistory,
  })
})
```

- [ ] **Step 3: Manual verification**

GET `/client/students?page=1&limit=50&status=all` with no students → `{ total: 0, page: 1, limit: 50, students: [] }`. No crash. GET `/client/students/nonexistent%40test.com` → 404.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/clientAuth.ts
git commit -m "feat(portal): students panel endpoints"
```

---

## Task 10: Feature 7 — Manual Email Send

**Files:**
- Modify: `backend/src/routes/clientAuth.ts`

- [ ] **Step 1: Add POST /client/send-manual endpoint**

```typescript
// POST /client/send-manual
clientAuthRouter.post('/send-manual', authenticateClient, validate(ManualSendSchema), async (req, res) => {
  const clientId = (req as any).clientId as string
  const { student_email, config_type } = req.body

  // Validate config_type: standard template OR custom automation UUID
  const isTemplateType = (TEMPLATE_CONFIG_TYPES as readonly string[]).includes(config_type)
  const isCustomUUID = UUID_RE.test(config_type)

  if (!isTemplateType && !isCustomUUID) {
    return res.status(400).json({ error: 'config_type invalide' })
  }

  // Get sender name
  const { data: senderRow } = await supabase
    .from('client_configs')
    .select('encrypted_value')
    .eq('client_id', clientId)
    .eq('config_type', 'sender_name')
    .single()

  const senderName = senderRow?.encrypted_value
    ? (() => { try { return decrypt(senderRow.encrypted_value) } catch { return 'Formateur' } })()
    : 'Formateur'

  // Get real student data from most recent pending_task
  const { data: latestTask } = await supabase
    .from('pending_tasks')
    .select('context_json')
    .eq('client_id', clientId)
    .contains('context_json', { customer_email: student_email.toLowerCase() })
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const ctx = (latestTask?.context_json as Record<string, any>) ?? {}
  const vars: Record<string, string> = {
    nom: ctx?.customer_name ?? ctx?.student_name ?? '',
    prenom: ctx?.student_name ?? '',
    email: student_email,
    nom_formation: ctx?.product_name ?? '',
    lien_acces: ctx?.lien_acces ?? '',
    mot_de_passe: '',
    montant: String(ctx?.amount ?? ''),
    lien_paiement: ctx?.payment_link ?? ctx?.hosted_invoice_url ?? '',
  }

  let subject: string
  let htmlBody: string

  if (isTemplateType) {
    const tpl = await getEmailTemplate(clientId, config_type as any, vars)
    subject = tpl.subject
    htmlBody = wrapEmailHtml(tpl.body.replace(/\n/g, '<br>'), senderName)
  } else {
    // Custom automation
    const { data: automation } = await supabase
      .from('custom_automations')
      .select('subject, body, active')
      .eq('id', config_type)
      .eq('client_id', clientId)
      .single()

    if (!automation) return res.status(404).json({ error: 'Automation introuvable' })

    // Inject vars into custom automation content
    const injectVars = (text: string) =>
      text.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`)

    subject = injectVars(automation.subject)
    htmlBody = wrapEmailHtml(injectVars(automation.body).replace(/\n/g, '<br>'), senderName)
  }

  try {
    await sendEmail({
      to: student_email.toLowerCase(),
      subject,
      html: htmlBody,
      sender_name: senderName,
    })

    await supabase.from('activity_logs').insert({
      client_id: clientId,
      action_type: 'manual_send',
      payload_json: { config_type, student_email: student_email.toLowerCase(), subject },
      status: 'sent',
    })

    res.json({ success: true })
  } catch (err: any) {
    await supabase.from('activity_logs').insert({
      client_id: clientId,
      action_type: 'manual_send',
      payload_json: { config_type, student_email: student_email.toLowerCase(), error: err.message },
      status: 'failed',
    })
    res.status(500).json({ success: false, error: err.message })
  }
})
```

- [ ] **Step 2: Manual verification**

POST `/client/send-manual` `{ student_email: "not-email", config_type: "template_onboarding_j0" }` → 422. POST `{ student_email: "test@test.com", config_type: "invalid-type" }` → 400. POST with valid template type → email sent, activity_log created.

- [ ] **Step 3: Final commit**

```bash
git add backend/src/routes/clientAuth.ts
git commit -m "feat(portal): manual email send endpoint"
```

---

## Self-Review

### Spec coverage

| Feature | Endpoint(s) | Task |
|---|---|---|
| 1 — test-send | POST /client/test-send | Task 4 |
| 2 — pause global | POST/DELETE /client/pause, GET /me updated, webhooks+cron check | Tasks 5, 6 |
| 4 — blacklist | GET/POST/DELETE /client/blacklist | Task 7 |
| 5 — ROI dunning | invoice.payment_succeeded handler, GET /client/stats extended | Task 8 |
| 6 — students panel | GET /client/students, GET /client/students/:id | Task 9 |
| 7 — manual send | POST /client/send-manual | Task 10 |

### Auth check
All new endpoints use `authenticateClient` middleware → 401 if token missing or invalid. ✓

### Pause check coverage
- webhooks.ts: `handleFailedPayment` + `handleCheckoutCompleted` blocked at router level. ✓
- cron.ts `runScheduledJobs`: batch pause check before each job. ✓
- cron.ts `runCustomAutomations`: per-client pause check via enriched clientsResult. ✓
- cron.ts `sendWeeklyReport`: per-client check via `paused_until` in initial clients query. ✓

### Edge cases
- POST /client/blacklist: Zod validates email format → invalid emails rejected. ✓
- GET /client/students with page=1 and no students → `{ total: 0, students: [] }`, no crash. ✓
- GET /client/students/:id → 404 if not found, no crash. ✓
- Stats ROI: no data → returns `0` for both fields, never null. ✓
- ManualSend: custom automation ownership verified (`.eq('client_id', clientId)`). ✓

### Regressions
- Existing endpoints unchanged; only additive code added. `GET /client/me` adds `pausedUntil` field (additive). `GET /client/stats` adds 2 fields (additive). ✓
