# Phase 2 — Logique Métier Complète Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre l'app opérationnelle de bout en bout : recevoir un event Stripe → traiter → envoyer un email → logger, avec mode auto (Claude API) et mode manuel (copier/coller), plus cron pour les séquences onboarding.

**Architecture:** Le backend Express existant est structuré en routes/services. On complète chaque route/service manquante sans restructurer. Le frontend Next.js appelle le backend via `lib/api.ts`. Le mode auto vs manuel est piloté par la table `settings`.

**Tech Stack:** Node.js/Express/TS, Next.js 14, Supabase, Stripe SDK, Anthropic SDK (claude-sonnet-4-6), Resend SDK, next-themes.

**État initial du code :**
- `webhooks.ts` gère `payment_intent.payment_failed` uniquement → on ajoute `invoice.payment_failed` + `checkout.session.completed`
- `templates.ts` a `buildPrompt` pour failed_payment → on ajoute `getTemplate()` + templates j0/j3/j7
- `tasks.ts` preview est manuel uniquement → on ajoute appel Claude en mode auto
- `cron.ts` absent → à créer
- Frontend : simulate-modal sans event_type, drawer sans mode auto, history sans filtres

---

## File Map

| Fichier | Action | Résumé |
|---|---|---|
| `backend/src/services/templates.ts` | Modify | `getTemplate()` + 4 templates complets |
| `backend/src/routes/webhooks.ts` | Modify | invoice.payment_failed + checkout.session.completed + scheduled_jobs |
| `backend/src/services/resend.ts` | Modify | sender_name dans champ "from" |
| `backend/src/services/claude.ts` | Modify | Accepte model en param |
| `backend/src/routes/simulate.ts` | Modify | event_type + checkout_completed + custom_data |
| `backend/src/routes/tasks.ts` | Modify | Auto mode preview + pagination + action_type dynamique |
| `backend/src/routes/clients.ts` | Modify | PUT /:id + GET /:id |
| `backend/src/routes/settings.ts` | Modify | GET /test-anthropic |
| `backend/src/routes/history.ts` | Modify | Pagination + filtres |
| `backend/src/routes/dashboard.ts` | Modify | Activité récente (5 derniers logs) |
| `backend/src/cron.ts` | Create | Runner scheduled_jobs |
| `backend/src/index.ts` | Modify | Error handler global + init cron |
| `backend/render.yaml` | Create | Web service + cron job hourly |
| `backend/.env.example` | Modify | Toutes les vars à jour |
| `frontend/components/simulate-modal.tsx` | Modify | Select event_type |
| `frontend/app/(app)/tasks/page.tsx` | Modify | Auto-refresh 30s + auto_mode prop |
| `frontend/components/task-drawer.tsx` | Modify | Mode auto (pas de textarea) |
| `frontend/app/(app)/history/page.tsx` | Modify | Filtres + pagination + modal détails |
| `frontend/app/(app)/settings/page.tsx` | Modify | Bouton "Tester" clé API |
| `frontend/app/(app)/clients/page.tsx` | Modify | Edit modal + URL webhook Stripe |
| `frontend/app/(app)/dashboard/page.tsx` | Modify | Activité récente + lien pending |
| `CLAUDE.md` | Modify | État Phase 2 |
| `README.md` | Create | Instructions déploiement |

---

## Task 1 — templates.ts : getTemplate() + templates onboarding

**Files:**
- Modify: `backend/src/services/templates.ts`

- [ ] **Step 1 : Remplacer templates.ts entier**

```typescript
export type TaskType = 'failed_payment' | 'onboarding_j0' | 'onboarding_j3' | 'onboarding_j7'

export function getTemplate(
  task_type: TaskType,
  ctx: Record<string, any>
): { subject_hint: string; prompt: string } {
  switch (task_type) {
    case 'failed_payment':
      return { subject_hint: 'Relance paiement', prompt: buildPromptFailedPayment(ctx) }
    case 'onboarding_j0':
      return { subject_hint: 'Bienvenue', prompt: buildPromptOnboardingJ0(ctx) }
    case 'onboarding_j3':
      return { subject_hint: 'Suivi J+3', prompt: buildPromptOnboardingJ3(ctx) }
    case 'onboarding_j7':
      return { subject_hint: 'Engagement J+7', prompt: buildPromptOnboardingJ7(ctx) }
  }
}

export function buildPromptFailedPayment(ctx: Record<string, any>): string {
  const lines = [
    'Tu es expert en communication pour formateurs en ligne.',
    'Rédige un email de relance pour un élève dont le paiement a échoué.',
    '',
    `Formateur : ${ctx.sender_name ?? 'Formateur'}`,
  ]
  if (ctx.student_name) lines.push(`Prénom élève : ${ctx.student_name}`)
  if (ctx.product_name) lines.push(`Formation : ${ctx.product_name}`)
  lines.push(
    `Montant : ${ctx.amount}€`,
    `Lien de paiement : ${ctx.payment_link ?? ctx.hosted_invoice_url ?? ''}`,
    '',
    'Format de ta réponse (OBLIGATOIRE) :',
    '[SUBJECT]Objet de l\'email[/SUBJECT]',
    '',
    '<p>...</p>',
    `<p>...<a href="${ctx.payment_link ?? ctx.hosted_invoice_url ?? '#'}">Régulariser mon paiement</a>...</p>`,
    '',
    'Ton empathique et professionnel, 3 paragraphes max.',
    'HTML simple uniquement : <p>, <strong>, <a> autorisés.',
  )
  return lines.join('\n')
}

function buildPromptOnboardingJ0(ctx: Record<string, any>): string {
  return [
    'Tu es expert en communication pour formateurs en ligne.',
    'Rédige un email de bienvenue chaleureux pour un nouvel élève qui vient d\'acheter une formation.',
    '',
    `Formateur : ${ctx.sender_name ?? 'Formateur'}`,
    ctx.student_name ? `Prénom élève : ${ctx.student_name}` : '',
    ctx.product_name ? `Formation : ${ctx.product_name}` : '',
    '',
    'Contenu attendu : accueillir chaleureusement, expliquer les prochaines étapes (accès à l\'espace formation), encourager à commencer.',
    '',
    'Format de ta réponse (OBLIGATOIRE) :',
    '[SUBJECT]Objet de l\'email[/SUBJECT]',
    '',
    '<p>...</p>',
    '',
    'Ton enthousiaste et professionnel, 3 paragraphes max.',
    'HTML simple uniquement : <p>, <strong>, <a> autorisés.',
  ].filter(Boolean).join('\n')
}

function buildPromptOnboardingJ3(ctx: Record<string, any>): string {
  return [
    'Tu es expert en communication pour formateurs en ligne.',
    'Rédige un email de suivi pour un élève qui a commencé une formation il y a 3 jours.',
    '',
    `Formateur : ${ctx.sender_name ?? 'Formateur'}`,
    ctx.student_name ? `Prénom élève : ${ctx.student_name}` : '',
    ctx.product_name ? `Formation : ${ctx.product_name}` : '',
    '',
    'Contenu attendu : demander comment se passe la formation, s\'il a des questions, l\'encourager à continuer.',
    '',
    'Format de ta réponse (OBLIGATOIRE) :',
    '[SUBJECT]Objet de l\'email[/SUBJECT]',
    '',
    '<p>...</p>',
    '',
    'Ton bienveillant et accessible, 2-3 paragraphes max.',
    'HTML simple uniquement : <p>, <strong>, <a> autorisés.',
  ].filter(Boolean).join('\n')
}

function buildPromptOnboardingJ7(ctx: Record<string, any>): string {
  return [
    'Tu es expert en communication pour formateurs en ligne.',
    'Rédige un email d\'engagement pour un élève qui a commencé une formation il y a 7 jours.',
    '',
    `Formateur : ${ctx.sender_name ?? 'Formateur'}`,
    ctx.student_name ? `Prénom élève : ${ctx.student_name}` : '',
    ctx.product_name ? `Formation : ${ctx.product_name}` : '',
    '',
    'Contenu attendu : célébrer la première semaine, proposer un appel stratégique ou un contenu bonus, renforcer la motivation.',
    '',
    'Format de ta réponse (OBLIGATOIRE) :',
    '[SUBJECT]Objet de l\'email[/SUBJECT]',
    '',
    '<p>...</p>',
    '',
    'Ton motivant et généreux, 3 paragraphes max.',
    'HTML simple uniquement : <p>, <strong>, <a> autorisés.',
  ].filter(Boolean).join('\n')
}

// Alias pour compatibilité avec webhooks.ts existant
export function buildPrompt(params: {
  sender_name: string
  amount: number
  payment_link: string
  student_name?: string
  product_name?: string
}): string {
  return buildPromptFailedPayment({ ...params, hosted_invoice_url: params.payment_link })
}

export function parseClaudeResponse(response: string): { subject: string; body_html: string } {
  const trimmed = response.trim()

  // Format 1 : [SUBJECT]...[/SUBJECT]
  const subjectMatch = trimmed.match(/\[SUBJECT\](.*?)\[\/SUBJECT\]/s)
  if (subjectMatch) {
    const subject = subjectMatch[1].trim()
    const body_html = trimmed
      .replace(/\[SUBJECT\].*?\[\/SUBJECT\]/s, '')
      .trim()
    return { subject, body_html }
  }

  // Format 2 : "Objet: ..." (legacy)
  const lines = trimmed.split('\n')
  const subjectIdx = lines.findIndex(l => /^Objet:\s*/i.test(l))
  if (subjectIdx !== -1) {
    const subject = lines[subjectIdx].replace(/^Objet:\s*/i, '').trim()
    let bodyStart = subjectIdx + 1
    while (bodyStart < lines.length && lines[bodyStart].trim() === '') bodyStart++
    const body_html = lines.slice(bodyStart).join('\n').trim()
    return { subject, body_html }
  }

  throw new Error('Format Claude invalide : [SUBJECT][/SUBJECT] ou "Objet:" manquant')
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function wrapEmailHtml(body_html: string, sender_name: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
  ${body_html}
  <hr style="border:none;border-top:1px solid #eee;margin:30px 0">
  <p style="font-size:12px;color:#999">Envoyé via AEVUM pour ${escapeHtml(sender_name)}</p>
</body>
</html>`
}
```

- [ ] **Step 2 : Commit**

```bash
git add backend/src/services/templates.ts
git commit -m "feat: getTemplate() + templates onboarding j0/j3/j7 + format [SUBJECT]"
```

---

## Task 2 — claude.ts : model en paramètre

**Files:**
- Modify: `backend/src/services/claude.ts`

- [ ] **Step 1 : Remplacer claude.ts**

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from './supabase'
import { decrypt } from './encryption'

export async function callClaude(
  prompt: string,
  model: string = 'claude-haiku-4-5-20251001'
): Promise<string> {
  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'anthropic_api_key')
    .single()
  if (!data?.value) throw new Error('Clé API Anthropic non configurée')

  const apiKey = decrypt(data.value)
  const client = new Anthropic({ apiKey })
  const message = await client.messages.create({
    model,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })
  const block = message.content[0]
  if (!block || block.type !== 'text') throw new Error('Réponse Claude inattendue')
  return block.text
}
```

- [ ] **Step 2 : Commit**

```bash
git add backend/src/services/claude.ts
git commit -m "feat: callClaude accepte model en paramètre"
```

---

## Task 3 — resend.ts : sender_name dans "from"

**Files:**
- Modify: `backend/src/services/resend.ts`

- [ ] **Step 1 : Remplacer resend.ts**

```typescript
import { Resend } from 'resend'

export async function sendEmail(params: {
  to: string
  subject: string
  html: string
  sender_name?: string
  reply_to?: string
}): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY!)
  const domain = process.env.RESEND_FROM_DOMAIN || 'onboarding@resend.dev'
  const from = params.sender_name
    ? `${params.sender_name} <${domain}>`
    : domain
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

Note : renommer l'env var `RESEND_FROM` → `RESEND_FROM_DOMAIN` dans `.env.example`.

- [ ] **Step 2 : Commit**

```bash
git add backend/src/services/resend.ts
git commit -m "feat: resend from = '{sender_name} <domain>'"
```

---

## Task 4 — webhooks.ts : invoice.payment_failed + checkout.session.completed

**Files:**
- Modify: `backend/src/routes/webhooks.ts`

Les deux events Stripe sont normalisés dans la même structure `context_json` avant insertion.

- [ ] **Step 1 : Remplacer webhooks.ts**

```typescript
import { Router } from 'express'
import Stripe from 'stripe'
import { supabase } from '../services/supabase'
import { decrypt } from '../services/encryption'
import { buildPromptFailedPayment, getTemplate, parseClaudeResponse, wrapEmailHtml } from '../services/templates'
import { callClaude } from '../services/claude'
import { sendEmail } from '../services/resend'
import { verifyStripeSignature } from '../middleware/stripe-sig'

export const webhooksRouter = Router()

webhooksRouter.post('/:clientId', verifyStripeSignature, async (req, res) => {
  const event = (req as any).stripeEvent as Stripe.Event
  const clientId = req.params.clientId

  // Répondre immédiatement à Stripe
  res.json({ ok: true })

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

  const { data: autoMode } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'auto_mode')
    .single()
  const isAuto = autoMode?.value === 'true'

  if (event.type === 'payment_intent.payment_failed' || event.type === 'invoice.payment_failed') {
    await handleFailedPayment({ event, clientId, client, sender_name, isAuto })
  } else if (event.type === 'checkout.session.completed') {
    await handleCheckoutCompleted({ event, clientId, client, sender_name, isAuto })
  }
})

async function handleFailedPayment(opts: {
  event: Stripe.Event
  clientId: string
  client: { email: string } | null
  sender_name: string
  isAuto: boolean
}) {
  const { event, clientId, client, sender_name, isAuto } = opts
  let context_json: Record<string, any>

  if (event.type === 'invoice.payment_failed') {
    const inv = event.data.object as Stripe.Invoice
    context_json = {
      amount: (inv.amount_due ?? 0) / 100,
      currency: inv.currency,
      customer_email: inv.customer_email ?? '',
      hosted_invoice_url: inv.hosted_invoice_url ?? '',
      payment_link: inv.hosted_invoice_url ?? '',
      student_name: inv.metadata?.student_name,
      product_name: inv.metadata?.product_name,
      customer_name: inv.customer_name ?? inv.metadata?.customer_name,
      payment_intent_id: typeof inv.payment_intent === 'string' ? inv.payment_intent : inv.payment_intent?.id,
    }
  } else {
    const pi = event.data.object as Stripe.PaymentIntent
    context_json = {
      amount: (pi.amount ?? 0) / 100,
      currency: pi.currency,
      customer_email: pi.receipt_email ?? pi.metadata?.customer_email ?? '',
      hosted_invoice_url: pi.metadata?.hosted_invoice_url ?? '',
      payment_link: pi.metadata?.hosted_invoice_url ?? '',
      student_name: pi.metadata?.student_name,
      product_name: pi.metadata?.product_name,
      customer_name: pi.metadata?.customer_name,
      payment_intent_id: pi.id,
    }
  }

  const prompt_template = buildPromptFailedPayment({ ...context_json, sender_name })

  if (!isAuto) {
    await supabase.from('pending_tasks').insert({
      client_id: clientId,
      task_type: 'failed_payment',
      context_json: { ...context_json, sender_name },
      prompt_template,
      status: 'pending',
    })
    return
  }

  const { data: task } = await supabase
    .from('pending_tasks')
    .insert({
      client_id: clientId,
      task_type: 'failed_payment',
      context_json: { ...context_json, sender_name },
      prompt_template,
      status: 'processing',
    })
    .select()
    .single()

  if (!task) return

  try {
    if (!context_json.customer_email) throw new Error('customer_email manquant')
    const aiResponse = await callClaude(prompt_template, 'claude-sonnet-4-6')
    const { subject, body_html } = parseClaudeResponse(aiResponse)
    const html = wrapEmailHtml(body_html, sender_name)
    await sendEmail({ to: context_json.customer_email, subject, html, sender_name, reply_to: client?.email })
    await supabase
      .from('pending_tasks')
      .update({ status: 'sent', ai_response: aiResponse, processed_at: new Date().toISOString() })
      .eq('id', task.id)
    await supabase.from('activity_logs').insert({
      client_id: clientId,
      action_type: 'failed_payment_email',
      payload_json: { subject, to: context_json.customer_email, amount: context_json.amount },
      status: 'sent',
    })
  } catch (err: any) {
    await supabase
      .from('pending_tasks')
      .update({ status: 'failed', ai_response: err.message })
      .eq('id', task.id)
    await supabase.from('activity_logs').insert({
      client_id: clientId,
      action_type: 'failed_payment_email',
      payload_json: { error: err.message, customer_email: context_json.customer_email },
      status: 'failed',
    })
  }
}

async function handleCheckoutCompleted(opts: {
  event: Stripe.Event
  clientId: string
  client: { email: string } | null
  sender_name: string
  isAuto: boolean
}) {
  const { event, clientId, client, sender_name, isAuto } = opts
  const session = event.data.object as Stripe.Checkout.Session

  const context_json = {
    amount: (session.amount_total ?? 0) / 100,
    currency: session.currency,
    customer_email: session.customer_details?.email ?? '',
    customer_name: session.customer_details?.name,
    product_name: session.metadata?.product_name,
    student_name: session.metadata?.student_name ?? session.customer_details?.name,
    payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id,
    sender_name,
  }

  const { subject_hint, prompt } = getTemplate('onboarding_j0', context_json)

  const { data: task } = await supabase
    .from('pending_tasks')
    .insert({
      client_id: clientId,
      task_type: 'onboarding_j0',
      context_json,
      prompt_template: prompt,
      status: isAuto ? 'processing' : 'pending',
    })
    .select()
    .single()

  // Créer les scheduled_jobs J+3 et J+7
  const now = new Date()
  const j3 = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
  const j7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  await supabase.from('scheduled_jobs').insert([
    {
      client_id: clientId,
      job_type: 'onboarding_j3',
      context_json,
      scheduled_for: j3.toISOString(),
      status: 'pending',
    },
    {
      client_id: clientId,
      job_type: 'onboarding_j7',
      context_json,
      scheduled_for: j7.toISOString(),
      status: 'pending',
    },
  ])

  if (!isAuto || !task) return

  try {
    if (!context_json.customer_email) throw new Error('customer_email manquant')
    const aiResponse = await callClaude(prompt, 'claude-sonnet-4-6')
    const { subject, body_html } = parseClaudeResponse(aiResponse)
    const html = wrapEmailHtml(body_html, sender_name)
    await sendEmail({ to: context_json.customer_email, subject, html, sender_name, reply_to: client?.email })
    await supabase
      .from('pending_tasks')
      .update({ status: 'sent', ai_response: aiResponse, processed_at: new Date().toISOString() })
      .eq('id', task.id)
    await supabase.from('activity_logs').insert({
      client_id: clientId,
      action_type: 'onboarding_j0_email',
      payload_json: { subject, to: context_json.customer_email },
      status: 'sent',
    })
  } catch (err: any) {
    await supabase
      .from('pending_tasks')
      .update({ status: 'failed', ai_response: err.message })
      .eq('id', task.id)
  }
}
```

- [ ] **Step 2 : Commit**

```bash
git add backend/src/routes/webhooks.ts
git commit -m "feat: webhooks invoice.payment_failed + checkout.session.completed + scheduled_jobs"
```

---

## Task 5 — simulate.ts : event_type + checkout_completed

**Files:**
- Modify: `backend/src/routes/simulate.ts`

- [ ] **Step 1 : Remplacer simulate.ts**

```typescript
import { Router } from 'express'
import { supabase } from '../services/supabase'
import { requireAuth } from '../middleware/auth'
import { getTemplate } from '../services/templates'
import { decrypt } from '../services/encryption'

export const simulateRouter = Router()
simulateRouter.use(requireAuth)

simulateRouter.post('/', async (req, res) => {
  const { client_id, event_type = 'failed_payment', custom_data } = req.body
  if (!client_id) return res.status(400).json({ error: 'client_id requis' })
  if (!['failed_payment', 'checkout_completed'].includes(event_type)) {
    return res.status(400).json({ error: 'event_type invalide' })
  }

  const { data: configs } = await supabase
    .from('client_configs')
    .select('config_type, encrypted_value')
    .eq('client_id', client_id)

  const configMap: Record<string, string> = {}
  for (const c of configs ?? []) configMap[c.config_type] = decrypt(c.encrypted_value)
  const sender_name = configMap['sender_name'] || 'Formateur'

  const defaults =
    event_type === 'failed_payment'
      ? {
          amount: 197,
          currency: 'eur',
          customer_email: 'test@example.com',
          payment_link: 'https://example.com/pay',
          hosted_invoice_url: 'https://example.com/pay',
          student_name: 'Marie',
          product_name: 'Formation exemple',
          simulated: true,
          sender_name,
        }
      : {
          amount: 497,
          currency: 'eur',
          customer_email: 'test@example.com',
          customer_name: 'Marie Dupont',
          student_name: 'Marie',
          product_name: 'Formation exemple',
          simulated: true,
          sender_name,
        }

  const context_json = { ...defaults, ...custom_data }
  const task_type = event_type === 'failed_payment' ? 'failed_payment' : 'onboarding_j0'
  const { prompt } = getTemplate(task_type as any, context_json)

  const { data, error } = await supabase
    .from('pending_tasks')
    .insert({
      client_id,
      task_type,
      context_json,
      prompt_template: prompt,
      status: 'pending',
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})
```

- [ ] **Step 2 : Commit**

```bash
git add backend/src/routes/simulate.ts
git commit -m "feat: simulate event_type (failed_payment|checkout_completed) + custom_data"
```

---

## Task 6 — tasks.ts : auto mode preview + pagination + action_type dynamique

**Files:**
- Modify: `backend/src/routes/tasks.ts`

- [ ] **Step 1 : Remplacer tasks.ts**

```typescript
import { Router } from 'express'
import { supabase } from '../services/supabase'
import { requireAuth } from '../middleware/auth'
import { parseClaudeResponse, wrapEmailHtml } from '../services/templates'
import { callClaude } from '../services/claude'
import { sendEmail } from '../services/resend'
import { decrypt } from '../services/encryption'

export const tasksRouter = Router()
tasksRouter.use(requireAuth)

tasksRouter.get('/', async (req, res) => {
  const { status = 'pending', client_id, page = '1', limit = '20' } = req.query as Record<string, string>
  const pageNum = Math.max(1, parseInt(page))
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)))
  const from = (pageNum - 1) * limitNum
  const to = from + limitNum - 1

  let query = supabase
    .from('pending_tasks')
    .select('*, clients(name, email)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (status !== 'all') query = query.eq('status', status)
  if (client_id) query = query.eq('client_id', client_id)

  const { data, error, count } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json({ data, total: count ?? 0, page: pageNum, limit: limitNum })
})

tasksRouter.post('/:id/preview', async (req, res) => {
  const { data: task, error: taskError } = await supabase
    .from('pending_tasks')
    .select('*, clients(name, email)')
    .eq('id', req.params.id)
    .single()
  if (taskError || !task) return res.status(404).json({ error: 'Tâche introuvable' })

  const { data: autoSetting } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'auto_mode')
    .single()
  const { data: keySetting } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'anthropic_api_key')
    .single()

  const isAuto = autoSetting?.value === 'true' && !!keySetting?.value

  try {
    let rawResponse: string

    if (isAuto) {
      if (!task.prompt_template) return res.status(400).json({ error: 'prompt_template manquant sur la tâche' })
      rawResponse = await callClaude(task.prompt_template, 'claude-sonnet-4-6')
      await supabase
        .from('pending_tasks')
        .update({ ai_response: rawResponse })
        .eq('id', task.id)
    } else {
      const { ai_response } = req.body
      if (!ai_response) return res.status(400).json({ error: 'ai_response requis en mode manuel' })
      rawResponse = ai_response
    }

    const { subject, body_html } = parseClaudeResponse(rawResponse)
    res.json({ subject, body_html })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

tasksRouter.post('/:id/send', async (req, res) => {
  const { subject, body_html, ai_response } = req.body
  if (!subject || !body_html) return res.status(400).json({ error: 'subject et body_html requis' })

  const { data: task, error: taskError } = await supabase
    .from('pending_tasks')
    .select('*, clients(name, email)')
    .eq('id', req.params.id)
    .single()
  if (taskError || !task) return res.status(404).json({ error: 'Tâche introuvable' })

  const { data: configs } = await supabase
    .from('client_configs')
    .select('config_type, encrypted_value')
    .eq('client_id', task.client_id)

  const configMap: Record<string, string> = {}
  for (const c of configs ?? []) configMap[c.config_type] = decrypt(c.encrypted_value)
  const sender_name = (task.context_json as any).sender_name || configMap['sender_name'] || 'Formateur'

  const customer_email = (task.context_json as any).customer_email as string
  if (!customer_email) return res.status(400).json({ error: 'customer_email manquant dans context' })

  const html = wrapEmailHtml(body_html, sender_name)
  const action_type = `${task.task_type}_email`

  try {
    await sendEmail({
      to: customer_email,
      subject,
      html,
      sender_name,
      reply_to: (task as any).clients?.email,
    })
    await supabase
      .from('pending_tasks')
      .update({ status: 'sent', ai_response: ai_response ?? task.ai_response, processed_at: new Date().toISOString() })
      .eq('id', task.id)
    await supabase.from('activity_logs').insert({
      client_id: task.client_id,
      action_type,
      payload_json: { subject, to: customer_email, task_type: task.task_type },
      status: 'sent',
    })
    res.json({ ok: true })
  } catch (err: any) {
    await supabase.from('activity_logs').insert({
      client_id: task.client_id,
      action_type,
      payload_json: { error: err.message, to: customer_email },
      status: 'failed',
    })
    res.status(500).json({ error: err.message })
  }
})
```

- [ ] **Step 2 : Commit**

```bash
git add backend/src/routes/tasks.ts
git commit -m "feat: tasks preview mode auto/manuel + pagination + action_type dynamique"
```

---

## Task 7 — clients.ts : PUT /:id + GET /:id

**Files:**
- Modify: `backend/src/routes/clients.ts`

- [ ] **Step 1 : Ajouter GET /:id et PUT /:id après le DELETE existant**

```typescript
clientsRouter.get('/:id', async (req, res) => {
  const userId = (req as any).userId
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single()
  if (error || !data) return res.status(404).json({ error: 'Client introuvable' })
  res.json(data)
})

clientsRouter.put('/:id', async (req, res) => {
  const userId = (req as any).userId
  const { name, email, stripe_webhook_secret, sender_name } = req.body

  const { data: existing } = await supabase
    .from('clients')
    .select('id')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single()
  if (!existing) return res.status(404).json({ error: 'Client introuvable' })

  if (name || email) {
    const updates: Record<string, string> = {}
    if (name) updates.name = name
    if (email) updates.email = email
    const { error } = await supabase
      .from('clients')
      .update(updates)
      .eq('id', req.params.id)
    if (error) return res.status(500).json({ error: error.message })
  }

  if (stripe_webhook_secret) {
    await supabase
      .from('client_configs')
      .upsert(
        { client_id: req.params.id, config_type: 'stripe_webhook_secret', encrypted_value: encrypt(stripe_webhook_secret) },
        { onConflict: 'client_id,config_type' }
      )
  }

  if (sender_name) {
    await supabase
      .from('client_configs')
      .upsert(
        { client_id: req.params.id, config_type: 'sender_name', encrypted_value: encrypt(sender_name) },
        { onConflict: 'client_id,config_type' }
      )
  }

  res.json({ ok: true })
})
```

- [ ] **Step 2 : Commit**

```bash
git add backend/src/routes/clients.ts
git commit -m "feat: clients GET /:id + PUT /:id"
```

---

## Task 8 — settings.ts : /test-anthropic

**Files:**
- Modify: `backend/src/routes/settings.ts`

- [ ] **Step 1 : Ajouter la route après le PUT existant**

```typescript
settingsRouter.get('/test-anthropic', async (_req, res) => {
  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'anthropic_api_key')
    .single()

  if (!data?.value) return res.status(400).json({ ok: false, error: 'Aucune clé configurée' })

  try {
    const { decrypt } = await import('../services/encryption')
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey: decrypt(data.value) })
    await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'hi' }],
    })
    res.json({ ok: true })
  } catch (err: any) {
    res.status(400).json({ ok: false, error: 'Clé invalide ou expirée' })
  }
})
```

- [ ] **Step 2 : Commit**

```bash
git add backend/src/routes/settings.ts
git commit -m "feat: GET /api/settings/test-anthropic"
```

---

## Task 9 — history.ts : pagination + filtres

**Files:**
- Modify: `backend/src/routes/history.ts`

- [ ] **Step 1 : Remplacer history.ts**

```typescript
import { Router } from 'express'
import { supabase } from '../services/supabase'
import { requireAuth } from '../middleware/auth'

export const historyRouter = Router()
historyRouter.use(requireAuth)

historyRouter.get('/', async (req, res) => {
  const {
    status,
    client_id,
    page = '1',
    limit = '20',
    date_from,
    date_to,
  } = req.query as Record<string, string>

  const pageNum = Math.max(1, parseInt(page))
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)))
  const from = (pageNum - 1) * limitNum
  const to = from + limitNum - 1

  let query = supabase
    .from('activity_logs')
    .select('*, clients(name)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (status && status !== 'all') query = query.eq('status', status)
  if (client_id) query = query.eq('client_id', client_id)
  if (date_from) query = query.gte('created_at', date_from)
  if (date_to) query = query.lte('created_at', date_to)

  const { data, error, count } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json({ data, total: count ?? 0, page: pageNum, limit: limitNum })
})
```

- [ ] **Step 2 : Commit**

```bash
git add backend/src/routes/history.ts
git commit -m "feat: history pagination + filtres status/client_id/dates"
```

---

## Task 10 — dashboard.ts : activité récente

**Files:**
- Modify: `backend/src/routes/dashboard.ts`

- [ ] **Step 1 : Ajouter les 5 derniers logs dans la réponse**

Remplacer la fin du handler (après le `Promise.all`) :

```typescript
  const recentRes = await supabase
    .from('activity_logs')
    .select('*, clients(name)')
    .in('client_id', clientIds.length ? clientIds : [''])
    .order('created_at', { ascending: false })
    .limit(5)

  res.json({
    clients: clientsRes.count ?? 0,
    pending_tasks: pendingRes.count ?? 0,
    emails_sent: sentRes.count ?? 0,
    recent_activity: recentRes.data ?? [],
  })
```

- [ ] **Step 2 : Commit**

```bash
git add backend/src/routes/dashboard.ts
git commit -m "feat: dashboard inclut recent_activity (5 derniers logs)"
```

---

## Task 11 — cron.ts : scheduled jobs runner

**Files:**
- Create: `backend/src/cron.ts`

La table `scheduled_jobs` a les colonnes : `id, client_id, job_type, context_json, scheduled_for, status`.

- [ ] **Step 1 : Créer backend/src/cron.ts**

```typescript
import 'dotenv/config'
import { supabase } from './services/supabase'
import { getTemplate, parseClaudeResponse, wrapEmailHtml } from './services/templates'
import { callClaude } from './services/claude'
import { sendEmail } from './services/resend'
import { decrypt } from './services/encryption'

export async function runScheduledJobs(): Promise<void> {
  const now = new Date().toISOString()

  const { data: jobs, error } = await supabase
    .from('scheduled_jobs')
    .select('*')
    .lte('scheduled_for', now)
    .eq('status', 'pending')

  if (error) {
    console.error('[cron] Erreur lecture scheduled_jobs:', error.message)
    return
  }

  if (!jobs || jobs.length === 0) return

  console.log(`[cron] ${jobs.length} job(s) à traiter`)

  for (const job of jobs) {
    try {
      await processJob(job)
      await supabase
        .from('scheduled_jobs')
        .update({ status: 'processed' })
        .eq('id', job.id)
    } catch (err: any) {
      console.error(`[cron] Erreur job ${job.id}:`, err.message)
      await supabase
        .from('scheduled_jobs')
        .update({ status: 'failed' })
        .eq('id', job.id)
    }
  }
}

async function processJob(job: Record<string, any>): Promise<void> {
  const { client_id, job_type, context_json } = job

  // Créer la pending_task
  const { prompt } = getTemplate(job_type, context_json)
  const { data: task } = await supabase
    .from('pending_tasks')
    .insert({
      client_id,
      task_type: job_type,
      context_json,
      prompt_template: prompt,
      status: 'pending',
    })
    .select()
    .single()

  // En mode auto, envoyer directement
  const { data: autoSetting } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'auto_mode')
    .single()
  const { data: keySetting } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'anthropic_api_key')
    .single()

  if (autoSetting?.value !== 'true' || !keySetting?.value || !task) return

  const { data: client } = await supabase
    .from('clients')
    .select('email')
    .eq('id', client_id)
    .single()

  const customer_email = context_json.customer_email
  if (!customer_email) throw new Error('customer_email manquant')

  const aiResponse = await callClaude(prompt, 'claude-sonnet-4-6')
  const { subject, body_html } = parseClaudeResponse(aiResponse)
  const sender_name = context_json.sender_name || 'Formateur'
  const html = wrapEmailHtml(body_html, sender_name)

  await sendEmail({ to: customer_email, subject, html, sender_name, reply_to: client?.email })

  await supabase
    .from('pending_tasks')
    .update({ status: 'sent', ai_response: aiResponse, processed_at: new Date().toISOString() })
    .eq('id', task.id)

  await supabase.from('activity_logs').insert({
    client_id,
    action_type: `${job_type}_email`,
    payload_json: { subject, to: customer_email },
    status: 'sent',
  })
}

// Entrypoint standalone pour Render cron job
if (require.main === module) {
  runScheduledJobs()
    .then(() => { console.log('[cron] Terminé'); process.exit(0) })
    .catch((err) => { console.error('[cron] Erreur fatale:', err); process.exit(1) })
}
```

- [ ] **Step 2 : Ajouter script dans backend/package.json**

```json
"cron": "tsx src/cron.ts"
```

- [ ] **Step 3 : Commit**

```bash
git add backend/src/cron.ts backend/package.json
git commit -m "feat: cron.ts scheduled jobs runner (j3/j7 onboarding)"
```

---

## Task 12 — index.ts : error handler global

**Files:**
- Modify: `backend/src/index.ts`

- [ ] **Step 1 : Ajouter error handler après toutes les routes**

```typescript
// Après tous les app.use() de routes, avant app.listen()
app.use((err: any, req: any, res: any, next: any) => {
  const status = err.status || err.statusCode || 500
  const code = err.code || 'INTERNAL_ERROR'
  console.error(`[${new Date().toISOString()}] ${code}: ${err.message}`, err.stack)
  res.status(status).json({ error: err.message || 'Erreur interne', code })
})
```

- [ ] **Step 2 : Commit**

```bash
git add backend/src/index.ts
git commit -m "feat: error handler global Express"
```

---

## Task 13 — render.yaml + .env.example

**Files:**
- Create: `backend/render.yaml`
- Modify: `backend/.env.example`

- [ ] **Step 1 : Créer backend/render.yaml**

```yaml
services:
  - type: web
    name: automatepro-backend
    runtime: node
    buildCommand: npm install && npm run build
    startCommand: npm start
    plan: free
    envVars:
      - key: NODE_ENV
        value: production
      - key: SUPABASE_URL
        sync: false
      - key: SUPABASE_SERVICE_KEY
        sync: false
      - key: ENCRYPTION_KEY
        sync: false
      - key: RESEND_API_KEY
        sync: false
      - key: RESEND_FROM_DOMAIN
        sync: false
      - key: STRIPE_SECRET_KEY
        sync: false
      - key: FRONTEND_URL
        sync: false

  - type: cron
    name: automatepro-cron
    runtime: node
    buildCommand: npm install && npm run build
    startCommand: npm run cron
    schedule: "0 * * * *"
    plan: free
    envVars:
      - key: SUPABASE_URL
        sync: false
      - key: SUPABASE_SERVICE_KEY
        sync: false
      - key: ENCRYPTION_KEY
        sync: false
      - key: RESEND_API_KEY
        sync: false
      - key: RESEND_FROM_DOMAIN
        sync: false
```

- [ ] **Step 2 : Créer/mettre à jour backend/.env.example**

```env
# Supabase
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...

# Chiffrement (32 bytes en hex = 64 chars) → générer avec: openssl rand -hex 32
ENCRYPTION_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Resend
RESEND_API_KEY=re_xxxx
RESEND_FROM_DOMAIN=onboarding@resend.dev

# Stripe (clé secrète)
STRIPE_SECRET_KEY=sk_live_xxxx

# Frontend (pour CORS)
FRONTEND_URL=https://votre-app.vercel.app

# Optionnel dev
PORT=3001
```

- [ ] **Step 3 : Commit**

```bash
git add backend/render.yaml backend/.env.example
git commit -m "feat: render.yaml (web + cron hourly) + .env.example"
```

---

## Task 14 — simulate-modal.tsx : sélecteur event_type

**Files:**
- Modify: `frontend/components/simulate-modal.tsx`

- [ ] **Step 1 : Ajouter state eventType + select dans le formulaire**

Ajouter après `const [productName, setProductName] = useState('')` :
```tsx
const [eventType, setEventType] = useState<'failed_payment' | 'checkout_completed'>('failed_payment')
```

Ajouter dans le body `api.post('/api/simulate', {...})` le champ `event_type: eventType`.

Ajouter le select après le select client, avant le champ montant :
```tsx
<select
  value={eventType}
  onChange={e => setEventType(e.target.value as any)}
  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
>
  <option value="failed_payment">Paiement échoué</option>
  <option value="checkout_completed">Checkout complété (onboarding)</option>
</select>
```

- [ ] **Step 2 : Commit**

```bash
git add frontend/components/simulate-modal.tsx
git commit -m "feat: simulate-modal sélecteur event_type"
```

---

## Task 15 — tasks/page.tsx : auto-refresh 30s + auto_mode

**Files:**
- Modify: `frontend/app/(app)/tasks/page.tsx`

- [ ] **Step 1 : Ajouter auto-refresh + fetch auto_mode**

```tsx
'use client'
import { useEffect, useState, useRef } from 'react'
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

const TASK_TYPE_LABELS: Record<string, string> = {
  failed_payment: 'Paiement échoué',
  onboarding_j0: 'Onboarding J+0',
  onboarding_j3: 'Suivi J+3',
  onboarding_j7: 'Engagement J+7',
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [autoMode, setAutoMode] = useState(false)
  const [showSimulate, setShowSimulate] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function load() {
    const [tasksData, settings] = await Promise.all([
      api.get<{ data: Task[] }>('/api/tasks').catch(() => ({ data: [] })),
      api.get<{ auto_mode: boolean }>('/api/settings').catch(() => ({ auto_mode: false })),
    ])
    setTasks(tasksData.data)
    setAutoMode(settings.auto_mode)
  }

  useEffect(() => {
    load()
    intervalRef.current = setInterval(load, 30_000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

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
        <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
          {tasks.map(task => (
            <div
              key={task.id}
              className="flex items-center justify-between px-4 py-3 cursor-pointer list-row"
              onClick={() => setSelectedTask(task)}
            >
              <div>
                <p className="text-sm font-medium">{task.clients?.name ?? '—'}</p>
                <p className="text-xs text-muted-foreground">
                  {task.context_json.amount}€ · {new Date(task.created_at).toLocaleString('fr-FR')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{TASK_TYPE_LABELS[task.task_type] ?? task.task_type}</Badge>
                {task.context_json.simulated && <Badge variant="outline">simulé</Badge>}
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
        autoMode={autoMode}
        onClose={() => setSelectedTask(null)}
        onSent={load}
      />
    </div>
  )
}
```

- [ ] **Step 2 : Commit**

```bash
git add frontend/app/(app)/tasks/page.tsx
git commit -m "feat: tasks auto-refresh 30s + badge task_type + auto_mode prop"
```

---

## Task 16 — task-drawer.tsx : mode auto (pas de textarea)

**Files:**
- Modify: `frontend/components/task-drawer.tsx`

- [ ] **Step 1 : Ajouter prop autoMode + adapter l'UI**

```tsx
interface Props {
  task: Task | null
  autoMode: boolean
  onClose: () => void
  onSent: () => void
}

export function TaskDrawer({ task, autoMode, onClose, onSent }: Props) {
```

Dans la section `state === 'input'`, adapter :

```tsx
{state === 'input' && (
  <>
    {!autoMode && (
      <>
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-medium uppercase text-muted-foreground">Prompt</p>
            <Button variant="ghost" size="sm" onClick={copyPrompt}>Copier</Button>
          </div>
          <pre className="text-xs bg-muted rounded-md p-3 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
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
      </>
    )}
    {autoMode && (
      <p className="text-sm text-muted-foreground">
        Mode automatique actif — Claude va générer l'email à partir du prompt.
      </p>
    )}
    {error && <p className="text-sm text-destructive">{error}</p>}
    <div className="flex justify-end">
      <Button
        onClick={handlePreview}
        disabled={!autoMode && !aiResponse.trim()}
      >
        {autoMode ? 'Générer l\'aperçu →' : 'Aperçu →'}
      </Button>
    </div>
  </>
)}
```

Dans `handlePreview`, ne plus passer `ai_response` si autoMode :
```tsx
async function handlePreview() {
  setError('')
  try {
    const body = autoMode ? {} : { ai_response: aiResponse }
    const data = await api.post<{ subject: string; body_html: string }>(
      `/api/tasks/${task!.id}/preview`,
      body
    )
    setPreview(data)
    setState('preview')
  } catch (err: any) {
    setError(err.message)
  }
}
```

- [ ] **Step 2 : Commit**

```bash
git add frontend/components/task-drawer.tsx
git commit -m "feat: task-drawer mode auto (génération directe) vs manuel (paste)"
```

---

## Task 17 — history/page.tsx : filtres + pagination + modal détails

**Files:**
- Modify: `frontend/app/(app)/history/page.tsx`

- [ ] **Step 1 : Remplacer history/page.tsx entier** (environ 90 lignes)

```tsx
'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface LogRow {
  id: string
  action_type: string
  status: string
  created_at: string
  payload_json: Record<string, any>
  clients: { name: string } | null
}

interface PageData { data: LogRow[]; total: number; page: number; limit: number }

export default function HistoryPage() {
  const [logs, setLogs] = useState<LogRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('all')
  const [selected, setSelected] = useState<LogRow | null>(null)
  const limit = 20

  async function load(p = page, s = statusFilter) {
    const params = new URLSearchParams({ page: String(p), limit: String(limit), status: s })
    const res = await api.get<PageData>(`/api/history?${params}`).catch(() => null)
    if (res) { setLogs(res.data); setTotal(res.total) }
  }

  useEffect(() => { load() }, [page, statusFilter])

  function handleStatusChange(s: string) {
    setStatusFilter(s)
    setPage(1)
    load(1, s)
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Historique</h1>

      <div className="flex gap-2 flex-wrap">
        {['all', 'sent', 'failed'].map(s => (
          <Button
            key={s}
            variant={statusFilter === s ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleStatusChange(s)}
          >
            {s === 'all' ? 'Tous' : s === 'sent' ? 'Envoyés' : 'Échoués'}
          </Button>
        ))}
      </div>

      {logs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun résultat.</p>
      ) : (
        <>
          <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
            {logs.map(log => (
              <div key={log.id} className="flex items-center justify-between px-4 py-3 list-row">
                <div>
                  <p className="text-sm font-medium">{log.clients?.name ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">
                    {log.action_type} · {new Date(log.created_at).toLocaleString('fr-FR')}
                  </p>
                  {log.payload_json?.to && (
                    <p className="text-xs text-muted-foreground">{log.payload_json.to}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={log.status === 'sent' ? 'default' : 'destructive'}>
                    {log.status}
                  </Badge>
                  <Button variant="ghost" size="sm" onClick={() => setSelected(log)}>
                    Détails
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{total} entrée(s)</span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                ← Précédent
              </Button>
              <span className="px-2 py-1">{page} / {totalPages}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Suivant →
              </Button>
            </div>
          </div>
        </>
      )}

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Détails</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <p><span className="text-muted-foreground">Action :</span> {selected.action_type}</p>
              <p><span className="text-muted-foreground">Statut :</span> {selected.status}</p>
              <p><span className="text-muted-foreground">Date :</span> {new Date(selected.created_at).toLocaleString('fr-FR')}</p>
              <p><span className="text-muted-foreground">Client :</span> {selected.clients?.name ?? '—'}</p>
              <div>
                <p className="text-muted-foreground mb-1">Payload :</p>
                <pre className="text-xs bg-muted rounded p-3 overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(selected.payload_json, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

- [ ] **Step 2 : Commit**

```bash
git add frontend/app/(app)/history/page.tsx
git commit -m "feat: history filtres statut + pagination + modal détails"
```

---

## Task 18 — settings/page.tsx : bouton "Tester" + info domaine

**Files:**
- Modify: `frontend/app/(app)/settings/page.tsx`

- [ ] **Step 1 : Ajouter état testResult + bouton Tester**

Ajouter après `const [saving, setSaving] = useState(false)` :
```tsx
const [testing, setTesting] = useState(false)
const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
```

Ajouter la fonction :
```tsx
async function testApiKey() {
  setTesting(true)
  setTestResult(null)
  try {
    await api.get('/api/settings/test-anthropic')
    setTestResult({ ok: true, msg: 'Clé valide ✓' })
  } catch (err: any) {
    setTestResult({ ok: false, msg: err.message })
  } finally {
    setTesting(false)
  }
}
```

Dans le JSX de la section clé API, ajouter après le bouton Sauvegarder :
```tsx
{settings.has_api_key && (
  <Button variant="outline" onClick={testApiKey} disabled={testing}>
    {testing ? 'Test...' : 'Tester'}
  </Button>
)}
```

Et afficher le résultat :
```tsx
{testResult && (
  <p className={`text-sm ${testResult.ok ? 'text-green-500' : 'text-destructive'}`}>
    {testResult.msg}
  </p>
)}
```

Ajouter en bas la section domaine email (avant la section Thème) :
```tsx
<section className="py-4 border-t border-border">
  <p className="text-sm font-medium">Domaine email</p>
  <p className="text-xs text-muted-foreground mt-0.5">
    En MVP, les emails partent depuis <code className="bg-muted px-1 rounded">onboarding@resend.dev</code>.
    Pour utiliser votre propre domaine, configurez-le dans Resend et mettez à jour <code className="bg-muted px-1 rounded">RESEND_FROM_DOMAIN</code>.
  </p>
</section>
```

- [ ] **Step 2 : Commit**

```bash
git add frontend/app/(app)/settings/page.tsx
git commit -m "feat: settings bouton Tester clé API + info domaine email"
```

---

## Task 19 — clients/page.tsx : modal édition + URL webhook Stripe

**Files:**
- Modify: `frontend/app/(app)/clients/page.tsx`

- [ ] **Step 1 : Remplacer clients/page.tsx** (environ 100 lignes)

```tsx
'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { ClientForm } from '@/components/client-form'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

interface ClientRow {
  id: string
  name: string
  email: string
  created_at: string
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientRow[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editClient, setEditClient] = useState<ClientRow | null>(null)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editSenderName, setEditSenderName] = useState('')
  const [editSecret, setEditSecret] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [webhookClient, setWebhookClient] = useState<ClientRow | null>(null)

  async function load() {
    const data = await api.get<ClientRow[]>('/api/clients')
    setClients(data)
  }

  useEffect(() => { load() }, [])

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ce client ?')) return
    await api.delete(`/api/clients/${id}`)
    await load()
  }

  function openEdit(client: ClientRow) {
    setEditClient(client)
    setEditName(client.name)
    setEditEmail(client.email)
    setEditSenderName('')
    setEditSecret('')
  }

  async function handleEditSave() {
    if (!editClient) return
    setEditSaving(true)
    try {
      await api.put(`/api/clients/${editClient.id}`, {
        name: editName,
        email: editEmail,
        ...(editSenderName ? { sender_name: editSenderName } : {}),
        ...(editSecret ? { stripe_webhook_secret: editSecret } : {}),
      })
      setEditClient(null)
      await load()
    } finally {
      setEditSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Clients</h1>
        <Button onClick={() => setShowForm(true)} className="btn-glow">+ Nouveau client</Button>
      </div>

      {clients.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun client pour l'instant.</p>
      ) : (
        <div className="border border-border rounded-lg divide-y divide-border">
          {clients.map(client => (
            <div key={client.id} className="flex items-center justify-between px-4 py-3 list-row">
              <div>
                <p className="text-sm font-medium">{client.name}</p>
                <p className="text-xs text-muted-foreground">{client.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">actif</Badge>
                <Button variant="ghost" size="sm" onClick={() => setWebhookClient(client)}>
                  Webhook
                </Button>
                <Button variant="ghost" size="sm" onClick={() => openEdit(client)}>
                  Modifier
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(client.id)}>
                  Supprimer
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ClientForm open={showForm} onClose={() => setShowForm(false)} onCreated={load} />

      {/* Modal édition */}
      <Dialog open={!!editClient} onOpenChange={() => setEditClient(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Modifier le client</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <Input placeholder="Nom" value={editName} onChange={e => setEditName(e.target.value)} />
            <Input placeholder="Email de contact" value={editEmail} onChange={e => setEditEmail(e.target.value)} />
            <Input placeholder="Nom expéditeur (optionnel)" value={editSenderName} onChange={e => setEditSenderName(e.target.value)} />
            <Input type="password" placeholder="Nouveau webhook secret Stripe (optionnel)" value={editSecret} onChange={e => setEditSecret(e.target.value)} />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditClient(null)}>Annuler</Button>
              <Button onClick={handleEditSave} disabled={editSaving}>
                {editSaving ? 'Sauvegarde...' : 'Sauvegarder'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal URL webhook Stripe */}
      <Dialog open={!!webhookClient} onOpenChange={() => setWebhookClient(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>URL Webhook Stripe</DialogTitle></DialogHeader>
          {webhookClient && (
            <div className="space-y-3 mt-2 text-sm">
              <p className="text-muted-foreground">Coller cette URL dans les webhooks Stripe de {webhookClient.name} :</p>
              <code className="block bg-muted rounded p-3 break-all text-xs">
                {API_URL}/api/webhooks/stripe/{webhookClient.id}
              </code>
              <p className="text-xs text-muted-foreground">
                Events à activer : <strong>invoice.payment_failed</strong>, <strong>checkout.session.completed</strong>, <strong>payment_intent.payment_failed</strong>
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigator.clipboard.writeText(`${API_URL}/api/webhooks/stripe/${webhookClient.id}`)}
              >
                Copier l'URL
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

- [ ] **Step 2 : Ajouter NEXT_PUBLIC_API_URL dans frontend/.env.example**

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_API_URL=https://automatepro-backend.onrender.com
```

- [ ] **Step 3 : Commit**

```bash
git add frontend/app/(app)/clients/page.tsx frontend/.env.example
git commit -m "feat: clients modal édition + modal URL webhook Stripe"
```

---

## Task 20 — dashboard/page.tsx : activité récente + lien pending

**Files:**
- Modify: `frontend/app/(app)/dashboard/page.tsx`

- [ ] **Step 1 : Remplacer dashboard/page.tsx**

```tsx
'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface ActivityLog {
  id: string
  action_type: string
  status: string
  created_at: string
  payload_json: Record<string, any>
  clients: { name: string } | null
}

interface DashboardStats {
  clients: number
  pending_tasks: number
  emails_sent: number
  recent_activity: ActivityLog[]
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)

  useEffect(() => {
    api.get<DashboardStats>('/api/dashboard').then(setStats).catch(console.error)
  }, [])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Clients actifs" value={stats?.clients} />
        <StatCard title="Emails envoyés" value={stats?.emails_sent} />
        <div className="relative">
          <StatCard title="Tâches en attente" value={stats?.pending_tasks} />
          {stats && stats.pending_tasks > 0 && (
            <Link href="/tasks" className="absolute bottom-3 right-3">
              <Button size="sm" variant="outline">Traiter →</Button>
            </Link>
          )}
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Activité récente</h2>
        {!stats || stats.recent_activity.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune activité pour l'instant.</p>
        ) : (
          <div className="border border-border rounded-lg divide-y divide-border">
            {stats.recent_activity.map(log => (
              <div key={log.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{log.clients?.name ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">
                    {log.action_type} · {new Date(log.created_at).toLocaleString('fr-FR')}
                  </p>
                </div>
                <Badge variant={log.status === 'sent' ? 'default' : 'destructive'}>
                  {log.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function StatCard({ title, value }: { title: string; value: number | undefined }) {
  return (
    <div className="rounded-lg p-5 card-elevated">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="text-3xl font-semibold mt-2">
        {value === undefined ? <span className="text-muted-foreground text-xl">—</span> : value}
      </p>
    </div>
  )
}
```

- [ ] **Step 2 : Commit**

```bash
git add frontend/app/(app)/dashboard/page.tsx
git commit -m "feat: dashboard activité récente + bouton Traiter si pending"
```

---

## Task 21 — CLAUDE.md + README

**Files:**
- Modify: `CLAUDE.md`
- Create: `README.md`

- [ ] **Step 1 : Mettre à jour la section ÉTAT ACTUEL dans CLAUDE.md**

Remplacer la section "ÉTAT ACTUEL DU PROJET" et "DERNIÈRE FEATURE TERMINÉE" par :

```markdown
## ÉTAT ACTUEL DU PROJET

Phase 1 — Foundation : TERMINÉE
Phase 2 — Logique Métier : TERMINÉE (2026-05-13)

## FEATURES LIVRÉES EN PHASE 2

Backend :
- Webhooks : invoice.payment_failed + payment_intent.payment_failed + checkout.session.completed
- Templates : getTemplate() + 4 templates (failed_payment, onboarding j0/j3/j7) + format [SUBJECT]
- Preview endpoint : mode auto (appel Claude sonnet-4-6) + mode manuel (paste)
- Simulate : event_type (failed_payment | checkout_completed) + custom_data
- Tasks : pagination + action_type dynamique + sender_name dans from Resend
- Clients : PUT /:id (édition) + GET /:id
- Settings : GET /test-anthropic
- History : pagination + filtres (status, client_id, dates)
- Dashboard : recent_activity (5 derniers logs)
- Cron : runScheduledJobs() — crée pending_tasks j3/j7 depuis scheduled_jobs
- Error handler global Express
- render.yaml : web service + cron job hourly

Frontend :
- Tasks : auto-refresh 30s + badge task_type
- TaskDrawer : mode auto (bouton Générer) vs manuel (textarea)
- SimulateModal : sélecteur event_type
- History : filtres statut + pagination + modal détails
- Settings : bouton Tester clé API + info domaine email
- Clients : modal édition + modal URL webhook Stripe
- Dashboard : activité récente + bouton "Traiter →" si pending > 0

## DÉCISIONS TECHNIQUES PHASE 2

- Gestion des deux events payment_intent.payment_failed ET invoice.payment_failed avec normalisation
- Format réponse Claude : [SUBJECT]...[/SUBJECT] (legacy "Objet:" toujours supporté)
- callClaude() accepte un model en param, génération email → claude-sonnet-4-6
- RESEND_FROM_DOMAIN (renommé depuis RESEND_FROM) pour construire "sender_name <domain>"
- scheduled_jobs créés côté webhook, consommés par cron standalone (Render Cron Job hourly)
- Preview en mode auto : Claude appelé côté backend, ai_response stocké sur la task

## PROCHAINE FEATURE À CODER

Phase 3 — Multi-tenant ready :
- Supabase RLS policies (actuellement service key bypass tout)
- Auth multi-admin (invitations)
- Éditeur de templates par client (UI + stockage DB)
- Mode auto par défaut (sans toggle manuel)
- Domaine email personnalisé par client via Resend
- Analytics : taux d'ouverture, revenus récupérés
```

- [ ] **Step 2 : Créer README.md à la racine**

```markdown
# AEVUM AutomatePro

Automatisation des emails post-achat et relances impayés pour formateurs en ligne.

## Stack

- **Backend** : Node.js + Express + TypeScript → Render
- **Frontend** : Next.js 14 + Tailwind + shadcn → Vercel
- **BDD** : Supabase (PostgreSQL)
- **Emails** : Resend
- **Paiements** : Stripe webhooks
- **IA** : Anthropic Claude API (optionnel)

## Installation locale

```bash
# Backend
cd backend
cp .env.example .env  # remplir les variables
npm install
npm run dev           # port 3001

# Frontend (autre terminal)
cd frontend
cp .env.example .env.local  # remplir les variables
npm install
npm run dev           # port 3000
```

## Variables d'environnement

### Backend (`backend/.env`)

| Variable | Description |
|---|---|
| `SUPABASE_URL` | URL du projet Supabase |
| `SUPABASE_SERVICE_KEY` | Clé service Supabase (bypass RLS) |
| `ENCRYPTION_KEY` | 64 chars hex (32 bytes) — `openssl rand -hex 32` |
| `RESEND_API_KEY` | Clé API Resend |
| `RESEND_FROM_DOMAIN` | Ex: `onboarding@resend.dev` |
| `STRIPE_SECRET_KEY` | Clé secrète Stripe `sk_live_...` |
| `FRONTEND_URL` | URL du frontend (CORS) |

### Frontend (`frontend/.env.local`)

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé anon Supabase |
| `NEXT_PUBLIC_API_URL` | URL du backend déployé |

## Déploiement

### Render (backend)

1. Créer un compte [Render](https://render.com)
2. "New > Web Service" → connecter le repo → root dir : `backend`
3. Les variables d'env sont dans `render.yaml` (à remplir dans l'UI)
4. Le cron job hourly est déclaré dans `render.yaml` → créé automatiquement

### Vercel (frontend)

1. `cd frontend && npx vercel`
2. Renseigner les variables d'env dans le dashboard Vercel

### Configurer Stripe

Dans le dashboard Stripe → Webhooks → Add endpoint :
- URL : `https://votre-backend.onrender.com/api/webhooks/stripe/{client_id}`
- Events : `invoice.payment_failed`, `checkout.session.completed`, `payment_intent.payment_failed`

Le `client_id` est visible dans l'app → Clients → bouton "Webhook".
```

- [ ] **Step 3 : Commit final**

```bash
git add CLAUDE.md README.md
git commit -m "docs: CLAUDE.md Phase 2 terminée + README déploiement"
git push origin main
```

---

## Vérification end-to-end

Après toutes les tâches, tester le flux complet :

1. Créer un client dans l'app (nom + email + sender_name + webhook_secret factice)
2. Simuler un `failed_payment` → vérifier que la pending_task apparaît dans /tasks
3. Cliquer sur la tâche → mode manuel : coller une réponse Claude format `[SUBJECT]Test[/SUBJECT]\n<p>Corps</p>` → Aperçu → Envoyer
4. Vérifier activity_logs dans /history
5. Simuler un `checkout_completed` → vérifier onboarding_j0 pending + scheduled_jobs j3/j7 en DB
6. Activer le mode auto dans Settings (si clé Anthropic) → simuler → vérifier envoi direct
7. Vérifier le dashboard : stats + activité récente + bouton "Traiter →"
