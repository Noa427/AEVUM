# AEVUM APP — Redesign UI + Plans + Coûts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Renommer l'app AEVUM APP, refaire la page Clients avec gestion plan/options/paiement inline, et enrichir le dashboard avec MRR, coûts automatiques (tokens Anthropic + emails Resend + infra) et profit net par client.

**Architecture:** Deux migrations SQL ajoutent `plan`/`payment_status` sur `clients` et la table `ai_usage_logs`. Le backend enrichit les routes `GET /api/clients`, `PUT /api/clients/:id`, `GET/PUT /api/clients/:id/configs`, et réécrit `GET /api/dashboard`. `callAnthropicMessage()` log les tokens après chaque appel. Les deux pages frontend sont réécrites entièrement.

**Tech Stack:** Node.js/Express/TypeScript (backend), Next.js 14/TypeScript/Tailwind/shadcn (frontend), Supabase, @anthropic-ai/sdk

---

## Fichiers créés / modifiés

| Fichier | Action |
|---|---|
| `supabase/migrations/021_plan_payment_status.sql` | Créé |
| `supabase/migrations/022_ai_usage_logs.sql` | Créé |
| `backend/src/schemas/client.ts` | Modifié — +3 addon config_types |
| `backend/src/routes/clients.ts` | Modifié — GET list +addons, PUT +plan/payment_status, configs +addons |
| `backend/src/routes/dashboard.ts` | Modifié — réécriture complète |
| `backend/src/routes/settings.ts` | Modifié — +infra_monthly_cost |
| `backend/src/services/claude.ts` | Modifié — logging tokens |
| `frontend/components/sidebar.tsx` | Modifié — renommage |
| `frontend/app/(app)/settings/page.tsx` | Modifié — renommage + champ infra |
| `frontend/app/(app)/dashboard/page.tsx` | Modifié — réécriture complète |
| `frontend/app/(app)/clients/page.tsx` | Modifié — réécriture complète |

---

## Task 1 : Migrations SQL

**Files:**
- Create: `supabase/migrations/021_plan_payment_status.sql`
- Create: `supabase/migrations/022_ai_usage_logs.sql`

- [ ] **Créer 021_plan_payment_status.sql**

```sql
-- supabase/migrations/021_plan_payment_status.sql
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'standard'
    CHECK (plan IN ('standard', 'premium')),
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'active'
    CHECK (payment_status IN ('active', 'unpaid'));
```

- [ ] **Créer 022_ai_usage_logs.sql**

```sql
-- supabase/migrations/022_ai_usage_logs.sql
CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  model TEXT NOT NULL,
  input_tokens INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  cost_usd NUMERIC(10,6) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_client_created
  ON ai_usage_logs(client_id, created_at);
```

- [ ] **Appliquer les deux migrations dans Supabase SQL Editor dans l'ordre 021 → 022**

- [ ] **Commit**

```bash
git add supabase/migrations/021_plan_payment_status.sql supabase/migrations/022_ai_usage_logs.sql
git commit -m "feat(db): migrations 021 plan/payment_status + 022 ai_usage_logs"
```

---

## Task 2 : Backend schemas — addon config_types

**Files:**
- Modify: `backend/src/schemas/client.ts`

- [ ] **Ajouter les 3 addon types dans ALLOWED_CONFIG_TYPES**

Dans `backend/src/schemas/client.ts`, remplacer :
```typescript
  'rapport_video_active',
] as const
```
par :
```typescript
  'rapport_video_active',
  'addon_f11',
  'addon_f13',
  'addon_f18',
] as const
```

- [ ] **Vérifier que le build passe**

```bash
cd backend && npm run build 2>&1 | grep -E "error TS"
```
Attendu : aucune ligne (0 erreur TS).

- [ ] **Commit**

```bash
git add backend/src/schemas/client.ts
git commit -m "feat(backend): ajout addon_f11/f13/f18 dans ALLOWED_CONFIG_TYPES"
```

---

## Task 3 : Backend claude.ts — logging tokens

**Files:**
- Modify: `backend/src/services/claude.ts`

- [ ] **Réécrire backend/src/services/claude.ts**

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from './supabase'
import { decrypt } from './encryption'

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 529])

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: any
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err: any) {
      lastErr = err
      const isTransient = RETRYABLE_STATUSES.has(err?.status) || err?.code === 'ECONNRESET' || err?.code === 'ETIMEDOUT'
      if (!isTransient || i === attempts - 1) throw err
      const delay = 1000 * Math.pow(2, i)
      console.warn(`[claude] tentative ${i + 1}/${attempts} échouée (${err?.status ?? err?.code}), retry dans ${delay}ms`)
      await new Promise(r => setTimeout(r, delay))
    }
  }
  throw lastErr
}

async function getApiKey(): Promise<string> {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY
  const { data } = await supabase.from('settings').select('value').eq('key', 'anthropic_api_key').single()
  if (!data?.value) throw new Error('Clé API Anthropic non configurée')
  return decrypt(data.value)
}

async function callAnthropicMessage(userMessage: string, model: string, system?: string, clientId?: string): Promise<string> {
  const apiKey = await getApiKey()
  const anthropic = new Anthropic({ apiKey, timeout: 30_000 })

  const message = await withRetry(() =>
    anthropic.messages.create({
      model,
      max_tokens: 1024,
      ...(system ? { system } : {}),
      messages: [{ role: 'user', content: userMessage }],
    })
  )

  const block = message.content[0]
  if (!block || block.type !== 'text') throw new Error('Réponse Claude inattendue')

  // Log tokens — fire-and-forget, ne bloque pas l'appelant
  const { input_tokens, output_tokens } = message.usage
  supabase.from('ai_usage_logs').insert({
    client_id: clientId ?? null,
    model: message.model,
    input_tokens,
    output_tokens,
    cost_usd: (input_tokens * 3 + output_tokens * 15) / 1_000_000,
  }).then().catch((err: any) => console.warn('[claude] ai_usage_logs insert failed:', err.message))

  return block.text
}

export async function callClaude(prompt: string, model = 'claude-haiku-4-5-20251001', clientId?: string): Promise<string> {
  return callAnthropicMessage(prompt, model, undefined, clientId)
}

export async function callClaudeChat(userMessage: string, system: string, model = 'claude-haiku-4-5-20251001', clientId?: string): Promise<string> {
  return callAnthropicMessage(userMessage, model, system, clientId)
}
```

- [ ] **Vérifier le build**

```bash
cd backend && npm run build 2>&1 | grep -E "error TS"
```
Attendu : 0 erreur.

- [ ] **Commit**

```bash
git add backend/src/services/claude.ts
git commit -m "feat(backend): logging tokens Anthropic dans ai_usage_logs"
```

---

## Task 4 : Backend routes/clients.ts — plan, payment_status, addons

**Files:**
- Modify: `backend/src/routes/clients.ts`

- [ ] **Ajouter ADDON_CONFIG_TYPES et mettre à jour PILIER_CONFIG_TYPES pour GET/PUT configs**

Juste après la ligne `import { generateClientCredentials }`, ajouter l'import `decrypt` s'il n'est pas déjà là (il l'est via `encrypt`). Remplacer la section `PILIER_CONFIG_TYPES` et les routes configs :

Après `const UUID_RE = ...`, ajouter :
```typescript
const ADDON_CONFIG_TYPES = ['addon_f11', 'addon_f13', 'addon_f18'] as const
```

- [ ] **Mettre à jour GET / pour retourner plan, payment_status et addons**

Remplacer le handler `clientsRouter.get('/', ...)` en entier :

```typescript
clientsRouter.get('/', async (_req, res) => {
  const { data, error } = await supabase
    .from('clients')
    .select('id, user_id, name, email, auto_mode, paused_until, whatsapp_phone_number_id, whatsapp_active, must_change_password, plan, payment_status, created_at')
    .order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })

  const clientIds = (data ?? []).map(c => c.id)
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const [taskRows, logRows, addonRows] = await Promise.all([
    clientIds.length
      ? supabase.from('pending_tasks').select('client_id').in('client_id', clientIds).eq('status', 'pending')
      : { data: [] },
    clientIds.length
      ? supabase.from('activity_logs').select('client_id').in('client_id', clientIds).eq('status', 'sent').gte('created_at', startOfMonth.toISOString())
      : { data: [] },
    clientIds.length
      ? supabase.from('client_configs').select('client_id, config_type, encrypted_value')
          .in('client_id', clientIds)
          .in('config_type', [...ADDON_CONFIG_TYPES])
      : { data: [] },
  ])

  const taskCounts: Record<string, number> = {}
  for (const t of (taskRows as any).data ?? []) taskCounts[t.client_id] = (taskCounts[t.client_id] ?? 0) + 1

  const logCounts: Record<string, number> = {}
  for (const l of (logRows as any).data ?? []) logCounts[l.client_id] = (logCounts[l.client_id] ?? 0) + 1

  const addonsMap: Record<string, string[]> = {}
  for (const r of (addonRows as any).data ?? []) {
    try {
      if (decrypt(r.encrypted_value) === 'true') {
        if (!addonsMap[r.client_id]) addonsMap[r.client_id] = []
        addonsMap[r.client_id].push(r.config_type)
      }
    } catch {}
  }

  res.json((data ?? []).map(c => ({
    ...c,
    pending_tasks: taskCounts[c.id] ?? 0,
    emails_sent: logCounts[c.id] ?? 0,
    addons: addonsMap[c.id] ?? [],
  })))
})
```

- [ ] **Mettre à jour GET /:id pour retourner plan et payment_status**

Remplacer le `.select(...)` dans `clientsRouter.get('/:id', ...)` :
```typescript
    .select('id, user_id, name, email, auto_mode, paused_until, whatsapp_phone_number_id, whatsapp_active, must_change_password, plan, payment_status, created_at')
```

- [ ] **Mettre à jour PUT /:id pour accepter plan et payment_status**

Remplacer la destructuration et la construction du payload dans `clientsRouter.put('/:id', ...)` :
```typescript
  const { name, email, stripe_webhook_secret, sender_name, auto_mode, plan, payment_status } = req.body

  const update: Record<string, any> = { name, email }
  if (auto_mode !== undefined) update.auto_mode = auto_mode
  if (plan !== undefined) {
    if (!['standard', 'premium'].includes(plan)) return res.status(400).json({ error: 'Plan invalide' })
    update.plan = plan
  }
  if (payment_status !== undefined) {
    if (!['active', 'unpaid'].includes(payment_status)) return res.status(400).json({ error: 'Statut paiement invalide' })
    update.payment_status = payment_status
  }
```

- [ ] **Mettre à jour GET /:id/configs pour inclure les addon values**

Remplacer le bloc GET configs :
```typescript
clientsRouter.get('/:id/configs', async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'ID invalide' })
  const { data: client } = await supabase
    .from('clients')
    .select('id')
    .eq('id', req.params.id)
    .single()
  if (!client) return res.status(404).json({ error: 'Client introuvable' })

  const ALL_CONFIG_TYPES = [...PILIER_CONFIG_TYPES, ...ADDON_CONFIG_TYPES] as const

  const { data: rows } = await supabase
    .from('client_configs')
    .select('config_type, encrypted_value')
    .eq('client_id', req.params.id)
    .in('config_type', [...ALL_CONFIG_TYPES])

  const result: Record<string, string> = {}
  for (const r of rows ?? []) {
    try { result[r.config_type] = decrypt(r.encrypted_value) } catch { /* skip */ }
  }
  res.json(result)
})
```

- [ ] **Mettre à jour PUT /:id/configs pour accepter les addon keys**

Remplacer le body du handler PUT configs :
```typescript
  const ALL_WRITABLE_TYPES = [...PILIER_CONFIG_TYPES, ...ADDON_CONFIG_TYPES] as const
  const upserts: Array<{ client_id: string; config_type: string; encrypted_value: string }> = []
  for (const key of ALL_WRITABLE_TYPES) {
    if (!(key in req.body)) continue
    const val = req.body[key]
    if (typeof val !== 'string' && typeof val !== 'boolean') continue
    upserts.push({ client_id: req.params.id, config_type: key, encrypted_value: encrypt(String(val)) })
  }
```

- [ ] **Vérifier le build**

```bash
cd backend && npm run build 2>&1 | grep -E "error TS"
```
Attendu : 0 erreur.

- [ ] **Commit**

```bash
git add backend/src/routes/clients.ts
git commit -m "feat(backend): clients GET/PUT plan+payment_status+addons"
```

---

## Task 5 : Backend routes/dashboard.ts — réécriture

**Files:**
- Modify: `backend/src/routes/dashboard.ts`

- [ ] **Réécrire backend/src/routes/dashboard.ts en entier**

```typescript
import { Router } from 'express'
import { supabase } from '../services/supabase'
import { requireAuth } from '../middleware/auth'
import { decrypt } from '../services/encryption'

export const dashboardRouter = Router()
dashboardRouter.use(requireAuth)

const USD_TO_EUR = 0.92
const PRICE: Record<string, number> = {
  standard: 690, premium: 1200,
  addon_f11: 150, addon_f13: 300, addon_f18: 149,
  email: 0.001,
}
const ADDON_TYPES = ['addon_f11', 'addon_f13', 'addon_f18'] as const
const PREMIUM_FEATURE_CONFIGS: Record<string, string> = {
  f14: 'template_predunning',
  f15: 'template_churn_reengagement',
  f17: 'rapport_video_active',
  f19: 'template_coaching_j14',
}

dashboardRouter.get('/', async (_req, res) => {
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)
  const som = startOfMonth.toISOString()

  const [clientsRes, pendingRes, infraRes, aiRes] = await Promise.all([
    supabase.from('clients').select('id, name, plan, payment_status, whatsapp_active'),
    supabase.from('pending_tasks').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('settings').select('value').eq('key', 'infra_monthly_cost').maybeSingle(),
    supabase.from('ai_usage_logs').select('client_id, cost_usd').gte('created_at', som),
  ])

  const clients = clientsRes.data ?? []
  const clientIds = clients.map(c => c.id)
  const infraEur = parseFloat(infraRes.data?.value ?? '0') || 0
  const infraPerClient = clients.length > 0 ? infraEur / clients.length : 0

  const [addonRes, featureRes, emailRes] = await Promise.all([
    clientIds.length
      ? supabase.from('client_configs').select('client_id, config_type, encrypted_value')
          .in('client_id', clientIds).in('config_type', [...ADDON_TYPES])
      : { data: [] },
    clientIds.length
      ? supabase.from('client_configs').select('client_id, config_type')
          .in('client_id', clientIds)
          .in('config_type', Object.values(PREMIUM_FEATURE_CONFIGS))
      : { data: [] },
    clientIds.length
      ? supabase.from('activity_logs').select('client_id')
          .in('client_id', clientIds).eq('status', 'sent').gte('created_at', som)
      : { data: [] },
  ])

  // Addon map : client_id → Set<config_type>
  const addonMap: Record<string, Set<string>> = {}
  for (const r of (addonRes as any).data ?? []) {
    try {
      if (decrypt(r.encrypted_value) === 'true') {
        if (!addonMap[r.client_id]) addonMap[r.client_id] = new Set()
        addonMap[r.client_id].add(r.config_type)
      }
    } catch {}
  }

  // Feature activation map
  const featureMap: Record<string, Set<string>> = {}
  for (const r of (featureRes as any).data ?? []) {
    if (!featureMap[r.client_id]) featureMap[r.client_id] = new Set()
    featureMap[r.client_id].add(r.config_type)
  }

  // Email counts this month per client
  const emailCount: Record<string, number> = {}
  for (const l of (emailRes as any).data ?? []) {
    if (l.client_id) emailCount[l.client_id] = (emailCount[l.client_id] ?? 0) + 1
  }
  const emailsTotal = Object.values(emailCount).reduce((a, b) => a + b, 0)

  // AI costs this month per client
  const aiCostUsdPerClient: Record<string, number> = {}
  let aiNullCostUsd = 0
  for (const r of aiRes.data ?? []) {
    if (r.client_id) {
      aiCostUsdPerClient[r.client_id] = (aiCostUsdPerClient[r.client_id] ?? 0) + r.cost_usd
    } else {
      aiNullCostUsd += r.cost_usd
    }
  }
  const totalAiUsd = Object.values(aiCostUsdPerClient).reduce((a, b) => a + b, 0) + aiNullCostUsd

  function clientMrr(c: { id: string; plan: string }): number {
    const base = c.plan === 'premium' ? PRICE.premium : PRICE.standard
    const addons = addonMap[c.id] ?? new Set()
    return base
      + (addons.has('addon_f11') ? PRICE.addon_f11 : 0)
      + (addons.has('addon_f13') ? PRICE.addon_f13 : 0)
      + (addons.has('addon_f18') ? PRICE.addon_f18 : 0)
  }

  // MRR breakdown
  let mrrStandardBase = 0, mrrPremiumBase = 0, mrrOptionsTotal = 0
  let countStandard = 0, countPremium = 0, countUnpaid = 0, unpaidAmount = 0
  let f11Count = 0, f11Rev = 0, f13Count = 0, f13Rev = 0, f18Count = 0, f18Rev = 0

  for (const c of clients) {
    const addons = addonMap[c.id] ?? new Set()
    if (c.plan === 'standard') { countStandard++; mrrStandardBase += PRICE.standard }
    else { countPremium++; mrrPremiumBase += PRICE.premium }
    if (c.payment_status === 'unpaid') { countUnpaid++; unpaidAmount += clientMrr(c) }
    if (addons.has('addon_f11')) { f11Count++; f11Rev += PRICE.addon_f11; mrrOptionsTotal += PRICE.addon_f11 }
    if (addons.has('addon_f13')) { f13Count++; f13Rev += PRICE.addon_f13; mrrOptionsTotal += PRICE.addon_f13 }
    if (addons.has('addon_f18')) { f18Count++; f18Rev += PRICE.addon_f18; mrrOptionsTotal += PRICE.addon_f18 }
  }
  const mrrTotal = mrrStandardBase + mrrPremiumBase + mrrOptionsTotal

  // Costs
  const costAiEur = Math.round(totalAiUsd * USD_TO_EUR * 100) / 100
  const costEmailsEur = Math.round(emailsTotal * PRICE.email * 100) / 100
  const costTotalEur = Math.round((costAiEur + costEmailsEur + infraEur) * 100) / 100
  const profitNetEur = Math.round((mrrTotal - costTotalEur) * 100) / 100
  const marginPct = mrrTotal > 0 ? Math.round((profitNetEur / mrrTotal) * 1000) / 10 : 0

  // Premium feature activation counts
  const premiumClients = clients.filter(c => c.plan === 'premium')
  const premiumCount = premiumClients.length
  function featCount(configType: string): number {
    return premiumClients.filter(c => featureMap[c.id]?.has(configType)).length
  }

  // Per-client cost detail
  const clientCosts = clients.map(c => {
    const mrr = clientMrr(c)
    const aiEur = Math.round((aiCostUsdPerClient[c.id] ?? 0) * USD_TO_EUR * 100) / 100
    const emailsEur = Math.round((emailCount[c.id] ?? 0) * PRICE.email * 100) / 100
    const infra = Math.round(infraPerClient * 100) / 100
    return {
      id: c.id,
      name: c.name,
      plan: c.plan,
      payment_status: c.payment_status,
      mrr,
      cost_ai_eur: aiEur,
      cost_emails_eur: emailsEur,
      cost_infra_eur: infra,
      profit_net_eur: c.payment_status === 'active'
        ? Math.round((mrr - aiEur - emailsEur - infra) * 100) / 100
        : null,
      addons: [...(addonMap[c.id] ?? [])],
    }
  })

  res.json({
    clients: clients.length,
    pending_tasks: pendingRes.count ?? 0,
    emails_sent: emailsTotal,
    mrr_total: mrrTotal,
    mrr_standard: mrrStandardBase,
    mrr_premium: mrrPremiumBase,
    mrr_options: mrrOptionsTotal,
    count_standard: countStandard,
    count_premium: countPremium,
    count_unpaid: countUnpaid,
    unpaid_amount: unpaidAmount,
    cost_ai_usd: Math.round(totalAiUsd * 1000000) / 1000000,
    cost_ai_eur: costAiEur,
    cost_emails_eur: costEmailsEur,
    cost_infra_eur: infraEur,
    cost_total_eur: costTotalEur,
    profit_net_eur: profitNetEur,
    margin_pct: marginPct,
    options_revenue: {
      f11: { count: f11Count, revenue: f11Rev },
      f13: { count: f13Count, revenue: f13Rev },
      f18: { count: f18Count, revenue: f18Rev },
    },
    premium_features: {
      f14: featCount(PREMIUM_FEATURE_CONFIGS.f14),
      f15: featCount(PREMIUM_FEATURE_CONFIGS.f15),
      f16: premiumClients.filter(c => (c as any).whatsapp_active).length,
      f17: featCount(PREMIUM_FEATURE_CONFIGS.f17),
      f19: featCount(PREMIUM_FEATURE_CONFIGS.f19),
      f20: 0,
    },
    premium_count: premiumCount,
    client_costs: clientCosts,
  })
})
```

- [ ] **Vérifier le build**

```bash
cd backend && npm run build 2>&1 | grep -E "error TS"
```
Attendu : 0 erreur.

- [ ] **Commit**

```bash
git add backend/src/routes/dashboard.ts
git commit -m "feat(backend): dashboard enrichi — MRR, coûts, profit, features"
```

---

## Task 6 : Backend settings.ts + coût infra

**Files:**
- Modify: `backend/src/routes/settings.ts`

- [ ] **Ajouter infra_monthly_cost au GET et PUT settings**

Dans `settingsRouter.get('/')`, remplacer la réponse :
```typescript
  res.json({
    auto_mode: map['auto_mode'] === 'true',
    has_api_key: !!map['anthropic_api_key'],
    infra_monthly_cost: parseFloat(map['infra_monthly_cost'] ?? '0') || 0,
  })
```

Dans `settingsRouter.put('/')`, ajouter après le bloc `auto_mode` :
```typescript
  const { auto_mode, anthropic_api_key, infra_monthly_cost } = req.body

  // ... (blocs anthropic_api_key et auto_mode inchangés)

  if (infra_monthly_cost !== undefined) {
    const val = parseFloat(String(infra_monthly_cost))
    if (isNaN(val) || val < 0) return res.status(400).json({ error: 'Coût infra invalide' })
    await supabase.from('settings').upsert({ key: 'infra_monthly_cost', value: String(val) })
  }
```

- [ ] **Vérifier le build**

```bash
cd backend && npm run build 2>&1 | grep -E "error TS"
```
Attendu : 0 erreur.

- [ ] **Commit**

```bash
git add backend/src/routes/settings.ts
git commit -m "feat(backend): settings infra_monthly_cost GET+PUT"
```

---

## Task 7 : Frontend — renommage + settings infra

**Files:**
- Modify: `frontend/components/sidebar.tsx`
- Modify: `frontend/app/(app)/settings/page.tsx`

- [ ] **sidebar.tsx : remplacer le nom dans le logo**

Ligne 54-56, remplacer :
```tsx
            <span className="font-semibold text-sm tracking-tight text-foreground">
              Automate<span className="text-primary">Pro</span>
            </span>
```
par :
```tsx
            <span className="font-semibold text-sm tracking-tight text-foreground">
              AEVUM<span className="text-primary"> APP</span>
            </span>
```

- [ ] **settings/page.tsx : remplacer les 3 occurrences "AutomatePro" et ajouter le champ infra**

Ligne 74 — remplacer :
```tsx
        <p className="text-sm text-muted-foreground mt-0.5">Configurez votre instance AutomatePro.</p>
```
par :
```tsx
        <p className="text-sm text-muted-foreground mt-0.5">Configurez votre instance AEVUM APP.</p>
```

Ligne 200 — remplacer `RESEND_FROM_DOMAIN` par `RESEND_FROM_EMAIL` (variable d'env renommée en F9).

Lignes 257-258 — remplacer :
```tsx
              <p className="text-xs text-muted-foreground">
                <span className="text-foreground font-medium">AutomatePro</span> — v1.0.0
              </p>
```
par :
```tsx
              <p className="text-xs text-muted-foreground">
                <span className="text-foreground font-medium">AEVUM APP</span> — v1.0.0
              </p>
```

- [ ] **settings/page.tsx : ajouter état et champ coût infra**

Dans l'interface `SettingsData`, ajouter :
```typescript
  infra_monthly_cost: number
```

Dans l'état initial :
```typescript
  const [settings, setSettings] = useState<SettingsData>({ auto_mode: false, has_api_key: false, infra_monthly_cost: 0 })
  const [infraCost, setInfraCost] = useState('')
  const [savingInfra, setSavingInfra] = useState(false)
```

Dans le `useEffect`, mettre à jour :
```typescript
  useEffect(() => {
    api.get<SettingsData>('/api/settings').then(s => {
      setSettings(s)
      setInfraCost(s.infra_monthly_cost > 0 ? String(s.infra_monthly_cost) : '')
    })
  }, [])
```

Ajouter la fonction de sauvegarde :
```typescript
  async function saveInfraCost() {
    const val = parseFloat(infraCost)
    if (isNaN(val) || val < 0) return
    setSavingInfra(true)
    try {
      await api.put('/api/settings', { infra_monthly_cost: val })
      setSettings(s => ({ ...s, infra_monthly_cost: val }))
      toast.success('Coût infra enregistré')
    } catch (err: any) {
      toast.error(err.message || 'Erreur')
    } finally {
      setSavingInfra(false)
    }
  }
```

Ajouter la section infra dans le JSX, juste avant la section "À propos" :
```tsx
      {/* ── Coût infrastructure ──────────────────────────────── */}
      <div className={sectionClass}>
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold">Coût infrastructure mensuel</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Render + Vercel + Supabase — utilisé pour calculer le profit net par client.
            </p>
            <div className="flex gap-2 mt-3">
              <div className="relative flex-1">
                <Input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="ex: 140"
                  value={infraCost}
                  onChange={e => setInfraCost(e.target.value)}
                  className="pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
              </div>
              <Button onClick={saveInfraCost} disabled={savingInfra || !infraCost} variant="outline" className="flex-shrink-0">
                {savingInfra ? 'Enregistrement…' : 'Sauvegarder'}
              </Button>
            </div>
          </div>
        </div>
      </div>
```

- [ ] **Vérifier que le frontend compile**

```bash
cd frontend && npm run build 2>&1 | grep -E "error|Error" | head -20
```
Attendu : build réussi sans erreur.

- [ ] **Commit**

```bash
git add frontend/components/sidebar.tsx frontend/app/(app)/settings/page.tsx
git commit -m "feat(frontend): renommage AEVUM APP + champ coût infra dans settings"
```

---

## Task 8 : Frontend dashboard/page.tsx — réécriture

**Files:**
- Modify: `frontend/app/(app)/dashboard/page.tsx`

- [ ] **Réécrire frontend/app/(app)/dashboard/page.tsx**

Le fichier fait ~350 lignes. Voici le contenu complet :

```tsx
'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import Link from 'next/link'
import { ArrowRight, Clock } from 'lucide-react'

interface ClientCost {
  id: string
  name: string
  plan: string
  payment_status: string
  mrr: number
  cost_ai_eur: number
  cost_emails_eur: number
  cost_infra_eur: number
  profit_net_eur: number | null
  addons: string[]
}

interface DashboardData {
  clients: number
  pending_tasks: number
  emails_sent: number
  mrr_total: number
  mrr_standard: number
  mrr_premium: number
  mrr_options: number
  count_standard: number
  count_premium: number
  count_unpaid: number
  unpaid_amount: number
  cost_ai_eur: number
  cost_emails_eur: number
  cost_infra_eur: number
  cost_total_eur: number
  profit_net_eur: number
  margin_pct: number
  options_revenue: {
    f11: { count: number; revenue: number }
    f13: { count: number; revenue: number }
    f18: { count: number; revenue: number }
  }
  premium_features: { f14: number; f15: number; f16: number; f17: number; f19: number; f20: number }
  premium_count: number
  client_costs: ClientCost[]
}

interface LogRow {
  id: string
  client_id: string | null
  action_type: string
  status: string
  created_at: string
  payload_json: Record<string, any>
  clients: { name: string } | null
}

const ACTION_LABELS: Record<string, string> = {
  failed_payment_email: 'Relance impayé',
  onboarding_j0_email: 'Bienvenue J0',
  onboarding_j3_email: 'Suivi J+3',
  onboarding_j7_email: 'Engagement J+7',
  upsell_email: 'Upsell',
  support_auto_acces: 'Support accès',
  custom_automation: 'Automation personnalisée',
}

const PREMIUM_FEATURE_LABELS: Array<{ key: keyof DashboardData['premium_features']; label: string }> = [
  { key: 'f14', label: 'F14 · Pré-dunning CB' },
  { key: 'f15', label: 'F15 · Churn prédictif' },
  { key: 'f16', label: 'F16 · WhatsApp Business' },
  { key: 'f17', label: 'F17 · Rapport vidéo IA' },
  { key: 'f19', label: 'F19 · Coaching élèves' },
  { key: 'f20', label: 'F20 · SMS Twilio' },
]

function fmt(n: number, dec = 0): string {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

function relTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60) return `${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}j`
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [logs, setLogs] = useState<LogRow[]>([])
  const [loadingLogs, setLoadingLogs] = useState(true)

  useEffect(() => {
    api.get<DashboardData>('/api/dashboard').then(setData).catch(console.error)
    api.get<{ data: LogRow[] }>('/api/history?limit=5&status=sent')
      .then(r => setLogs(r.data ?? []))
      .catch(() => {})
      .finally(() => setLoadingLogs(false))
  }, [])

  if (!data) return (
    <div className="space-y-6 animate-fade-in">
      <div className="h-8 w-48 bg-muted rounded animate-pulse" />
      <div className="grid grid-cols-3 gap-4">
        {[0,1,2].map(i => <div key={i} className="h-32 bg-muted rounded-xl animate-pulse" />)}
      </div>
    </div>
  )

  const mrrTotal = data.mrr_total
  const barStd = mrrTotal > 0 ? (data.mrr_standard / mrrTotal * 100).toFixed(1) : '0'
  const barPrem = mrrTotal > 0 ? (data.mrr_premium / mrrTotal * 100).toFixed(1) : '0'
  const barOpt = mrrTotal > 0 ? (data.mrr_options / mrrTotal * 100).toFixed(1) : '0'

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Vue d&apos;ensemble</h1>
        <p className="text-sm text-muted-foreground mt-1">AEVUM APP — tableau de bord admin</p>
      </div>

      {data.pending_tasks > 0 && (
        <Link href="/clients" className="flex items-center justify-between rounded-lg border border-amber-500/40 bg-amber-500/8 px-4 py-3 text-sm hover:bg-amber-500/12 transition-colors group">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" />
            <span>
              <span className="font-medium text-amber-600 dark:text-amber-400">{data.pending_tasks} tâche{data.pending_tasks > 1 ? 's' : ''}</span>
              <span className="text-muted-foreground"> en attente de validation</span>
            </span>
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
        </Link>
      )}

      {/* Hero 3 blocs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* MRR */}
        <div className="card-elevated p-5 border-emerald-500/20">
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Revenu mensuel (MRR)</p>
          <p className="text-4xl font-extrabold text-emerald-500 tabular-nums">{fmt(mrrTotal)}€</p>
          <p className="text-xs text-muted-foreground mt-1">{data.clients} client{data.clients > 1 ? 's' : ''}{data.count_unpaid > 0 ? ` · ${data.count_unpaid} impayé` : ''}</p>
          <div className="flex h-2 rounded overflow-hidden mt-3">
            <div style={{ width: `${barStd}%` }} className="bg-indigo-500" title={`Standard ${data.mrr_standard}€`} />
            <div style={{ width: `${barPrem}%` }} className="bg-emerald-500" title={`Premium ${data.mrr_premium}€`} />
            <div style={{ width: `${barOpt}%` }} className="bg-amber-500" title={`Options ${data.mrr_options}€`} />
          </div>
          <div className="flex gap-3 mt-1.5 flex-wrap">
            <span className="text-[10px] text-indigo-400 flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-indigo-500 inline-block" />Std {fmt(data.mrr_standard)}€</span>
            <span className="text-[10px] text-emerald-400 flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500 inline-block" />Prem {fmt(data.mrr_premium)}€</span>
            <span className="text-[10px] text-amber-400 flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-500 inline-block" />Opt {fmt(data.mrr_options)}€</span>
          </div>
        </div>

        {/* Coûts */}
        <div className="card-elevated p-5 border-red-500/20">
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Coûts ce mois</p>
          <p className="text-4xl font-extrabold text-red-500 tabular-nums">-{fmt(data.cost_total_eur)}€</p>
          <div className="mt-3 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">IA Anthropic <span className="text-emerald-600 dark:text-emerald-400 text-[10px]">auto</span></span>
              <span className="font-medium">{fmt(data.cost_ai_eur, 2)}€</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Emails Resend <span className="text-emerald-600 dark:text-emerald-400 text-[10px]">auto</span></span>
              <span className="font-medium">{fmt(data.cost_emails_eur, 2)}€</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">
                Infra (Render+Vercel+SB)
                {data.cost_infra_eur === 0 && (
                  <Link href="/settings" className="ml-1 text-primary hover:underline text-[10px]">↗ définir</Link>
                )}
              </span>
              <span className="font-medium">{fmt(data.cost_infra_eur)}€</span>
            </div>
          </div>
        </div>

        {/* Profit net */}
        <div className="card-elevated p-5 border-2 border-emerald-500/30">
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Profit net <span className="normal-case text-[10px]">(hors taxes)</span></p>
          <p className="text-4xl font-extrabold text-emerald-500 tabular-nums">{fmt(data.profit_net_eur)}€</p>
          <div className="mt-3">
            <div className="h-2 bg-muted rounded overflow-hidden">
              <div className="h-full bg-emerald-500 rounded transition-all" style={{ width: `${Math.min(data.margin_pct, 100)}%` }} />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-xs text-muted-foreground">Marge</span>
              <span className="text-xs font-bold text-emerald-500">{fmt(data.margin_pct, 1)}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* 6 stats secondaires */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {[
          { label: 'Standard', value: data.count_standard, sub: `${fmt(data.mrr_standard)}€/m`, color: 'text-indigo-400' },
          { label: 'Premium', value: data.count_premium, sub: `${fmt(data.mrr_premium)}€/m`, color: 'text-emerald-400' },
          { label: 'Tâches', value: data.pending_tasks, sub: 'à valider', color: 'text-amber-400' },
          { label: 'Emails', value: data.emails_sent, sub: 'ce mois', color: 'text-blue-400' },
          { label: 'Impayés', value: data.count_unpaid, sub: data.count_unpaid > 0 ? `-${fmt(data.unpaid_amount)}€` : '—', color: data.count_unpaid > 0 ? 'text-red-400' : 'text-muted-foreground' },
          { label: 'Options', value: data.options_revenue.f11.count + data.options_revenue.f13.count + data.options_revenue.f18.count, sub: 'vendues', color: 'text-foreground' },
        ].map(({ label, value, sub, color }) => (
          <div key={label} className="card-elevated p-3 text-center">
            <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
            <p className="text-xs font-medium text-foreground mt-0.5">{label}</p>
            <p className="text-[10px] text-muted-foreground">{sub}</p>
          </div>
        ))}
      </div>

      {/* Coûts par client + options + features Premium */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Tableau par client — 3/5 */}
        <div className="lg:col-span-3 card-elevated overflow-hidden">
          <div className="px-4 py-3 border-b border-border/60">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Coût & profit par client</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">IA calculé auto via tokens · infra répartie équitablement</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/60 text-muted-foreground">
                  <th className="text-left px-4 py-2.5 font-medium">Client</th>
                  <th className="text-right px-3 py-2.5 font-medium">MRR</th>
                  <th className="text-right px-3 py-2.5 font-medium">IA</th>
                  <th className="text-right px-3 py-2.5 font-medium">Emails</th>
                  <th className="text-right px-3 py-2.5 font-medium">Infra</th>
                  <th className="text-right px-4 py-2.5 font-medium">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {data.client_costs.map(c => (
                  <tr key={c.id} className={c.payment_status === 'unpaid' ? 'opacity-60' : ''}>
                    <td className="px-4 py-3">
                      <Link href={`/clients/${c.id}`} className="font-medium hover:text-primary transition-colors">{c.name}</Link>
                      <p className={`text-[10px] mt-0.5 ${c.plan === 'premium' ? 'text-emerald-500' : 'text-indigo-400'}`}>
                        {c.plan === 'premium' ? 'Premium' : 'Standard'}
                        {c.addons.length > 0 && ` + ${c.addons.map(a => a.replace('addon_', '').toUpperCase()).join(' ')}`}
                      </p>
                    </td>
                    <td className={`px-3 py-3 text-right font-semibold tabular-nums ${c.payment_status === 'unpaid' ? 'text-red-400' : c.plan === 'premium' ? 'text-emerald-400' : 'text-indigo-400'}`}>
                      {fmt(c.mrr)}€
                    </td>
                    <td className="px-3 py-3 text-right text-muted-foreground tabular-nums">{c.cost_ai_eur > 0 ? `-${fmt(c.cost_ai_eur, 2)}€` : '—'}</td>
                    <td className="px-3 py-3 text-right text-muted-foreground tabular-nums">{c.cost_emails_eur > 0 ? `-${fmt(c.cost_emails_eur, 2)}€` : '—'}</td>
                    <td className="px-3 py-3 text-right text-muted-foreground tabular-nums">-{fmt(c.cost_infra_eur, 0)}€</td>
                    <td className={`px-4 py-3 text-right font-bold tabular-nums ${c.payment_status === 'unpaid' ? 'text-red-400' : 'text-emerald-400'}`}>
                      {c.payment_status === 'unpaid' ? 'impayé' : `${fmt(c.profit_net_eur ?? 0)}€`}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border/60 bg-muted/30">
                  <td className="px-4 py-2.5 text-muted-foreground">Total</td>
                  <td className="px-3 py-2.5 text-right font-bold text-emerald-400 tabular-nums">{fmt(data.mrr_total)}€</td>
                  <td className="px-3 py-2.5 text-right text-muted-foreground tabular-nums">-{fmt(data.cost_ai_eur, 2)}€</td>
                  <td className="px-3 py-2.5 text-right text-muted-foreground tabular-nums">-{fmt(data.cost_emails_eur, 2)}€</td>
                  <td className="px-3 py-2.5 text-right text-muted-foreground tabular-nums">-{fmt(data.cost_infra_eur, 0)}€</td>
                  <td className="px-4 py-2.5 text-right font-bold text-emerald-400 tabular-nums">{fmt(data.profit_net_eur)}€</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Options + Features — 2/5 */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* Options payantes */}
          <div className="card-elevated p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Options payantes</p>
            <p className="text-[10px] text-muted-foreground mb-3">Modules vendus en supplément</p>
            <div className="space-y-2.5">
              {[
                { key: 'f11', label: 'Abandons checkout', price: '+150€', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
                { key: 'f13', label: 'Récup. vocale IA', price: '+300€', color: 'bg-violet-500/10 text-violet-400 border-violet-500/20' },
                { key: 'f18', label: 'Module Notaire', price: '+149€/dos.', color: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
              ].map(({ key, label, price, color }) => {
                const opt = data.options_revenue[key as 'f11' | 'f13' | 'f18']
                return (
                  <div key={key} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`border rounded px-1.5 py-0.5 text-[10px] font-bold ${color}`}>{key.toUpperCase()}</span>
                      <div>
                        <p className="text-xs text-foreground">{label}</p>
                        <p className="text-[10px] text-muted-foreground">{price} · {opt.count} client{opt.count > 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <p className={`text-sm font-bold tabular-nums ${opt.count > 0 ? 'text-amber-400' : 'text-muted-foreground/40'}`}>{fmt(opt.revenue)}€</p>
                  </div>
                )
              })}
            </div>
            <div className="border-t border-border/60 mt-3 pt-2.5 flex justify-between">
              <span className="text-xs text-muted-foreground">Total options</span>
              <span className="text-sm font-bold text-amber-400">{fmt(data.mrr_options)}€</span>
            </div>
          </div>

          {/* Features Premium */}
          <div className="card-elevated p-4 flex-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Features Premium activées</p>
            <p className="text-[10px] text-muted-foreground mb-3">Sur {data.premium_count} client{data.premium_count > 1 ? 's' : ''} Premium — combien ont activé la feature</p>
            <div className="space-y-2">
              {PREMIUM_FEATURE_LABELS.map(({ key, label }) => {
                const count = data.premium_features[key]
                const total = data.premium_count
                const color = count === 0 ? 'text-muted-foreground/40' : count < total ? 'text-amber-400' : 'text-emerald-400'
                return (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        {Array.from({ length: Math.max(total, 1) }).map((_, i) => (
                          <span key={i} className={`w-2 h-2 rounded-full border ${i < count ? (count < total ? 'bg-amber-400 border-amber-400' : 'bg-emerald-400 border-emerald-400') : 'bg-transparent border-border'}`} />
                        ))}
                      </div>
                      <span className={`text-[10px] font-semibold ${color}`}>{count}/{total}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Activité récente */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Activité récente</h2>
          <Link href="/clients" className="text-xs text-primary hover:underline flex items-center gap-1">
            Voir les clients <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        {loadingLogs ? (
          <div className="space-y-2">{[0,1,2].map(i => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}</div>
        ) : logs.length === 0 ? (
          <div className="flex items-center justify-center py-10 border border-border/60 rounded-lg bg-card/40">
            <p className="text-sm text-muted-foreground">Aucune activité pour l&apos;instant</p>
          </div>
        ) : (
          <div className="border border-border/60 rounded-lg overflow-hidden divide-y divide-border/60 bg-card/40">
            {logs.map(log => (
              <div key={log.id} className="flex items-center justify-between px-4 py-2.5">
                <div className="min-w-0">
                  {log.clients?.name && (
                    <Link href={`/clients/${log.client_id}`} className="text-sm font-semibold hover:text-primary transition-colors">
                      {log.clients.name}
                    </Link>
                  )}
                  <p className="text-xs text-muted-foreground truncate">
                    {ACTION_LABELS[log.action_type] ?? log.action_type}
                    {log.payload_json?.to && ` · ${log.payload_json.to}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  <span className="text-xs text-muted-foreground">{relTime(log.created_at)}</span>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${log.status === 'sent' ? 'badge-sent' : 'badge-failed'}`}>
                    {log.status === 'sent' ? 'envoyé' : 'échoué'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Vérifier le build frontend**

```bash
cd frontend && npm run build 2>&1 | grep -E "error|Error" | head -20
```
Attendu : build réussi.

- [ ] **Commit**

```bash
git add frontend/app/(app)/dashboard/page.tsx
git commit -m "feat(frontend): dashboard — MRR hero, coûts auto, profit, options, features Premium"
```

---

## Task 9 : Frontend clients/page.tsx — réécriture

**Files:**
- Modify: `frontend/app/(app)/clients/page.tsx`

- [ ] **Réécrire frontend/app/(app)/clients/page.tsx**

```tsx
'use client'
import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { ClientForm } from '@/components/client-form'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface ClientRow {
  id: string
  name: string
  email: string
  created_at: string
  pending_tasks: number
  emails_sent: number
  plan: 'standard' | 'premium'
  payment_status: 'active' | 'unpaid'
  addons: string[]
}

const MRR = { standard: 690, premium: 1200, addon_f11: 150, addon_f13: 300, addon_f18: 149 }

function calcMrr(plan: string, addons: string[]): number {
  const base = plan === 'premium' ? MRR.premium : MRR.standard
  return base
    + (addons.includes('addon_f11') ? MRR.addon_f11 : 0)
    + (addons.includes('addon_f13') ? MRR.addon_f13 : 0)
    + (addons.includes('addon_f18') ? MRR.addon_f18 : 0)
}

function fmt(n: number): string {
  return n.toLocaleString('fr-FR')
}

type FilterPlan = 'all' | 'standard' | 'premium'
type FilterPayment = 'all' | 'active' | 'unpaid'
type FilterAddon = 'all' | 'addon_f11' | 'addon_f13' | 'addon_f18' | 'none'
type SortBy = 'name_asc' | 'name_desc' | 'mrr_desc' | 'mrr_asc' | 'plan' | 'date_desc'

const ADDON_META = [
  { key: 'addon_f11', label: 'F11', price: '+150€', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  { key: 'addon_f13', label: 'F13', price: '+300€', color: 'bg-violet-500/10 text-violet-400 border-violet-500/30' },
  { key: 'addon_f18', label: 'F18', price: '+149€', color: 'bg-rose-500/10 text-rose-400 border-rose-500/30' },
]

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientRow[]>([])
  const [search, setSearch] = useState('')
  const [filterPlan, setFilterPlan] = useState<FilterPlan>('all')
  const [filterPayment, setFilterPayment] = useState<FilterPayment>('all')
  const [filterAddon, setFilterAddon] = useState<FilterAddon>('all')
  const [sortBy, setSortBy] = useState<SortBy>('date_desc')
  const [showForm, setShowForm] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)

  async function load() {
    try {
      const data = await api.get<ClientRow[]>('/api/clients')
      setClients(data)
    } catch (err: any) {
      console.error(err.message)
    }
  }

  useEffect(() => { load() }, [])

  async function updatePlan(client: ClientRow, plan: 'standard' | 'premium') {
    setSavingId(client.id + ':plan')
    try {
      await api.put(`/api/clients/${client.id}`, { name: client.name, email: client.email, plan })
      setClients(cs => cs.map(c => c.id === client.id ? { ...c, plan } : c))
    } catch (err: any) {
      toast.error(err.message || 'Erreur')
    } finally {
      setSavingId(null)
    }
  }

  async function toggleAddon(client: ClientRow, addonKey: string) {
    setSavingId(client.id + ':' + addonKey)
    const isActive = client.addons.includes(addonKey)
    const newValue = isActive ? 'false' : 'true'
    try {
      await api.put(`/api/clients/${client.id}/configs`, { [addonKey]: newValue })
      setClients(cs => cs.map(c => {
        if (c.id !== client.id) return c
        const addons = isActive
          ? c.addons.filter(a => a !== addonKey)
          : [...c.addons, addonKey]
        return { ...c, addons }
      }))
    } catch (err: any) {
      toast.error(err.message || 'Erreur')
    } finally {
      setSavingId(null)
    }
  }

  async function togglePayment(client: ClientRow) {
    setSavingId(client.id + ':payment')
    const payment_status = client.payment_status === 'active' ? 'unpaid' : 'active'
    try {
      await api.put(`/api/clients/${client.id}`, { name: client.name, email: client.email, payment_status })
      setClients(cs => cs.map(c => c.id === client.id ? { ...c, payment_status } : c))
    } catch (err: any) {
      toast.error(err.message || 'Erreur')
    } finally {
      setSavingId(null)
    }
  }

  const activeFilters: string[] = []
  if (filterPlan !== 'all') activeFilters.push(`Plan: ${filterPlan === 'standard' ? 'Standard' : 'Premium'}`)
  if (filterPayment !== 'all') activeFilters.push(`Paiement: ${filterPayment === 'active' ? 'Actif' : 'Impayé'}`)
  if (filterAddon !== 'all') activeFilters.push(filterAddon === 'none' ? 'Sans option' : `Avec ${filterAddon.replace('addon_', '').toUpperCase()}`)
  const sortLabel: Record<SortBy, string> = {
    name_asc: 'Nom A→Z', name_desc: 'Nom Z→A',
    mrr_desc: 'MRR ↓', mrr_asc: 'MRR ↑',
    plan: 'Plan', date_desc: 'Date création',
  }
  if (sortBy !== 'date_desc') activeFilters.push(`Tri: ${sortLabel[sortBy]}`)

  function resetFilters() {
    setSearch('')
    setFilterPlan('all')
    setFilterPayment('all')
    setFilterAddon('all')
    setSortBy('date_desc')
  }

  const filtered = useMemo(() => {
    let result = [...clients]
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(c => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q))
    }
    if (filterPlan !== 'all') result = result.filter(c => c.plan === filterPlan)
    if (filterPayment !== 'all') result = result.filter(c => c.payment_status === filterPayment)
    if (filterAddon === 'none') result = result.filter(c => c.addons.length === 0)
    else if (filterAddon !== 'all') result = result.filter(c => c.addons.includes(filterAddon))
    result.sort((a, b) => {
      if (sortBy === 'name_asc') return a.name.localeCompare(b.name, 'fr')
      if (sortBy === 'name_desc') return b.name.localeCompare(a.name, 'fr')
      if (sortBy === 'mrr_desc') return calcMrr(b.plan, b.addons) - calcMrr(a.plan, a.addons)
      if (sortBy === 'mrr_asc') return calcMrr(a.plan, a.addons) - calcMrr(b.plan, b.addons)
      if (sortBy === 'plan') return b.plan.localeCompare(a.plan)
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
    return result
  }, [clients, search, filterPlan, filterPayment, filterAddon, sortBy])

  const totalMrr = clients.reduce((a, c) => a + calcMrr(c.plan, c.addons), 0)
  const selectCls = "rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 transition-shadow"

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {clients.length > 0
              ? `${clients.length} client${clients.length > 1 ? 's' : ''} · MRR ${fmt(totalMrr)}€`
              : 'Gérez vos clients et leurs plans'}
          </p>
        </div>
        <Button onClick={() => setShowForm(true)} className="btn-glow gap-2">
          <span className="text-base leading-none">+</span> Nouveau client
        </Button>
      </div>

      {/* Barre de contrôle */}
      {clients.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-card/40 p-4 space-y-3">
          <input
            type="text"
            placeholder="Rechercher par nom ou email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={`${selectCls} w-full`}
          />
          <div className="flex gap-2 flex-wrap items-center">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Filtrer</span>
            <select value={filterPlan} onChange={e => setFilterPlan(e.target.value as FilterPlan)} className={selectCls}>
              <option value="all">Tous les plans</option>
              <option value="standard">Standard</option>
              <option value="premium">Premium</option>
            </select>
            <select value={filterPayment} onChange={e => setFilterPayment(e.target.value as FilterPayment)} className={selectCls}>
              <option value="all">Tous statuts</option>
              <option value="active">✓ Actif</option>
              <option value="unpaid">✗ Impayé</option>
            </select>
            <select value={filterAddon} onChange={e => setFilterAddon(e.target.value as FilterAddon)} className={selectCls}>
              <option value="all">Toutes options</option>
              <option value="addon_f11">Avec F11</option>
              <option value="addon_f13">Avec F13</option>
              <option value="addon_f18">Avec F18</option>
              <option value="none">Sans option</option>
            </select>
            <div className="w-px h-5 bg-border mx-1" />
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Trier</span>
            <select value={sortBy} onChange={e => setSortBy(e.target.value as SortBy)} className={selectCls}>
              <option value="date_desc">Date création</option>
              <option value="name_asc">Nom A→Z</option>
              <option value="name_desc">Nom Z→A</option>
              <option value="mrr_desc">MRR ↓</option>
              <option value="mrr_asc">MRR ↑</option>
              <option value="plan">Plan</option>
            </select>
            {activeFilters.length > 0 && (
              <button onClick={resetFilters} className="text-xs text-muted-foreground hover:text-foreground transition-colors ml-1">
                ✕ Réinit.
              </button>
            )}
          </div>
          {activeFilters.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Actifs :</span>
              {activeFilters.map(f => (
                <span key={f} className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">{f}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tableau ou empty state */}
      {clients.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border border-border/60 rounded-xl bg-card/40">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
            </svg>
          </div>
          <p className="text-sm font-semibold mb-1">Aucun client pour l&apos;instant</p>
          <p className="text-xs text-muted-foreground mb-5 max-w-xs">Ajoutez votre premier client pour commencer.</p>
          <Button onClick={() => setShowForm(true)} className="btn-glow gap-2">
            <span className="text-base leading-none">+</span> Ajouter votre premier client
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 border border-border/60 rounded-xl bg-card/40">
          <p className="text-sm text-muted-foreground">Aucun résultat pour ces filtres.</p>
          <button onClick={resetFilters} className="text-xs text-primary hover:underline mt-2">Réinitialiser</button>
        </div>
      ) : (
        <div className="border border-border/60 rounded-xl overflow-hidden bg-card/30">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-card/60 text-xs text-muted-foreground">
                  <th className="text-left px-4 py-3 font-medium">Client</th>
                  <th className="text-center px-3 py-3 font-medium">Plan</th>
                  <th className="text-center px-3 py-3 font-medium">Options</th>
                  <th className="text-right px-3 py-3 font-medium">MRR</th>
                  <th className="text-center px-3 py-3 font-medium">Paiement</th>
                  <th className="text-center px-3 py-3 font-medium">Tâches</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filtered.map(client => {
                  const initials = client.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
                  const mrr = calcMrr(client.plan, client.addons)
                  const mrrColor = client.payment_status === 'unpaid' ? 'text-red-400' : client.plan === 'premium' ? 'text-emerald-400' : 'text-indigo-400'
                  return (
                    <tr key={client.id} className="hover:bg-accent/30 transition-colors">
                      {/* Client */}
                      <td className="px-4 py-3">
                        <Link href={`/clients/${client.id}`} className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-semibold text-primary">{initials}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium truncate hover:text-primary transition-colors">{client.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{client.email}</p>
                          </div>
                        </Link>
                      </td>
                      {/* Plan dropdown */}
                      <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                        <select
                          value={client.plan}
                          onChange={e => updatePlan(client, e.target.value as 'standard' | 'premium')}
                          disabled={savingId === client.id + ':plan'}
                          className={`rounded-md border px-2 py-1 text-xs font-semibold cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring/50 disabled:opacity-50 ${
                            client.plan === 'premium'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
                          }`}
                        >
                          <option value="standard">Standard</option>
                          <option value="premium">Premium</option>
                        </select>
                      </td>
                      {/* Options badges */}
                      <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex gap-1.5 justify-center flex-wrap">
                          {ADDON_META.map(({ key, label, price, color }) => {
                            const active = client.addons.includes(key)
                            const saving = savingId === client.id + ':' + key
                            return (
                              <button
                                key={key}
                                onClick={() => toggleAddon(client, key)}
                                disabled={saving}
                                title={price}
                                className={`rounded-full border px-2 py-0.5 text-[10px] font-bold transition-all disabled:opacity-50 ${
                                  active ? color : 'bg-transparent text-muted-foreground/40 border-border/40 hover:border-border'
                                }`}
                              >
                                {saving ? '…' : active ? `${label} ✓` : label}
                              </button>
                            )
                          })}
                        </div>
                      </td>
                      {/* MRR */}
                      <td className={`px-3 py-3 text-right font-bold tabular-nums ${mrrColor}`}>
                        {fmt(mrr)}€
                      </td>
                      {/* Paiement toggle */}
                      <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => togglePayment(client)}
                          disabled={savingId === client.id + ':payment'}
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold border transition-all disabled:opacity-50 ${
                            client.payment_status === 'active'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                              : 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${client.payment_status === 'active' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                          {savingId === client.id + ':payment' ? '…' : client.payment_status === 'active' ? 'actif' : 'impayé'}
                        </button>
                      </td>
                      {/* Tâches */}
                      <td className="px-3 py-3 text-center">
                        {client.pending_tasks > 0 ? (
                          <Link href={`/clients/${client.id}`} className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/15 text-amber-400 text-xs font-bold hover:bg-amber-500/25 transition-colors">
                            {client.pending_tasks}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground/30 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {filtered.length < clients.length && (
            <div className="px-4 py-2.5 border-t border-border/60 text-xs text-muted-foreground text-right">
              {filtered.length} / {clients.length} client{clients.length > 1 ? 's' : ''} affichés
            </div>
          )}
        </div>
      )}

      <ClientForm open={showForm} onClose={() => setShowForm(false)} onCreated={load} />
    </div>
  )
}
```

- [ ] **Vérifier le build frontend**

```bash
cd frontend && npm run build 2>&1 | grep -E "error|Error" | head -20
```
Attendu : build réussi.

- [ ] **Commit**

```bash
git add frontend/app/(app)/clients/page.tsx
git commit -m "feat(frontend): page clients — plan/addons/paiement inline, filtres cumulatifs"
```

---

## Self-review checklist

- [x] **Task 1** couvre migrations 021 + 022 ✓
- [x] **Task 2** ajoute addon_f11/f13/f18 à ALLOWED_CONFIG_TYPES ✓
- [x] **Task 3** met à jour callClaude/callClaudeChat avec clientId optionnel + log tokens ✓
- [x] **Task 4** étend GET / + GET /:id + PUT /:id + GET/PUT /:id/configs ✓
- [x] **Task 5** réécrit dashboard avec MRR, coûts, profit, options, features ✓
- [x] **Task 6** ajoute infra_monthly_cost GET+PUT ✓
- [x] **Task 7** couvre renommage sidebar + settings + champ infra frontend ✓
- [x] **Task 8** couvre dashboard page complète ✓
- [x] **Task 9** couvre clients page complète ✓
- [x] Tous les types frontend (ClientRow.plan/payment_status/addons, DashboardData) correspondent aux réponses backend ✓
- [x] `e.stopPropagation()` sur tous les éléments interactifs du tableau clients ✓
- [x] `calcMrr()` frontend cohérent avec les prix backend (690/1200/150/300/149) ✓
- [x] `ADDON_CONFIG_TYPES` utilisé dans clients.ts GET / et GET/PUT configs ✓
