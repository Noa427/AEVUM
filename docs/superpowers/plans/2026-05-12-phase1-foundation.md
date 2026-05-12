# Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Monorepo fonctionnel avec auth admin, CRUD clients, dashboard stats et settings mode auto.

**Architecture:** DB comme file de messages. Backend Express/TS sur Render, Frontend Next.js 14 sur Vercel, Supabase pour auth + données. Pas de unit tests en MVP (décision projet).

**Tech Stack:** Node.js + Express + TypeScript, Next.js 14 App Router, Tailwind + shadcn/ui, Supabase (Postgres + Auth), AES-256-GCM pour chiffrement configs clients.

---

## Structure des fichiers

```
/
├── CLAUDE.md
├── .gitignore
├── package.json                          (monorepo root, scripts uniquement)
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   ├── render.yaml
│   └── src/
│       ├── index.ts                      (Express app, routes, démarrage)
│       ├── lib/
│       │   └── types.ts                  (types TypeScript partagés backend)
│       ├── services/
│       │   ├── supabase.ts               (client Supabase service role)
│       │   └── encryption.ts             (AES-256-GCM encrypt/decrypt)
│       ├── middleware/
│       │   └── auth.ts                   (vérification JWT Supabase)
│       └── routes/
│           ├── clients.ts                (GET/POST/DELETE /api/clients)
│           ├── settings.ts               (GET/PUT /api/settings)
│           └── dashboard.ts              (GET /api/dashboard — stats)
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   ├── middleware.ts                     (protection routes, refresh session)
│   ├── app/
│   │   ├── layout.tsx                    (root layout, dark mode)
│   │   ├── globals.css
│   │   ├── (auth)/
│   │   │   └── login/page.tsx            (formulaire email + password)
│   │   └── (app)/
│   │       ├── layout.tsx                (sidebar + main)
│   │       ├── dashboard/page.tsx        (3 stat cards)
│   │       ├── clients/page.tsx          (liste + modal nouveau client)
│   │       ├── tasks/page.tsx            (placeholder Phase 2)
│   │       ├── history/page.tsx          (placeholder Phase 2)
│   │       └── settings/page.tsx         (toggle mode auto + clé Anthropic)
│   ├── components/
│   │   ├── sidebar.tsx                   (navigation links)
│   │   └── client-form.tsx               (modal formulaire client)
│   └── lib/
│       ├── supabase.ts                   (browser client)
│       ├── supabase-server.ts            (server client pour Server Components)
│       └── api.ts                        (fetch wrapper avec Bearer token)
└── supabase/
    └── migrations/
        └── 001_initial_schema.sql
```

---

## Task 1: Init monorepo

**Files:**
- Create: `.gitignore`
- Create: `package.json` (root)
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/.env.example`
- Create: `backend/render.yaml`

- [ ] **Créer la structure de dossiers**

```powershell
cd "C:\Users\noapa\Documents\NOA_S_I_M\AEVUM\AEVUM_LOGI_INFOPRENEUR"
mkdir backend, frontend, supabase/migrations -Force
```

- [ ] **Créer `.gitignore` à la racine**

```
node_modules/
.env
.env.local
.next/
dist/
build/
.DS_Store
*.log
```

- [ ] **Créer `package.json` racine**

```json
{
  "name": "automatepro",
  "private": true,
  "scripts": {
    "dev:backend": "cd backend && npm run dev",
    "dev:frontend": "cd frontend && npm run dev"
  }
}
```

- [ ] **Initialiser le backend**

```powershell
cd backend
npm init -y
npm install express cors @supabase/supabase-js @anthropic-ai/sdk resend stripe
npm install -D typescript ts-node-dev @types/express @types/cors @types/node
```

- [ ] **Créer `backend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Ajouter scripts dans `backend/package.json`**

Remplacer la section `"scripts"` par :

```json
"scripts": {
  "dev": "ts-node-dev --respawn --transpile-only src/index.ts",
  "build": "tsc",
  "start": "node dist/index.js"
}
```

- [ ] **Créer `backend/.env.example`**

```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
ENCRYPTION_KEY=
ANTHROPIC_API_KEY=
STRIPE_SECRET_KEY=
FRONTEND_URL=http://localhost:3000
PORT=3001
```

- [ ] **Créer `backend/render.yaml`**

```yaml
services:
  - type: web
    name: automatepro-backend
    env: node
    buildCommand: npm install && npm run build
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
```

- [ ] **Commit**

```bash
git init
git add .
git commit -m "chore: init monorepo structure"
```

---

## Task 2: Backend — Services de base

**Files:**
- Create: `backend/src/lib/types.ts`
- Create: `backend/src/services/supabase.ts`
- Create: `backend/src/services/encryption.ts`

- [ ] **Créer `backend/src/lib/types.ts`**

```typescript
export interface Client {
  id: string
  user_id: string
  name: string
  email: string
  created_at: string
}

export interface ClientConfig {
  id: string
  client_id: string
  config_type: 'stripe_webhook_secret' | 'sender_name'
  encrypted_value: string
}

export interface PendingTask {
  id: string
  client_id: string
  task_type: 'failed_payment' | 'onboarding_j0' | 'onboarding_j3' | 'onboarding_j7'
  context_json: Record<string, unknown>
  prompt_template: string | null
  ai_response: string | null
  status: 'pending' | 'processing' | 'sent' | 'failed'
  created_at: string
  processed_at: string | null
}

export interface ActivityLog {
  id: string
  client_id: string
  action_type: string
  payload_json: Record<string, unknown>
  status: string
  created_at: string
}

export interface Settings {
  auto_mode: boolean
  has_api_key: boolean
}
```

- [ ] **Créer `backend/src/services/supabase.ts`**

```typescript
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
```

- [ ] **Créer `backend/src/services/encryption.ts`**

```typescript
import crypto from 'crypto'

const ALGO = 'aes-256-gcm'

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY!
  if (!hex || hex.length !== 64) throw new Error('ENCRYPTION_KEY doit être 32 bytes en hex (64 chars)')
  return Buffer.from(hex, 'hex')
}

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':')
}

export function decrypt(data: string): string {
  const [ivHex, tagHex, encHex] = data.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const encrypted = Buffer.from(encHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}
```

Pour générer une clé valide :
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
→ Coller la valeur dans `.env` comme `ENCRYPTION_KEY`.

- [ ] **Commit**

```bash
git add backend/src/lib backend/src/services
git commit -m "feat: backend types, supabase client, encryption service"
```

---

## Task 3: Backend — Auth middleware + Express app

**Files:**
- Create: `backend/src/middleware/auth.ts`
- Create: `backend/src/index.ts`

- [ ] **Créer `backend/src/middleware/auth.ts`**

```typescript
import { Request, Response, NextFunction } from 'express'
import { createClient } from '@supabase/supabase-js'

// Utilise anon key + JWT user pour valider les sessions frontend
const supabaseAuth = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
)

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Non authentifié' })

  const { data: { user }, error } = await supabaseAuth.auth.getUser(token)
  if (error || !user) return res.status(401).json({ error: 'Token invalide' })

  ;(req as any).userId = user.id
  next()
}
```

- [ ] **Créer `backend/src/index.ts`**

```typescript
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
```

- [ ] **Installer dotenv**

```bash
cd backend && npm install dotenv
```

- [ ] **Tester le démarrage** (créer un `.env` temporaire depuis `.env.example` avec des valeurs dummy)

```bash
cd backend
cp .env.example .env
# Remplir SUPABASE_URL=http://dummy et ENCRYPTION_KEY=0000...0000 (64 chars)
npm run dev
```

Attendu dans le terminal : `Backend démarré sur le port 3001`

Tester : `curl http://localhost:3001/health` → `{"ok":true,...}`

- [ ] **Commit**

```bash
git add backend/src/middleware backend/src/index.ts
git commit -m "feat: express app, auth middleware, health check"
```

---

## Task 4: Supabase — Migration initiale

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`

- [ ] **Créer `supabase/migrations/001_initial_schema.sql`**

```sql
create extension if not exists "uuid-ossp";

create table clients (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null,
  name text not null,
  email text not null,
  created_at timestamptz default now()
);

create table client_configs (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid references clients(id) on delete cascade not null,
  config_type text not null,
  encrypted_value text not null,
  constraint valid_config_type check (config_type in ('stripe_webhook_secret', 'sender_name'))
);

create table pending_tasks (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid references clients(id) on delete cascade not null,
  task_type text not null,
  context_json jsonb not null default '{}',
  prompt_template text,
  ai_response text,
  status text not null default 'pending',
  created_at timestamptz default now(),
  processed_at timestamptz,
  constraint valid_task_type check (task_type in ('failed_payment', 'onboarding_j0', 'onboarding_j3', 'onboarding_j7')),
  constraint valid_status check (status in ('pending', 'processing', 'sent', 'failed'))
);

create table activity_logs (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid references clients(id) on delete cascade not null,
  action_type text not null,
  payload_json jsonb default '{}',
  status text not null,
  created_at timestamptz default now()
);

create table scheduled_jobs (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid references clients(id) on delete cascade not null,
  job_type text not null,
  scheduled_for timestamptz not null,
  status text not null default 'pending',
  payload_json jsonb default '{}',
  constraint valid_job_status check (status in ('pending', 'processing', 'done', 'failed'))
);

create table settings (
  id uuid primary key default uuid_generate_v4(),
  key text unique not null,
  value text not null
);

-- Index pour les requêtes fréquentes
create index idx_pending_tasks_status on pending_tasks(status);
create index idx_pending_tasks_client on pending_tasks(client_id);
create index idx_scheduled_jobs_scheduled_for on scheduled_jobs(scheduled_for) where status = 'pending';
create index idx_activity_logs_client on activity_logs(client_id);
```

- [ ] **Appliquer la migration dans Supabase**

Dans le dashboard Supabase → SQL Editor → coller et exécuter le contenu du fichier.

Vérifier que les 6 tables apparaissent dans Table Editor.

- [ ] **Remplir les vraies valeurs dans `backend/.env`**

```
SUPABASE_URL=https://<ton-projet>.supabase.co
SUPABASE_ANON_KEY=<anon key depuis Settings > API>
SUPABASE_SERVICE_ROLE_KEY=<service role key depuis Settings > API>
ENCRYPTION_KEY=<généré à l'étape Task 2>
```

- [ ] **Commit**

```bash
git add supabase/
git commit -m "feat: supabase initial schema migration"
```

---

## Task 5: Backend — Routes clients + dashboard + settings

**Files:**
- Create: `backend/src/routes/clients.ts`
- Create: `backend/src/routes/dashboard.ts`
- Create: `backend/src/routes/settings.ts`

- [ ] **Créer `backend/src/routes/clients.ts`**

```typescript
import { Router } from 'express'
import { supabase } from '../services/supabase'
import { encrypt } from '../services/encryption'
import { requireAuth } from '../middleware/auth'

export const clientsRouter = Router()
clientsRouter.use(requireAuth)

clientsRouter.get('/', async (req, res) => {
  const userId = (req as any).userId
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

clientsRouter.post('/', async (req, res) => {
  const userId = (req as any).userId
  const { name, email, stripe_webhook_secret, sender_name } = req.body

  if (!name || !email || !stripe_webhook_secret || !sender_name) {
    return res.status(400).json({ error: 'Champs requis : name, email, stripe_webhook_secret, sender_name' })
  }

  const { data: client, error } = await supabase
    .from('clients')
    .insert({ user_id: userId, name, email })
    .select()
    .single()
  if (error) return res.status(500).json({ error: error.message })

  const { error: configError } = await supabase.from('client_configs').insert([
    { client_id: client.id, config_type: 'stripe_webhook_secret', encrypted_value: encrypt(stripe_webhook_secret) },
    { client_id: client.id, config_type: 'sender_name', encrypted_value: encrypt(sender_name) },
  ])
  if (configError) return res.status(500).json({ error: configError.message })

  res.status(201).json(client)
})

clientsRouter.delete('/:id', async (req, res) => {
  const userId = (req as any).userId
  const { error } = await supabase
    .from('clients')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', userId)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).send()
})
```

- [ ] **Créer `backend/src/routes/dashboard.ts`**

```typescript
import { Router } from 'express'
import { supabase } from '../services/supabase'
import { requireAuth } from '../middleware/auth'

export const dashboardRouter = Router()
dashboardRouter.use(requireAuth)

dashboardRouter.get('/', async (req, res) => {
  const userId = (req as any).userId

  const [clientsRes, pendingRes, sentRes] = await Promise.all([
    supabase.from('clients').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('pending_tasks').select('id', { count: 'exact', head: true })
      .in('client_id', await getClientIds(userId))
      .eq('status', 'pending'),
    supabase.from('activity_logs').select('id', { count: 'exact', head: true })
      .in('client_id', await getClientIds(userId))
      .eq('status', 'sent'),
  ])

  res.json({
    clients: clientsRes.count ?? 0,
    pending_tasks: pendingRes.count ?? 0,
    emails_sent: sentRes.count ?? 0,
  })
})

async function getClientIds(userId: string): Promise<string[]> {
  const { data } = await supabase.from('clients').select('id').eq('user_id', userId)
  return (data ?? []).map(c => c.id)
}
```

- [ ] **Créer `backend/src/routes/settings.ts`**

```typescript
import { Router } from 'express'
import { supabase } from '../services/supabase'
import { requireAuth } from '../middleware/auth'
import Anthropic from '@anthropic-ai/sdk'

export const settingsRouter = Router()
settingsRouter.use(requireAuth)

settingsRouter.get('/', async (_req, res) => {
  const { data } = await supabase.from('settings').select('*')
  const map: Record<string, string> = {}
  for (const row of data ?? []) map[row.key] = row.value
  res.json({
    auto_mode: map['auto_mode'] === 'true',
    has_api_key: !!map['anthropic_api_key'],
  })
})

settingsRouter.put('/', async (req, res) => {
  const { auto_mode, anthropic_api_key } = req.body

  if (anthropic_api_key !== undefined) {
    try {
      const client = new Anthropic({ apiKey: anthropic_api_key })
      await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      })
    } catch {
      return res.status(400).json({ error: 'Clé API Anthropic invalide' })
    }
    await supabase.from('settings').upsert({ key: 'anthropic_api_key', value: anthropic_api_key })
  }

  if (auto_mode !== undefined) {
    const currentKey = await supabase.from('settings').select('value').eq('key', 'anthropic_api_key').single()
    if (auto_mode && !currentKey.data?.value) {
      return res.status(400).json({ error: 'Impossible d\'activer le mode auto sans clé API' })
    }
    await supabase.from('settings').upsert({ key: 'auto_mode', value: String(auto_mode) })
  }

  res.json({ ok: true })
})
```

- [ ] **Tester les routes backend** (avec `.env` rempli et Supabase opérationnel)

```bash
# Démarrer le backend
cd backend && npm run dev

# Tester health
curl http://localhost:3001/health

# Tester dashboard sans auth → doit retourner 401
curl http://localhost:3001/api/dashboard
# Attendu : {"error":"Non authentifié"}
```

- [ ] **Commit**

```bash
git add backend/src/routes/
git commit -m "feat: backend routes clients, dashboard, settings"
```

---

## Task 6: Frontend — Init Next.js + shadcn

**Files:**
- Create: `frontend/` (tout le scaffolding Next.js)
- Create: `frontend/.env.example`

- [ ] **Scaffolding Next.js 14**

```powershell
cd "C:\Users\noapa\Documents\NOA_S_I_M\AEVUM\AEVUM_LOGI_INFOPRENEUR"
npx create-next-app@latest frontend --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*"
```

Répondre aux prompts : accepter les défauts.

- [ ] **Installer les dépendances frontend**

```powershell
cd frontend
npm install @supabase/supabase-js @supabase/ssr
npx shadcn@latest init
```

Répondre aux prompts shadcn : style `Default`, couleur `Zinc`, CSS variables `yes`.

- [ ] **Ajouter les composants shadcn nécessaires**

```powershell
npx shadcn@latest add button input switch badge table dialog
```

- [ ] **Créer `frontend/.env.example`**

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_API_URL=http://localhost:3001
```

- [ ] **Créer `frontend/.env.local`** depuis `.env.example` avec les vraies valeurs Supabase

- [ ] **Commit**

```bash
git add frontend/
git commit -m "feat: frontend Next.js 14 init + shadcn"
```

---

## Task 7: Frontend — Layout, Supabase client, API helper

**Files:**
- Create: `frontend/lib/supabase.ts`
- Create: `frontend/lib/supabase-server.ts`
- Create: `frontend/lib/api.ts`
- Modify: `frontend/app/layout.tsx`
- Create: `frontend/app/(app)/layout.tsx`
- Create: `frontend/components/sidebar.tsx`

- [ ] **Créer `frontend/lib/supabase.ts`**

```typescript
import { createBrowserClient } from '@supabase/ssr'

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
```

- [ ] **Créer `frontend/lib/supabase-server.ts`**

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createSupabaseServer() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (pairs) => pairs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  )
}
```

- [ ] **Créer `frontend/lib/api.ts`**

```typescript
import { supabase } from './supabase'

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

async function getToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken()
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Erreur ${res.status}`)
  }
  if (res.status === 204) return null as T
  return res.json()
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body: unknown) => apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (path: string) => apiFetch<void>(path, { method: 'DELETE' }),
}
```

- [ ] **Modifier `frontend/app/layout.tsx`**

```typescript
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = { title: 'AutomatePro' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="dark" suppressHydrationWarning>
      <body className={`${inter.className} bg-background text-foreground`}>{children}</body>
    </html>
  )
}
```

- [ ] **Créer `frontend/app/(app)/layout.tsx`**

```typescript
import { Sidebar } from '@/components/sidebar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  )
}
```

- [ ] **Créer `frontend/components/sidebar.tsx`**

```typescript
'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, Users, Clock, History, Settings, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

const links = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/clients', label: 'Clients', icon: Users },
  { href: '/tasks', label: 'Tâches en attente', icon: Clock },
  { href: '/history', label: 'Historique', icon: History },
  { href: '/settings', label: 'Paramètres', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="w-56 flex-shrink-0 border-r border-border flex flex-col">
      <div className="p-4 border-b border-border">
        <span className="font-semibold text-sm tracking-tight">AutomatePro</span>
      </div>
      <nav className="flex-1 p-2 space-y-0.5">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors',
              pathname.startsWith(href)
                ? 'bg-accent text-accent-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
            )}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="p-2 border-t border-border">
        <button
          onClick={handleLogout}
          className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 w-full transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Déconnexion
        </button>
      </div>
    </aside>
  )
}
```

- [ ] **Commit**

```bash
git add frontend/lib/ frontend/app/layout.tsx frontend/app/\(app\)/ frontend/components/sidebar.tsx
git commit -m "feat: frontend layout, sidebar, supabase + api helpers"
```

---

## Task 8: Frontend — Auth (login + middleware)

**Files:**
- Create: `frontend/app/(auth)/login/page.tsx`
- Create: `frontend/middleware.ts`

- [ ] **Créer `frontend/app/(auth)/login/page.tsx`**

```typescript
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <form onSubmit={handleLogin} className="w-full max-w-sm space-y-4 p-6">
        <div className="space-y-1 mb-6">
          <h1 className="text-xl font-semibold">AutomatePro</h1>
          <p className="text-sm text-muted-foreground">Connexion à votre espace admin</p>
        </div>
        <Input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
        <Input
          type="password"
          placeholder="Mot de passe"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Connexion...' : 'Se connecter'}
        </Button>
      </form>
    </div>
  )
}
```

- [ ] **Créer `frontend/middleware.ts`**

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (pairs) => pairs.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()
  const isLoginPage = request.nextUrl.pathname.startsWith('/login')

  if (!session && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  if (session && isLoginPage) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
}
```

- [ ] **Créer un compte admin dans Supabase**

Dans Supabase → Authentication → Users → "Add user" → renseigner email + mot de passe.

- [ ] **Tester le flow auth**

```bash
cd frontend && npm run dev
```

Ouvrir http://localhost:3000 → doit rediriger vers `/login` → se connecter → doit rediriger vers `/dashboard`.

- [ ] **Commit**

```bash
git add frontend/app/\(auth\)/ frontend/middleware.ts
git commit -m "feat: auth login page + middleware protection"
```

---

## Task 9: Frontend — Pages Dashboard, Clients, Settings

**Files:**
- Create: `frontend/app/(app)/dashboard/page.tsx`
- Create: `frontend/app/(app)/clients/page.tsx`
- Create: `frontend/components/client-form.tsx`
- Create: `frontend/app/(app)/tasks/page.tsx`
- Create: `frontend/app/(app)/history/page.tsx`
- Create: `frontend/app/(app)/settings/page.tsx`

- [ ] **Créer `frontend/app/(app)/dashboard/page.tsx`**

```typescript
'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

interface DashboardStats {
  clients: number
  pending_tasks: number
  emails_sent: number
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
        <StatCard title="Tâches en attente" value={stats?.pending_tasks} />
        <StatCard title="Emails envoyés" value={stats?.emails_sent} />
      </div>
    </div>
  )
}

function StatCard({ title, value }: { title: string; value: number | undefined }) {
  return (
    <div className="border border-border rounded-lg p-5">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="text-3xl font-semibold mt-2">
        {value === undefined ? <span className="text-muted-foreground text-xl">—</span> : value}
      </p>
    </div>
  )
}
```

- [ ] **Créer `frontend/components/client-form.tsx`**

```typescript
'use client'
import { useState } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface Props {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

export function ClientForm({ open, onClose, onCreated }: Props) {
  const [form, setForm] = useState({ name: '', email: '', stripe_webhook_secret: '', sender_name: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await api.post('/api/clients', form)
      setForm({ name: '', email: '', stripe_webhook_secret: '', sender_name: '' })
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nouveau client</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 mt-2">
          <Input placeholder="Nom du client" value={form.name} onChange={e => set('name', e.target.value)} required />
          <Input type="email" placeholder="Email de contact" value={form.email} onChange={e => set('email', e.target.value)} required />
          <Input placeholder="Nom expéditeur (ex: Formation Dupont)" value={form.sender_name} onChange={e => set('sender_name', e.target.value)} required />
          <Input
            placeholder="Stripe Webhook Secret (whsec_...)"
            value={form.stripe_webhook_secret}
            onChange={e => set('stripe_webhook_secret', e.target.value)}
            required
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Création...' : 'Créer'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Créer `frontend/app/(app)/clients/page.tsx`**

```typescript
'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { ClientForm } from '@/components/client-form'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Client } from '@/../../../backend/src/lib/types'

// Note: on duplique le type ici pour éviter les imports cross-package en MVP
interface ClientRow {
  id: string
  name: string
  email: string
  created_at: string
}

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientRow[]>([])
  const [showForm, setShowForm] = useState(false)

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Clients</h1>
        <Button onClick={() => setShowForm(true)}>+ Nouveau client</Button>
      </div>

      {clients.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun client pour l'instant.</p>
      ) : (
        <div className="border border-border rounded-lg divide-y divide-border">
          {clients.map(client => (
            <div key={client.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium">{client.name}</p>
                <p className="text-xs text-muted-foreground">{client.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">actif</Badge>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(client.id)}>
                  Supprimer
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ClientForm open={showForm} onClose={() => setShowForm(false)} onCreated={load} />
    </div>
  )
}
```

- [ ] **Créer `frontend/app/(app)/tasks/page.tsx`** (placeholder Phase 2)

```typescript
export default function TasksPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Tâches en attente</h1>
      <p className="text-sm text-muted-foreground">Disponible en Phase 2 — Pilier Récupération impayés.</p>
    </div>
  )
}
```

- [ ] **Créer `frontend/app/(app)/history/page.tsx`** (placeholder Phase 2)

```typescript
export default function HistoryPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Historique</h1>
      <p className="text-sm text-muted-foreground">Disponible en Phase 2 — Pilier Récupération impayés.</p>
    </div>
  )
}
```

- [ ] **Créer `frontend/app/(app)/settings/page.tsx`**

```typescript
'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { Settings } from '@/lib/types'

// Type local (évite import cross-package)
interface SettingsData {
  auto_mode: boolean
  has_api_key: boolean
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsData>({ auto_mode: false, has_api_key: false })
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)

  useEffect(() => {
    api.get<SettingsData>('/api/settings').then(setSettings)
  }, [])

  async function saveApiKey() {
    if (!apiKey) return
    setSaving(true)
    setMessage(null)
    try {
      await api.put('/api/settings', { anthropic_api_key: apiKey })
      setSettings(s => ({ ...s, has_api_key: true }))
      setApiKey('')
      setMessage({ text: 'Clé sauvegardée ✓', ok: true })
    } catch (err: any) {
      setMessage({ text: err.message, ok: false })
    } finally {
      setSaving(false)
    }
  }

  async function toggleAutoMode(checked: boolean) {
    try {
      await api.put('/api/settings', { auto_mode: checked })
      setSettings(s => ({ ...s, auto_mode: checked }))
    } catch (err: any) {
      setMessage({ text: err.message, ok: false })
    }
  }

  return (
    <div className="space-y-8 max-w-lg">
      <h1 className="text-2xl font-semibold">Paramètres</h1>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-medium">Clé API Anthropic</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {settings.has_api_key ? 'Une clé est déjà enregistrée.' : 'Nécessaire pour activer le mode automatique.'}
          </p>
        </div>
        <div className="flex gap-2">
          <Input
            type="password"
            placeholder={settings.has_api_key ? '••••••••••••••••' : 'sk-ant-api03-...'}
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            className="font-mono text-xs"
          />
          <Button onClick={saveApiKey} disabled={saving || !apiKey}>
            {saving ? 'Vérification...' : 'Sauvegarder'}
          </Button>
        </div>
        {message && (
          <p className={`text-sm ${message.ok ? 'text-green-500' : 'text-destructive'}`}>{message.text}</p>
        )}
      </section>

      <section className="flex items-center justify-between py-4 border-t border-border">
        <div>
          <p className="text-sm font-medium">Mode automatique</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {settings.has_api_key
              ? 'Les webhooks sont traités automatiquement via Claude API.'
              : 'Nécessite une clé API Anthropic valide.'}
          </p>
        </div>
        <Switch
          checked={settings.auto_mode}
          onCheckedChange={toggleAutoMode}
          disabled={!settings.has_api_key}
        />
      </section>
    </div>
  )
}
```

- [ ] **Rediriger la racine `/` vers `/dashboard`**

Créer `frontend/app/page.tsx` :

```typescript
import { redirect } from 'next/navigation'
export default function Home() {
  redirect('/dashboard')
}
```

- [ ] **Tester l'ensemble du flow Phase 1**

```bash
# Dans deux terminaux séparés :
cd backend && npm run dev        # port 3001
cd frontend && npm run dev       # port 3000
```

Vérifier :
- [ ] `/login` → connexion admin fonctionne
- [ ] `/dashboard` → stats affichées (0, 0, 0 au début)
- [ ] `/clients` → création d'un client fonctionne (vérifier dans Supabase Table Editor)
- [ ] `/settings` → toggle mode auto désactivé sans clé API
- [ ] Déconnexion → redirige vers `/login`

- [ ] **Commit**

```bash
git add frontend/app/\(app\)/ frontend/components/client-form.tsx
git commit -m "feat: dashboard, clients, settings, tasks/history placeholders"
```

---

## Task 10: Git remote + push final

- [ ] **Connecter au repo GitHub et pousser**

```bash
git remote add origin https://github.com/Noa427/AEVUM.git
git branch -M main
git push -u origin main
```

- [ ] **Vérifier sur GitHub** que tous les fichiers sont présents, que `.env` et `.env.local` ne sont PAS dans le repo.

- [ ] **Mettre à jour CLAUDE.md**

Dans `CLAUDE.md`, section "ÉTAT ACTUEL DU PROJET" :
```
Phase 1 — Foundation : TERMINÉE
```

Section "DERNIÈRE FEATURE TERMINÉE" :
```
Phase 1 : monorepo init, backend Express/TS, Supabase schema, 
frontend Next.js 14, auth admin, CRUD clients, dashboard stats, 
settings mode auto.
```

Section "PROCHAINE FEATURE À CODER" :
```
Phase 2 — Pilier "Récupération impayés" :
1. Endpoint webhook /api/webhooks/stripe/:clientId
2. Vérification signature Stripe
3. Logique dual mode (manuel → pending_task / auto → Claude + Resend)
4. Page /tasks avec drawer tâche manuelle
5. Endpoint preview + send
6. Page /history
7. Bouton "Simuler un événement"
```

```bash
git add CLAUDE.md
git commit -m "docs: mise à jour CLAUDE.md fin Phase 1"
git push
```

---

## Checklist de validation Phase 1

- [ ] `GET /health` → `{"ok": true}`
- [ ] Auth login/logout fonctionne
- [ ] Routes protégées → 401 sans token
- [ ] Création client → INSERT en BDD avec configs chiffrées
- [ ] Dashboard stats → retourne 3 compteurs
- [ ] Settings → toggle mode auto bloqué sans clé API
- [ ] Pas de `.env` dans git
- [ ] Code pushé sur `Noa427/AEVUM`
