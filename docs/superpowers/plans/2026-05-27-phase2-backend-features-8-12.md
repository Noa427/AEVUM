# Phase 2 Backend — Features 8-12 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement email open/click tracking, multi-formation support, checkout abandon recovery, and testimonial request automations.

**Architecture:** Tracking uses a new `email_tracking` table with UUID tokens injected as pixel + link wrapper into outbound HTML. Multi-formation adds a `formations` table with `formation_id` FK on configs/automations/tasks; existing data migrated to "Par défaut". Checkout abandon and testimonials use the existing scheduled_jobs cron pattern.

**Tech Stack:** Node.js/Express/TypeScript, Supabase (PostgREST JS SDK), Resend — no new dependencies.

---

## File Map

| File | Action | Reason |
|---|---|---|
| `supabase/migrations/014_email_tracking.sql` | Create | Feature 8 — email_tracking table |
| `supabase/migrations/015_formations.sql` | Create | Feature 9 — formations + formation_id FK + data migration |
| `backend/src/utils/tracking.ts` | Create | Feature 8 — insertTrackingRow + injectTracking |
| `backend/src/routes/tracking.ts` | Create | Feature 8 — public GET /track/open + /track/click |
| `backend/src/index.ts` | Modify | Mount trackingRouter + BACKEND_URL env check + testimonials cron |
| `backend/src/utils/getEmailTemplate.ts` | Modify | Features 11/12 — extend EmailTemplateType + DEFAULTS |
| `backend/src/schemas/client.ts` | Modify | Features 11/12 — extend ALLOWED_CONFIG_TYPES + Formation schemas |
| `backend/src/routes/webhooks.ts` | Modify | Feature 8 (tracking) + Feature 11 (checkout.session.expired) |
| `backend/src/cron.ts` | Modify | Feature 8 (tracking) + Feature 11 (checkout_abandon) + Feature 12 (testimonials) |
| `backend/src/routes/tasks.ts` | Modify | Feature 8 — inject tracking on admin task send |
| `backend/src/routes/clientAuth.ts` | Modify | Feature 8 (/stats + /students/:id), Feature 9 (formations CRUD + X-Formation-Id) |

---

## Task 1: Schema + Template Updates

**Files:**
- Modify: `backend/src/schemas/client.ts`
- Modify: `backend/src/utils/getEmailTemplate.ts`

- [ ] **Step 1: Extend ALLOWED_CONFIG_TYPES in schemas/client.ts**

Replace the existing `ALLOWED_CONFIG_TYPES` array:

```typescript
export const ALLOWED_CONFIG_TYPES = [
  'sender_name',
  'template_onboarding_j0',
  'template_onboarding_j3',
  'template_onboarding_j7',
  'template_failed_payment',
  'template_failed_payment_j1',
  'template_failed_payment_j3',
  'template_failed_payment_j7',
  'upsell_enabled',
  'upsell_product_name',
  'upsell_url',
  'upsell_price',
  'support_email_enabled',
  'support_auto_reply',
  'politique_remboursement',
  'template_checkout_abandon',
  'template_testimonial_j30',
  'template_testimonial_j60',
  'testimonial_url',
] as const
```

Append at end of file (before the last export):

```typescript
export const FormationSchema = z.object({
  name: z.string().min(1).max(200),
  stripe_product_id: z.string().max(200).optional().nullable(),
})

export const FormationUpdateSchema = FormationSchema.partial()
```

- [ ] **Step 2: Replace getEmailTemplate.ts entirely**

```typescript
import { supabase } from '../services/supabase'
import { decrypt } from '../services/encryption'

export type EmailTemplateType =
  | 'template_onboarding_j0'
  | 'template_onboarding_j3'
  | 'template_onboarding_j7'
  | 'template_failed_payment'
  | 'template_failed_payment_j1'
  | 'template_failed_payment_j3'
  | 'template_failed_payment_j7'
  | 'template_checkout_abandon'
  | 'template_testimonial_j30'
  | 'template_testimonial_j60'

export interface EmailTemplate {
  subject: string
  body: string
}

const DEFAULTS: Record<EmailTemplateType, EmailTemplate> = {
  template_onboarding_j0: {
    subject: 'Bienvenue {{nom}}, voici vos accès',
    body: 'Bonjour {{nom}},\n\nVotre achat est confirmé. Voici vos identifiants de connexion :\n\nEmail : {{email}}\nMot de passe : {{mot_de_passe}}\n\nAccédez à votre formation ici : {{lien_acces}}\n\nÀ très vite,',
  },
  template_onboarding_j3: {
    subject: '{{nom}}, comment se passe votre début ?',
    body: "Bonjour {{nom}},\n\nCela fait 3 jours que vous avez rejoint {{nom_formation}}. Avez-vous pu commencer ?\n\nN'hésitez pas à répondre à cet email si vous avez la moindre question.\n\nÀ bientôt,",
  },
  template_onboarding_j7: {
    subject: '{{nom}} — votre première semaine',
    body: "Bonjour {{nom}},\n\nUne semaine déjà ! Vous avez maintenant accès à l'intégralité de {{nom_formation}}.\n\nN'hésitez pas à répondre si vous avez besoin d'aide.\n\nÀ bientôt,",
  },
  template_failed_payment: {
    subject: 'Action requise — problème de paiement',
    body: "Bonjour {{nom}},\n\nNous avons rencontré un problème avec votre paiement. Merci de mettre à jour vos informations de paiement pour conserver votre accès.\n\nÀ bientôt,",
  },
  template_failed_payment_j1: {
    subject: 'Action requise — problème de paiement',
    body: "Bonjour {{nom}},\n\nNous avons rencontré un problème avec votre paiement pour {{nom_formation}}. Merci de mettre à jour vos informations de paiement pour conserver votre accès.\n\nÀ bientôt,",
  },
  template_failed_payment_j3: {
    subject: '{{nom}}, votre accès est toujours en attente',
    body: "Bonjour {{nom}},\n\nIl y a 3 jours, nous vous avons informé d'un problème avec votre paiement pour {{nom_formation}}. Votre accès est suspendu jusqu'à régularisation.\n\nMerci de mettre à jour vos informations de paiement dès que possible.\n\nÀ bientôt,",
  },
  template_failed_payment_j7: {
    subject: '{{nom}} — dernier rappel avant suspension définitive',
    body: "Bonjour {{nom}},\n\nCeci est notre dernier rappel concernant le problème de paiement pour {{nom_formation}}. Sans régularisation de votre part, votre accès sera définitivement suspendu.\n\nMerci d'agir rapidement.\n\nCordialement,",
  },
  template_checkout_abandon: {
    subject: '{{nom}}, vous avez oublié quelque chose…',
    body: "Bonjour {{nom}},\n\nVous avez commencé à vous inscrire à {{nom_formation}} mais n'avez pas finalisé votre commande.\n\nVotre place est encore disponible : {{lien_checkout}}\n\nÀ bientôt,",
  },
  template_testimonial_j30: {
    subject: '{{nom}}, votre avis nous tient à cœur',
    body: "Bonjour {{nom}},\n\nVoilà un mois que vous avez rejoint {{nom_formation}} — félicitations !\n\nSi vous avez quelques minutes, votre témoignage nous aiderait énormément :\n{{lien_temoignage}}\n\nMerci d'avance,",
  },
  template_testimonial_j60: {
    subject: '{{nom}}, partagez votre parcours',
    body: "Bonjour {{nom}},\n\nDeux mois après avoir commencé {{nom_formation}}, nous aimerions connaître votre progression.\n\nPartagez votre témoignage ici : {{lien_temoignage}}\n\nMerci beaucoup,",
  },
}

function inject(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`)
}

export async function getEmailTemplate(
  clientId: string,
  configType: EmailTemplateType,
  variables: Record<string, string> = {}
): Promise<EmailTemplate> {
  const { data } = await supabase
    .from('client_configs')
    .select('encrypted_value')
    .eq('client_id', clientId)
    .eq('config_type', configType)
    .single()

  if (data?.encrypted_value) {
    try {
      const raw = decrypt(data.encrypted_value)
      const parsed = JSON.parse(raw) as EmailTemplate
      if (parsed.subject && parsed.body) {
        return { subject: inject(parsed.subject, variables), body: inject(parsed.body, variables) }
      }
    } catch { /* fallback to default */ }
  }

  const def = DEFAULTS[configType]
  return { subject: inject(def.subject, variables), body: inject(def.body, variables) }
}

export function templateToAiResponse(tpl: EmailTemplate): string {
  return `[SUBJECT]${tpl.subject}[/SUBJECT]\n\n${tpl.body}`
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/schemas/client.ts backend/src/utils/getEmailTemplate.ts
git commit -m "feat(schemas): add checkout_abandon, testimonial config types + Formation schemas"
```

---

## Task 2: Migration 014 — email_tracking

**Files:**
- Create: `supabase/migrations/014_email_tracking.sql`

- [ ] **Step 1: Create the file**

```sql
CREATE TABLE email_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  student_email TEXT NOT NULL,
  config_type TEXT NOT NULL,
  automation_id UUID REFERENCES custom_automations(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  click_url TEXT
);

CREATE INDEX idx_email_tracking_client ON email_tracking(client_id);
CREATE INDEX idx_email_tracking_student ON email_tracking(client_id, student_email);
```

- [ ] **Step 2: Apply in Supabase SQL Editor. Verify:**

```sql
SELECT table_name FROM information_schema.tables WHERE table_name = 'email_tracking';
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/014_email_tracking.sql
git commit -m "feat(db): add email_tracking table"
```

---

## Task 3: Tracking Utility

**Files:**
- Create: `backend/src/utils/tracking.ts`

- [ ] **Step 1: Create the file**

```typescript
import { randomUUID } from 'crypto'
import { supabase } from '../services/supabase'

// Standard 1×1 transparent GIF
export const GIF_1x1 = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
)

export async function insertTrackingRow(opts: {
  clientId: string
  studentEmail: string
  configType: string
  automationId?: string
}): Promise<string> {
  const id = randomUUID()
  const { error } = await supabase.from('email_tracking').insert({
    id,
    client_id: opts.clientId,
    student_email: opts.studentEmail.toLowerCase(),
    config_type: opts.configType,
    automation_id: opts.automationId ?? null,
    sent_at: new Date().toISOString(),
  })
  if (error) console.warn('[tracking] insert failed:', error.message)
  return id
}

export function injectTracking(html: string, token: string, backendUrl: string): string {
  const pixel = `<img src="${backendUrl}/track/open/${token}" width="1" height="1" style="display:none" alt="">`
  const withPixel = html.includes('</body>')
    ? html.replace('</body>', `${pixel}</body>`)
    : html + pixel

  // Wrap external links — skip already-wrapped tracking links
  return withPixel.replace(/href="(https?:\/\/[^"]+)"/g, (match, url) => {
    if (url.includes('/track/click/')) return match
    return `href="${backendUrl}/track/click/${token}?url=${encodeURIComponent(url)}"`
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/utils/tracking.ts
git commit -m "feat(tracking): insertTrackingRow + injectTracking utilities"
```

---

## Task 4: Public Tracking Routes

**Files:**
- Create: `backend/src/routes/tracking.ts`
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Create tracking.ts**

```typescript
import { Router } from 'express'
import { supabase } from '../services/supabase'
import { GIF_1x1 } from '../utils/tracking'

export const trackingRouter = Router()

// Email open pixel
trackingRouter.get('/open/:token', async (req, res) => {
  const { token } = req.params
  // Fire-and-forget — only set on first open
  supabase
    .from('email_tracking')
    .update({ opened_at: new Date().toISOString() })
    .eq('id', token)
    .is('opened_at', null)
    .then(() => {})

  res.set('Content-Type', 'image/gif')
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.set('Pragma', 'no-cache')
  res.send(GIF_1x1)
})

// Click redirect
trackingRouter.get('/click/:token', async (req, res) => {
  const { token } = req.params
  const rawUrl = req.query.url as string | undefined
  if (!rawUrl) return res.status(400).send('URL manquante')

  let decoded: string
  try {
    decoded = decodeURIComponent(rawUrl)
    new URL(decoded)
  } catch {
    return res.status(400).send('URL invalide')
  }

  supabase
    .from('email_tracking')
    .update({ clicked_at: new Date().toISOString(), click_url: decoded })
    .eq('id', token)
    .is('clicked_at', null)
    .then(() => {})

  res.redirect(302, decoded)
})
```

- [ ] **Step 2: Modify index.ts**

Add `'BACKEND_URL'` to `REQUIRED_ENV`:
```typescript
const REQUIRED_ENV = [
  'JWT_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY', 'ENCRYPTION_KEY', 'FRONTEND_URL', 'VITRINE_URL', 'BACKEND_URL',
]
```

Add import after existing router imports:
```typescript
import { trackingRouter } from './routes/tracking'
```

Add mount before `app.use(errorHandler)`:
```typescript
app.use('/track', trackingRouter)
```

- [ ] **Step 3: Add BACKEND_URL to backend/.env**

```
BACKEND_URL=http://localhost:3001
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/tracking.ts backend/src/index.ts
git commit -m "feat(tracking): public /track/open + /track/click endpoints"
```

---

## Task 5: Inject Tracking Into webhooks.ts

**Files:**
- Modify: `backend/src/routes/webhooks.ts`

- [ ] **Step 1: Add import at top of webhooks.ts**

```typescript
import { insertTrackingRow, injectTracking } from '../utils/tracking'
```

- [ ] **Step 2: Instrument handleCheckoutCompleted auto-send**

Find (in the `try` block of the auto-mode path, around line 263):
```typescript
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
```

Replace with:
```typescript
    const html = wrapEmailHtml(body_html, sender_name)
    const trackingToken = await insertTrackingRow({
      clientId,
      studentEmail: context_json.customer_email,
      configType: 'template_onboarding_j0',
    })
    await sendEmail({ to: context_json.customer_email, subject, html: injectTracking(html, trackingToken, process.env.BACKEND_URL!), sender_name, reply_to: client?.email })
    await supabase
      .from('pending_tasks')
      .update({ status: 'sent', ai_response: aiResponse, processed_at: new Date().toISOString() })
      .eq('id', task.id)
    await supabase.from('activity_logs').insert({
      client_id: clientId,
      action_type: 'onboarding_j0_email',
      payload_json: { subject, to: context_json.customer_email, tracking_id: trackingToken },
      status: 'sent',
    })
```

- [ ] **Step 3: Instrument handleFailedPayment auto-send**

Find (around line 157):
```typescript
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
```

Replace with:
```typescript
    const html = wrapEmailHtml(body_html, sender_name)
    const trackingToken = await insertTrackingRow({
      clientId,
      studentEmail: context_json.customer_email,
      configType: 'template_failed_payment_j1',
    })
    await sendEmail({ to: context_json.customer_email, subject, html: injectTracking(html, trackingToken, process.env.BACKEND_URL!), sender_name, reply_to: client?.email })
    await supabase
      .from('pending_tasks')
      .update({ status: 'sent', ai_response: aiResponse, processed_at: new Date().toISOString() })
      .eq('id', task.id)
    await supabase.from('activity_logs').insert({
      client_id: clientId,
      action_type: 'failed_payment_email',
      payload_json: { subject, to: context_json.customer_email, amount: context_json.amount, tracking_id: trackingToken },
      status: 'sent',
    })
```

- [ ] **Step 4: Add checkout.session.expired handler in the event dispatch block**

Find (around line 55):
```typescript
  } else if (event.type === 'invoice.payment_succeeded') {
    await handlePaymentRecovered({ event, clientId })
  }
```

Replace with:
```typescript
  } else if (event.type === 'invoice.payment_succeeded') {
    await handlePaymentRecovered({ event, clientId })
  } else if (event.type === 'checkout.session.expired') {
    await handleCheckoutSessionExpired({ event, clientId })
  }
```

- [ ] **Step 5: Add handleCheckoutSessionExpired function at end of webhooks.ts (before any closing braces)**

```typescript
async function handleCheckoutSessionExpired(opts: { event: any; clientId: string }) {
  const { event, clientId } = opts
  const session = event.data.object as any
  const customerEmail = session.customer_details?.email as string | undefined
  if (!customerEmail) return

  // Schedule 30 min from now — actual delivery depends on cron interval (max 60 min)
  const scheduledFor = new Date(Date.now() + 30 * 60 * 1000).toISOString()

  await supabase.from('scheduled_jobs').insert({
    client_id: clientId,
    job_type: 'checkout_abandon',
    context_json: {
      customer_email: customerEmail,
      customer_name: session.customer_details?.name ?? '',
      product_name: session.metadata?.product_name ?? '',
      checkout_url: session.url ?? '',
    },
    scheduled_for: scheduledFor,
    status: 'pending',
  })
  console.log(`[webhook] checkout_abandon planifié pour ${customerEmail}`)
}
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/webhooks.ts
git commit -m "feat(tracking+checkout): tracking in webhook sends + checkout.session.expired handler"
```

---

## Task 6: Inject Tracking Into cron.ts + tasks.ts

**Files:**
- Modify: `backend/src/cron.ts`
- Modify: `backend/src/routes/tasks.ts`

- [ ] **Step 1: Add imports to cron.ts**

After existing imports:
```typescript
import { insertTrackingRow, injectTracking } from './utils/tracking'
import { getEmailTemplate } from './utils/getEmailTemplate'
```

Note: `wrapEmailHtml` is already imported from `'./services/templates'`.

- [ ] **Step 2: Instrument handleUpsellJob auto-send (around line 169)**

Find:
```typescript
    const html = wrapEmailHtml(body_html, ctx.sender_name ?? 'Formateur')
    await sendEmail({
      to: ctx.customer_email,
      subject,
      html,
      sender_name: ctx.sender_name ?? 'Formateur',
      reply_to: (client as any)?.email,
    })
    await supabase.from('activity_logs').insert({
      client_id: job.client_id,
      action_type: 'upsell_email',
      payload_json: { subject, to: ctx.customer_email, product: ctx.upsell_product_name },
      status: 'sent',
    })
```

Replace with:
```typescript
    const html = wrapEmailHtml(body_html, ctx.sender_name ?? 'Formateur')
    const trackingToken = await insertTrackingRow({
      clientId: job.client_id,
      studentEmail: ctx.customer_email,
      configType: 'upsell',
    })
    await sendEmail({
      to: ctx.customer_email,
      subject,
      html: injectTracking(html, trackingToken, process.env.BACKEND_URL!),
      sender_name: ctx.sender_name ?? 'Formateur',
      reply_to: (client as any)?.email,
    })
    await supabase.from('activity_logs').insert({
      client_id: job.client_id,
      action_type: 'upsell_email',
      payload_json: { subject, to: ctx.customer_email, product: ctx.upsell_product_name, tracking_id: trackingToken },
      status: 'sent',
    })
```

- [ ] **Step 3: Instrument runCustomAutomations send (around line 275)**

Find:
```typescript
      const html = wrapEmailHtml(automation.body.replace(/\n/g, '<br>'), senderName)
      await sendEmail({ to: client.email, subject: automation.subject, html, sender_name: senderName })

      await supabase.from('activity_logs').insert({
        client_id: automation.client_id,
        action_type: 'custom_automation',
        payload_json: { automation_id: automation.id, name: automation.name, to: client.email, subject: automation.subject },
        status: 'sent',
      })
```

Replace with:
```typescript
      const html = wrapEmailHtml(automation.body.replace(/\n/g, '<br>'), senderName)
      const trackingToken = await insertTrackingRow({
        clientId: automation.client_id,
        studentEmail: client.email,
        configType: 'custom_automation',
        automationId: automation.id,
      })
      await sendEmail({ to: client.email, subject: automation.subject, html: injectTracking(html, trackingToken, process.env.BACKEND_URL!), sender_name: senderName })

      await supabase.from('activity_logs').insert({
        client_id: automation.client_id,
        action_type: 'custom_automation',
        payload_json: { automation_id: automation.id, name: automation.name, to: client.email, subject: automation.subject, tracking_id: trackingToken },
        status: 'sent',
      })
```

- [ ] **Step 4: Add checkout_abandon dispatch in runScheduledJobs**

Find (around line 77):
```typescript
    if (job.job_type === 'upsell') {
      await handleUpsellJob(job)
    } else {
      await handleStandardJob(job)
    }
```

Replace with:
```typescript
    if (job.job_type === 'upsell') {
      await handleUpsellJob(job)
    } else if (job.job_type === 'checkout_abandon') {
      await handleCheckoutAbandonJob(job)
    } else {
      await handleStandardJob(job)
    }
```

- [ ] **Step 5: Add handleCheckoutAbandonJob function in cron.ts (after handleUpsellJob)**

```typescript
async function handleCheckoutAbandonJob(job: any): Promise<void> {
  const ctx = job.context_json as Record<string, any>
  const customerEmail = ctx?.customer_email as string | undefined
  const markDone = () => supabase.from('scheduled_jobs').update({ status: 'done' }).eq('id', job.id)

  if (!customerEmail) { await markDone(); return }

  // Blacklist check
  const { count: isBlacklisted } = await supabase
    .from('client_blacklist')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', job.client_id)
    .eq('email', customerEmail.toLowerCase())
  if (isBlacklisted && isBlacklisted > 0) { await markDone(); return }

  // Template must exist in client_configs (no default fallback — spec: "absent → ne pas envoyer")
  const { data: configRow } = await supabase
    .from('client_configs')
    .select('encrypted_value')
    .eq('client_id', job.client_id)
    .eq('config_type', 'template_checkout_abandon')
    .single()
  if (!configRow?.encrypted_value) { await markDone(); return }

  let parsed: { subject?: string; body?: string; active?: boolean } | null = null
  try { parsed = JSON.parse(decrypt(configRow.encrypted_value)) } catch {}
  if (!parsed || parsed.active === false || !parsed.subject || !parsed.body) { await markDone(); return }

  const { data: senderRow } = await supabase
    .from('client_configs')
    .select('encrypted_value')
    .eq('client_id', job.client_id)
    .eq('config_type', 'sender_name')
    .single()
  const senderName = senderRow?.encrypted_value
    ? (() => { try { return decrypt(senderRow.encrypted_value) } catch { return 'Formateur' } })()
    : 'Formateur'

  const vars: Record<string, string> = {
    nom: ctx?.customer_name ?? '',
    prenom: (ctx?.customer_name ?? '').split(' ')[0],
    email: customerEmail,
    nom_formation: ctx?.product_name ?? '',
    lien_checkout: ctx?.checkout_url ?? '',
  }
  const injectVars = (text: string) =>
    text.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`)

  const subject = injectVars(parsed.subject)
  const body = injectVars(parsed.body)
  const html = wrapEmailHtml(body.replace(/\n/g, '<br>'), senderName)
  const trackingToken = await insertTrackingRow({
    clientId: job.client_id,
    studentEmail: customerEmail,
    configType: 'template_checkout_abandon',
  })

  try {
    await sendEmail({ to: customerEmail, subject, html: injectTracking(html, trackingToken, process.env.BACKEND_URL!), sender_name: senderName })
    await markDone()
    await supabase.from('activity_logs').insert({
      client_id: job.client_id,
      action_type: 'checkout_abandon_sent',
      payload_json: { to: customerEmail, subject, tracking_id: trackingToken },
      status: 'sent',
    })
    console.log(`[cron] checkout_abandon → ${customerEmail}`)
  } catch (err: any) {
    await supabase.from('scheduled_jobs').update({ status: 'failed' }).eq('id', job.id)
    await supabase.from('activity_logs').insert({
      client_id: job.client_id,
      action_type: 'checkout_abandon_sent',
      payload_json: { error: err.message, to: customerEmail },
      status: 'failed',
    })
  }
}
```

- [ ] **Step 6: Add tracking import + instrumentation in tasks.ts**

Add import at top of `backend/src/routes/tasks.ts`:
```typescript
import { insertTrackingRow, injectTracking } from '../utils/tracking'
```

In `tasksRouter.post('/:id/send', ...)`, find:
```typescript
  const html = wrapEmailHtml(body_html, sender_name)
  const action_type = `${task.task_type}_email`

  try {
    await sendEmail({ to: customer_email, subject, html, sender_name, reply_to: (task as any).clients?.email })
    await supabase
      .from('pending_tasks')
      .update({ status: 'sent', ai_response, processed_at: new Date().toISOString() })
      .eq('id', task.id)
    await supabase.from('activity_logs').insert({
      client_id: task.client_id,
      action_type,
      payload_json: { subject, to: customer_email, amount: ctx.amount },
      status: 'sent',
    })
```

Replace with:
```typescript
  const html = wrapEmailHtml(body_html, sender_name)
  const action_type = `${task.task_type}_email`

  try {
    const trackingToken = await insertTrackingRow({
      clientId: task.client_id,
      studentEmail: customer_email,
      configType: `template_${task.task_type}`,
    })
    await sendEmail({ to: customer_email, subject, html: injectTracking(html, trackingToken, process.env.BACKEND_URL!), sender_name, reply_to: (task as any).clients?.email })
    await supabase
      .from('pending_tasks')
      .update({ status: 'sent', ai_response, processed_at: new Date().toISOString() })
      .eq('id', task.id)
    await supabase.from('activity_logs').insert({
      client_id: task.client_id,
      action_type,
      payload_json: { subject, to: customer_email, amount: ctx.amount, tracking_id: trackingToken },
      status: 'sent',
    })
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/cron.ts backend/src/routes/tasks.ts
git commit -m "feat(tracking+checkout): tracking in cron/task sends + checkout_abandon job handler"
```

---

## Task 7: Extend /client/stats + /client/students/:id

**Files:**
- Modify: `backend/src/routes/clientAuth.ts`

- [ ] **Step 1: Extend GET /client/stats with tracking fields**

In the existing GET /client/stats handler, after the `dunningCount` query and before `res.json(...)`, add:

```typescript
  // Tracking — 30 derniers jours
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const tBase = () =>
    supabase.from('email_tracking').select('id', { count: 'exact', head: true })
      .eq('client_id', clientId).gte('sent_at', thirtyDaysAgo)
  const [tSent, tOpened, tClicked] = await Promise.all([
    tBase(),
    tBase().not('opened_at', 'is', null),
    tBase().not('clicked_at', 'is', null),
  ])
  const sent30 = tSent.count ?? 0
  const opened = tOpened.count ?? 0
  const clicked = tClicked.count ?? 0
```

Replace the existing `res.json({...})` with:
```typescript
  res.json({
    total_emails: total.count ?? 0,
    ce_mois: monthly.count ?? 0,
    onboarding_envoyes: onboarding.count ?? 0,
    relances_envoyees: relances.count ?? 0,
    upsells_envoyes: upsells.count ?? 0,
    recouvrement_montant_recupere: Math.round(montantRecupere * 100) / 100,
    recouvrement_taux: Math.min(taux, 100),
    emails_opened: opened,
    emails_clicked: clicked,
    open_rate_this_month: sent30 > 0 ? Math.round((opened / sent30) * 100) : 0,
    click_rate_this_month: sent30 > 0 ? Math.round((clicked / sent30) * 100) : 0,
  })
```

- [ ] **Step 2: Extend GET /client/students/:id email history with tracking**

In the GET /client/students/:id handler, after the `const { data: logs }` query, add:

```typescript
  // Fetch tracking rows for emails that have a tracking_id in their payload
  const trackingIds = (logs ?? [])
    .map((l: any) => (l.payload_json as any)?.tracking_id as string | undefined)
    .filter(Boolean) as string[]

  const trackingMap = new Map<string, { opened_at: string | null; clicked_at: string | null }>()
  if (trackingIds.length > 0) {
    const { data: tRows } = await supabase
      .from('email_tracking')
      .select('id, opened_at, clicked_at')
      .in('id', trackingIds)
    for (const t of tRows ?? []) {
      trackingMap.set(t.id, { opened_at: t.opened_at ?? null, clicked_at: t.clicked_at ?? null })
    }
  }
```

Replace the existing `emailHistory` map:
```typescript
  const emailHistory = (logs ?? []).map((l: any) => {
    const tid = (l.payload_json as any)?.tracking_id as string | undefined
    const tr = tid ? trackingMap.get(tid) : undefined
    return {
      type: l.action_type as string,
      sent_at: l.created_at as string,
      subject: (l.payload_json as any)?.subject ?? '',
      opened_at: tr?.opened_at ?? null,
      clicked_at: tr?.clicked_at ?? null,
    }
  })
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/clientAuth.ts
git commit -m "feat(tracking): /client/stats + /students/:id tracking fields"
```

---

## Task 8: Migration 015 — Formations

**Files:**
- Create: `supabase/migrations/015_formations.sql`

- [ ] **Step 1: Create the file**

```sql
-- 1. Formations table
CREATE TABLE formations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  stripe_product_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_formations_client ON formations(client_id);

-- 2. Add formation_id FK columns (nullable — backward compatible)
ALTER TABLE client_configs ADD COLUMN IF NOT EXISTS formation_id UUID REFERENCES formations(id) ON DELETE SET NULL;
ALTER TABLE custom_automations ADD COLUMN IF NOT EXISTS formation_id UUID REFERENCES formations(id) ON DELETE SET NULL;
ALTER TABLE email_tracking ADD COLUMN IF NOT EXISTS formation_id UUID REFERENCES formations(id) ON DELETE SET NULL;
ALTER TABLE pending_tasks ADD COLUMN IF NOT EXISTS formation_id UUID REFERENCES formations(id) ON DELETE SET NULL;

-- 3. Create "Par défaut" formation for every existing client
INSERT INTO formations (id, client_id, name, created_at)
SELECT gen_random_uuid(), id, 'Par défaut', now()
FROM clients;

-- 4. Link all existing rows to their client's "Par défaut" formation
-- Safe: each client has exactly one formation at this point
UPDATE client_configs
SET formation_id = (SELECT id FROM formations WHERE client_id = client_configs.client_id ORDER BY created_at ASC LIMIT 1)
WHERE formation_id IS NULL;

UPDATE custom_automations
SET formation_id = (SELECT id FROM formations WHERE client_id = custom_automations.client_id ORDER BY created_at ASC LIMIT 1)
WHERE formation_id IS NULL;

UPDATE pending_tasks
SET formation_id = (SELECT id FROM formations WHERE client_id = pending_tasks.client_id ORDER BY created_at ASC LIMIT 1)
WHERE formation_id IS NULL;

UPDATE email_tracking
SET formation_id = (SELECT id FROM formations WHERE client_id = email_tracking.client_id ORDER BY created_at ASC LIMIT 1)
WHERE formation_id IS NULL;
```

- [ ] **Step 2: Apply in Supabase SQL Editor. Verify (zero data lost):**

```sql
SELECT COUNT(*) FROM formations;
-- Must equal number of clients

SELECT COUNT(*) FROM client_configs WHERE formation_id IS NULL;
SELECT COUNT(*) FROM custom_automations WHERE formation_id IS NULL;
SELECT COUNT(*) FROM pending_tasks WHERE formation_id IS NULL;
-- All must return 0
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/015_formations.sql
git commit -m "feat(db): formations table + formation_id FK + data migration"
```

---

## Task 9: Formations CRUD + getFormationContext Helper

**Files:**
- Modify: `backend/src/routes/clientAuth.ts`
- Modify: `backend/src/schemas/client.ts` (done in Task 1)

- [ ] **Step 1: Add getFormationContext helper in clientAuth.ts**

After the `UUID_RE` constant (around line 31), add:

```typescript
import type { Request } from 'express'

async function getFormationContext(
  clientId: string,
  req: Request
): Promise<{ formationId: string | null; unauthorized: boolean }> {
  const headerValue = req.headers['x-formation-id'] as string | undefined

  if (headerValue) {
    const { data } = await supabase
      .from('formations')
      .select('id')
      .eq('id', headerValue)
      .eq('client_id', clientId)
      .single()
    if (!data) return { formationId: null, unauthorized: true }
    return { formationId: data.id, unauthorized: false }
  }

  const { data } = await supabase
    .from('formations')
    .select('id')
    .eq('client_id', clientId)
    .order('created_at', { ascending: true })
    .limit(1)
    .single()
  return { formationId: data?.id ?? null, unauthorized: false }
}
```

If `import type { Request } from 'express'` causes a duplicate import error, skip it — Express types are already available via the Router usage.

- [ ] **Step 2: Add FormationSchema imports in clientAuth.ts**

Add `FormationSchema, FormationUpdateSchema` to the existing import from `'../schemas/client'`.

- [ ] **Step 3: Append formations CRUD endpoints before `export default clientAuthRouter`**

```typescript
// GET /client/formations
clientAuthRouter.get('/formations', authenticateClient, async (req, res) => {
  const clientId = (req as any).clientId as string
  const { data, error } = await supabase
    .from('formations')
    .select('id, name, stripe_product_id, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: true })
  if (error) return res.status(500).json({ error: error.message })
  res.json(data ?? [])
})

// POST /client/formations
clientAuthRouter.post('/formations', authenticateClient, validate(FormationSchema), async (req, res) => {
  const clientId = (req as any).clientId as string
  const { name, stripe_product_id } = req.body
  const { data, error } = await supabase
    .from('formations')
    .insert({ client_id: clientId, name, stripe_product_id: stripe_product_id ?? null })
    .select('id, name, stripe_product_id, created_at')
    .single()
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// PUT /client/formations/:id
clientAuthRouter.put('/formations/:id', authenticateClient, validate(FormationUpdateSchema), async (req, res) => {
  const clientId = (req as any).clientId as string
  const updates: Record<string, any> = {}
  if (req.body.name !== undefined) updates.name = req.body.name
  if (req.body.stripe_product_id !== undefined) updates.stripe_product_id = req.body.stripe_product_id
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Aucune modification fournie' })

  const { data, error } = await supabase
    .from('formations')
    .update(updates)
    .eq('id', req.params.id)
    .eq('client_id', clientId)
    .select('id, name, stripe_product_id, created_at')
    .single()
  if (error || !data) return res.status(404).json({ error: 'Formation introuvable' })
  res.json(data)
})

// DELETE /client/formations/:id
clientAuthRouter.delete('/formations/:id', authenticateClient, async (req, res) => {
  const clientId = (req as any).clientId as string
  const { id } = req.params

  const { count: activeAuto } = await supabase
    .from('custom_automations')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('formation_id', id)
    .eq('active', true)
  if (activeAuto && activeAuto > 0)
    return res.status(409).json({ error: `Impossible de supprimer : ${activeAuto} automation(s) active(s) liée(s)` })

  const { count: cfgCount } = await supabase
    .from('client_configs')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('formation_id', id)
  if (cfgCount && cfgCount > 0)
    return res.status(409).json({ error: `Impossible de supprimer : ${cfgCount} configuration(s) liée(s)` })

  const { error, count } = await supabase
    .from('formations')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('client_id', clientId)
  if (error) return res.status(500).json({ error: error.message })
  if (count === 0) return res.status(404).json({ error: 'Formation introuvable' })
  res.json({ ok: true })
})
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/clientAuth.ts backend/src/schemas/client.ts
git commit -m "feat(multi-formation): formations CRUD + getFormationContext helper"
```

---

## Task 10: X-Formation-Id Support on Existing Endpoints

**Files:**
- Modify: `backend/src/routes/clientAuth.ts`

For each endpoint below: add `getFormationContext` call after extracting `clientId`, return 403 if unauthorized, and filter queries by `formationId` when non-null.

- [ ] **Step 1: GET /client/configs**

After `const clientId = (req as any).clientId`:
```typescript
  const { formationId, unauthorized } = await getFormationContext(clientId, req)
  if (unauthorized) return res.status(403).json({ error: 'Formation introuvable ou accès refusé' })
```

Replace the `supabase.from('client_configs').select(...)` call:
```typescript
  let cfgQuery = supabase
    .from('client_configs')
    .select('config_type, encrypted_value')
    .eq('client_id', clientId)
  if (formationId) cfgQuery = cfgQuery.eq('formation_id', formationId)
  const { data, error } = await cfgQuery
```

- [ ] **Step 2: PUT /client/configs**

After extracting clientId:
```typescript
  const { formationId, unauthorized } = await getFormationContext(clientId, req)
  if (unauthorized) return res.status(403).json({ error: 'Formation introuvable ou accès refusé' })
```

In the upsert call, add `formation_id: formationId` to the upserted object:
```typescript
  const { error } = await supabase
    .from('client_configs')
    .upsert(
      { client_id: clientId, config_type, encrypted_value: encrypt(value), formation_id: formationId },
      { onConflict: 'client_id,config_type' }
    )
```

- [ ] **Step 3: GET /client/automations/custom**

After extracting clientId:
```typescript
  const { formationId, unauthorized } = await getFormationContext(clientId, req)
  if (unauthorized) return res.status(403).json({ error: 'Formation introuvable ou accès refusé' })
```

Replace the query:
```typescript
  let autoQuery = supabase.from('custom_automations').select('*').eq('client_id', clientId)
  if (formationId) autoQuery = autoQuery.eq('formation_id', formationId)
  const { data, error } = await autoQuery.order('created_at', { ascending: false })
```

- [ ] **Step 4: POST /client/automations/custom**

After extracting clientId:
```typescript
  const { formationId, unauthorized } = await getFormationContext(clientId, req)
  if (unauthorized) return res.status(403).json({ error: 'Formation introuvable ou accès refusé' })
```

Add `formation_id: formationId` to the insert payload.

- [ ] **Step 5: GET /client/students — filter pending_tasks by formationId**

After extracting clientId in the students handler:
```typescript
  const { formationId, unauthorized } = await getFormationContext(clientId, req)
  if (unauthorized) return res.status(403).json({ error: 'Formation introuvable ou accès refusé' })
```

In the `Promise.all` tasks query, replace the first element:
```typescript
  let taskQuery = supabase
    .from('pending_tasks')
    .select('context_json, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: true })
    .limit(5000)
  if (formationId) taskQuery = taskQuery.eq('formation_id', formationId)
```

(Since the tasks query is now conditional, extract it before the Promise.all and replace the inline query.)

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/clientAuth.ts
git commit -m "feat(multi-formation): X-Formation-Id support on portal endpoints"
```

---

## Task 11: Testimonials Cron

**Files:**
- Modify: `backend/src/cron.ts`
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Add runTestimonialEmails to cron.ts (append before end of file)**

```typescript
export async function runTestimonialEmails(): Promise<void> {
  // Time gate: only execute at 08:xx UTC to avoid duplicate sends within a day
  if (new Date().getUTCHours() !== 8) return

  const { data: configs } = await supabase
    .from('client_configs')
    .select('client_id, config_type, encrypted_value')
    .in('config_type', ['testimonial_url', 'template_testimonial_j30', 'template_testimonial_j60'])

  const clientConfigMap = new Map<string, Record<string, string>>()
  for (const c of configs ?? []) {
    try {
      const val = decrypt(c.encrypted_value)
      if (!clientConfigMap.has(c.client_id)) clientConfigMap.set(c.client_id, {})
      clientConfigMap.get(c.client_id)![c.config_type] = val
    } catch {}
  }

  for (const [clientId, configMap] of clientConfigMap) {
    const testimonialUrl = configMap['testimonial_url']
    if (!testimonialUrl) continue

    const { data: clientRow } = await supabase.from('clients').select('paused_until').eq('id', clientId).single()
    if (clientRow?.paused_until && new Date() < new Date(clientRow.paused_until)) continue

    const { data: senderRow } = await supabase
      .from('client_configs').select('encrypted_value')
      .eq('client_id', clientId).eq('config_type', 'sender_name').single()
    const senderName = senderRow?.encrypted_value
      ? (() => { try { return decrypt(senderRow.encrypted_value) } catch { return 'Formateur' } })()
      : 'Formateur'

    for (const milestone of ['j30', 'j60'] as const) {
      const configType = `template_testimonial_${milestone}` as const
      const templateRaw = configMap[configType]
      if (templateRaw) {
        try { if (JSON.parse(templateRaw).active === false) continue } catch {}
      }

      const days = milestone === 'j30' ? 30 : 60
      const fromTs = new Date(Date.now() - (days + 1) * 24 * 60 * 60 * 1000).toISOString()
      const toTs = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

      const { data: windowTasks } = await supabase
        .from('pending_tasks')
        .select('context_json, created_at')
        .eq('client_id', clientId)
        .gte('created_at', fromTs)
        .lte('created_at', toTs)

      const emailsInWindow = [
        ...new Set(
          (windowTasks ?? [])
            .map((t: any) => (t.context_json as any)?.customer_email as string | undefined)
            .filter(Boolean) as string[]
        ),
      ]

      for (const studentEmail of emailsInWindow) {
        // Skip if they have tasks older than the window (= not their first enrollment)
        const { count: earlierCount } = await supabase
          .from('pending_tasks')
          .select('*', { count: 'exact', head: true })
          .eq('client_id', clientId)
          .contains('context_json', { customer_email: studentEmail })
          .lt('created_at', fromTs)
        if (earlierCount && earlierCount > 0) continue

        // Skip if already sent for this milestone
        const { count: alreadySent } = await supabase
          .from('activity_logs')
          .select('*', { count: 'exact', head: true })
          .eq('client_id', clientId)
          .eq('action_type', `testimonial_${milestone}_sent`)
          .contains('payload_json', { student_email: studentEmail })
        if (alreadySent && alreadySent > 0) continue

        // Get student context
        const { data: latestTaskRow } = await supabase
          .from('pending_tasks')
          .select('context_json')
          .eq('client_id', clientId)
          .contains('context_json', { customer_email: studentEmail })
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
        const ctx = (latestTaskRow?.context_json as Record<string, any>) ?? {}

        try {
          const tpl = await getEmailTemplate(clientId, configType, {
            nom: ctx?.customer_name ?? ctx?.student_name ?? '',
            prenom: ctx?.student_name ?? '',
            nom_formation: ctx?.product_name ?? '',
            lien_temoignage: testimonialUrl,
          })
          const html = wrapEmailHtml(tpl.body.replace(/\n/g, '<br>'), senderName)
          const trackingToken = await insertTrackingRow({ clientId, studentEmail, configType })
          await sendEmail({
            to: studentEmail,
            subject: tpl.subject,
            html: injectTracking(html, trackingToken, process.env.BACKEND_URL!),
            sender_name: senderName,
          })
          await supabase.from('activity_logs').insert({
            client_id: clientId,
            action_type: `testimonial_${milestone}_sent`,
            payload_json: { student_email: studentEmail, nom_formation: ctx?.product_name ?? '', tracking_id: trackingToken },
            status: 'sent',
          })
          console.log(`[cron:testimonial] ${milestone} → ${studentEmail}`)
        } catch (err: any) {
          console.error(`[cron:testimonial] ${milestone} échoué pour ${studentEmail}:`, err.message)
          await supabase.from('activity_logs').insert({
            client_id: clientId,
            action_type: `testimonial_${milestone}_sent`,
            payload_json: { student_email: studentEmail, error: err.message },
            status: 'failed',
          })
        }
      }
    }
  }
}
```

- [ ] **Step 2: Update index.ts — import + schedule testimonials**

Update the cron import:
```typescript
import { runScheduledJobs, runCustomAutomations, runTestimonialEmails } from './cron'
```

Update the ENABLE_CRON block:
```typescript
if (process.env.ENABLE_CRON === 'true') {
  runScheduledJobs()
  runCustomAutomations()
  runTestimonialEmails()
  setInterval(runScheduledJobs, 60 * 60 * 1000)
  setInterval(runCustomAutomations, 60 * 60 * 1000)
  setInterval(runTestimonialEmails, 60 * 60 * 1000)
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/cron.ts backend/src/index.ts
git commit -m "feat(testimonials): J30/J60 testimonial cron with idempotency + tracking"
```

---

## Self-Review

### Spec coverage

| Feature | Endpoints / Changes | Task(s) |
|---|---|---|
| 8 — email_tracking table | Migration 014 | 2 |
| 8 — pixel + link injection utility | utils/tracking.ts | 3 |
| 8 — /track/open + /track/click public endpoints | routes/tracking.ts | 4 |
| 8 — tracking in webhook auto-sends | webhooks.ts | 5 |
| 8 — tracking in cron sends + admin task send | cron.ts, tasks.ts | 6 |
| 8 — /client/stats 4 new fields | clientAuth.ts | 7 |
| 8 — /client/students/:id opened_at/clicked_at | clientAuth.ts | 7 |
| 9 — formations table + formation_id + data migration | Migration 015 | 8 |
| 9 — GET/POST/PUT/DELETE /client/formations | clientAuth.ts | 9 |
| 9 — X-Formation-Id on configs, automations, students | clientAuth.ts | 10 |
| 10 — Deliverability | No backend change | N/A |
| 11 — checkout.session.expired → scheduled_job | webhooks.ts | 5 |
| 11 — checkout_abandon cron handler + blacklist check | cron.ts | 6 |
| 12 — testimonial_j30/j60 cron + idempotency | cron.ts, index.ts | 11 |
| Schema updates | schemas/client.ts, getEmailTemplate.ts | 1 |

### Edge cases covered
- Pause check: checkout_abandon jobs pass through runScheduledJobs pause guard automatically ✓
- Checkout abandon: absent template → don't send (no default fallback) ✓
- Testimonials: already-sent check via activity_logs (`contains` on payload_json) ✓
- Tracking: double-wrap prevention via `/track/click/` URL detection ✓
- Multi-formation: new clients without formations → formationId=null → no filter (graceful fallback) ✓
- X-Formation-Id: invalid/foreign formation → 403 ✓
- Data migration: zero rows lost — verified with SQL assertions ✓
