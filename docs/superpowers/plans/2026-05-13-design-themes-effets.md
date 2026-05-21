# Design — Thèmes & Effets visuels — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter deux thèmes (crème clair + charbon sombre) avec toggle dans Settings, et des effets visuels forts (glassmorphism sidebar, card-elevated, list-row hover, gradient h1 dark).

**Architecture:** `next-themes` gère la persistance et le toggle (localStorage, SSR-safe). Les tokens CSS dans `globals.css` définissent les deux palettes. Les effets sont des classes CSS custom appliquées via `className` dans les composants — aucune dépendance lourde.

**Tech Stack:** Next.js 14, next-themes, Tailwind 4, CSS custom properties.

---

## File Map

| Fichier | Changement |
|---|---|
| `frontend/package.json` | Ajouter `next-themes` |
| `frontend/app/globals.css` | Remplacer tokens + ajouter classes d'effets |
| `frontend/app/layout.tsx` | ThemeProvider, supprimer `className="dark"` |
| `frontend/components/sidebar.tsx` | Glassmorphism + glow actif |
| `frontend/app/(app)/settings/page.tsx` | Section toggle thème |
| `frontend/app/(app)/dashboard/page.tsx` | `card-elevated` sur StatCard |
| `frontend/app/(app)/clients/page.tsx` | `list-row` sur les lignes |
| `frontend/app/(app)/tasks/page.tsx` | `list-row` sur les lignes |
| `frontend/app/(app)/history/page.tsx` | `list-row` sur les lignes |

---

### Task 1: Installation next-themes + ThemeProvider

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/app/layout.tsx`

- [ ] **Step 1: Installer next-themes**

```bash
cd frontend && npm install next-themes
```
Attendu : `next-themes` apparaît dans `node_modules/`

- [ ] **Step 2: Modifier layout.tsx**

Remplacer le contenu entier de `frontend/app/layout.tsx` par :

```tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ThemeProvider } from 'next-themes'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = { title: 'AEVUM' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
```

Points clés :
- `suppressHydrationWarning` sur `<html>` : évite l'erreur d'hydration Next.js quand next-themes injecte `class="dark"` côté client
- `attribute="class"` : next-themes ajoute/retire `.dark` sur `<html>` — compatible avec Tailwind
- `defaultTheme="system"` : respecte la préférence OS par défaut
- Plus de `className="dark"` hardcodé

- [ ] **Step 3: Vérifier que le frontend compile**

```bash
cd frontend && npm run build 2>&1 | tail -20
```
Attendu : `✓ Compiled successfully` ou `Route (app)` sans erreur TypeScript

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/app/layout.tsx
git commit -m "feat: next-themes ThemeProvider (dark/light/system)"
```

---

### Task 2: globals.css — Tokens des deux thèmes + classes d'effets

**Files:**
- Modify: `frontend/app/globals.css`

- [ ] **Step 1: Remplacer globals.css entier**

```css
@import "tailwindcss";

@layer base {
  :root {
    --background: 42 30% 96%;
    --foreground: 25 20% 15%;
    --card: 40 25% 98%;
    --card-foreground: 25 20% 15%;
    --popover: 40 25% 98%;
    --popover-foreground: 25 20% 15%;
    --primary: 25 40% 30%;
    --primary-foreground: 40 30% 96%;
    --secondary: 35 25% 90%;
    --secondary-foreground: 25 20% 15%;
    --muted: 35 25% 90%;
    --muted-foreground: 25 15% 45%;
    --accent: 35 50% 88%;
    --accent-foreground: 25 20% 15%;
    --destructive: 0 84% 60%;
    --destructive-foreground: 0 0% 98%;
    --border: 35 20% 85%;
    --input: 35 20% 85%;
    --ring: 25 40% 30%;
    --radius: 0.6rem;
  }

  .dark {
    --background: 25 15% 10%;
    --foreground: 35 15% 90%;
    --card: 25 12% 14%;
    --card-foreground: 35 15% 90%;
    --popover: 25 12% 14%;
    --popover-foreground: 35 15% 90%;
    --primary: 35 80% 65%;
    --primary-foreground: 25 15% 10%;
    --secondary: 25 15% 18%;
    --secondary-foreground: 35 15% 90%;
    --muted: 25 15% 18%;
    --muted-foreground: 35 10% 60%;
    --accent: 25 20% 20%;
    --accent-foreground: 35 15% 90%;
    --destructive: 0 62% 50%;
    --destructive-foreground: 0 0% 98%;
    --border: 25 15% 22%;
    --input: 25 15% 22%;
    --ring: 35 80% 65%;
    --radius: 0.6rem;
  }
}

@layer base {
  * {
    border-color: hsl(var(--border));
  }

  body {
    background-color: hsl(var(--background));
    color: hsl(var(--foreground));
    font-family: Inter, Arial, Helvetica, sans-serif;
    min-height: 100vh;
    background-image: radial-gradient(
      ellipse 80% 50% at 10% 0%,
      hsl(var(--accent) / 0.4) 0%,
      transparent 70%
    );
  }

  .dark h1 {
    background: linear-gradient(135deg, hsl(35 15% 90%) 0%, hsl(35 60% 70%) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
}

@layer components {
  /* Sidebar : glassmorphism */
  .sidebar-glass {
    background: hsl(var(--card) / 0.75);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-right: 1px solid hsl(var(--border) / 0.6);
    box-shadow: 4px 0 24px hsl(var(--foreground) / 0.06);
  }

  /* Sidebar : lien actif avec glow */
  .sidebar-link-active {
    background: hsl(var(--accent));
    box-shadow:
      inset 0 0 12px hsl(var(--primary) / 0.12),
      0 0 10px hsl(var(--primary) / 0.18);
    color: hsl(var(--primary));
    font-weight: 500;
  }

  /* Cards avec relief */
  .card-elevated {
    box-shadow:
      0 1px 2px hsl(var(--foreground) / 0.04),
      0 4px 12px hsl(var(--foreground) / 0.08),
      0 0 0 1px hsl(var(--border));
    transition: box-shadow 150ms ease, transform 150ms ease;
    border: none;
  }

  .card-elevated:hover {
    transform: translateY(-2px);
    box-shadow:
      0 2px 4px hsl(var(--foreground) / 0.06),
      0 8px 24px hsl(var(--foreground) / 0.13),
      0 0 0 1px hsl(var(--border));
  }

  /* Rows de liste avec élévation au hover */
  .list-row {
    transition: transform 150ms ease, box-shadow 150ms ease;
    position: relative;
  }

  .list-row:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 16px hsl(var(--foreground) / 0.09);
    z-index: 1;
  }

  /* Bouton primaire avec glow */
  .btn-glow {
    transition: box-shadow 150ms ease, transform 150ms ease;
  }

  .btn-glow:hover {
    box-shadow: 0 0 18px hsl(var(--primary) / 0.45);
    transform: translateY(-1px);
  }
}
```

- [ ] **Step 2: Vérifier visuellement en dev**

```bash
cd frontend && npm run dev
```
Ouvrir `http://localhost:3000`. Le fond doit avoir une légère teinte crème (thème système = light sur la plupart des OS le jour). En dark mode OS, fond charbon.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/globals.css
git commit -m "feat: tokens crème/charbon + classes effets visuels (glass, elevated, list-row)"
```

---

### Task 3: Sidebar — glassmorphism + glow lien actif

**Files:**
- Modify: `frontend/components/sidebar.tsx`

- [ ] **Step 1: Remplacer le contenu de sidebar.tsx**

```tsx
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
    <aside className="w-56 flex-shrink-0 flex flex-col sidebar-glass">
      <div className="p-4 border-b border-border/60">
        <span className="font-semibold text-sm tracking-tight text-primary">AEVUM</span>
      </div>
      <nav className="flex-1 p-2 space-y-0.5">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-all duration-150',
              pathname.startsWith(href)
                ? 'sidebar-link-active'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'
            )}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="p-2 border-t border-border/60">
        <button
          onClick={handleLogout}
          className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent/60 w-full transition-all duration-150"
        >
          <LogOut className="w-4 h-4" />
          Déconnexion
        </button>
      </div>
    </aside>
  )
}
```

Changements clés :
- `aside` : suppression `border-r border-border`, ajout classe `sidebar-glass`
- `border-b` et `border-t` : opacité réduite (`/60`) pour la cohérence avec le glassmorphism
- Lien actif : `sidebar-link-active` remplace `bg-accent text-accent-foreground font-medium`
- Hover links : `hover:bg-accent/60` et `transition-all duration-150`
- Logo AEVUM : couleur `text-primary` (ambre en dark, brun en light)

- [ ] **Step 2: Vérifier visuellement**

Naviguer entre les pages — le lien actif doit avoir un glow subtil, la sidebar un fond légèrement transparent/flou.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/sidebar.tsx
git commit -m "feat: sidebar glassmorphism + glow lien actif"
```

---

### Task 4: Settings — Toggle thème

**Files:**
- Modify: `frontend/app/(app)/settings/page.tsx`

- [ ] **Step 1: Remplacer le contenu de settings/page.tsx**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { api } from '@/lib/api'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface SettingsData {
  auto_mode: boolean
  has_api_key: boolean
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsData>({ auto_mode: false, has_api_key: false })
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const { theme, setTheme } = useTheme()

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
          <Button onClick={saveApiKey} disabled={saving || !apiKey} className="btn-glow">
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

      <section className="py-4 border-t border-border space-y-3">
        <div>
          <p className="text-sm font-medium">Thème</p>
          <p className="text-xs text-muted-foreground mt-0.5">Clair, Sombre, ou selon les préférences système.</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={theme === 'light' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTheme('light')}
          >
            Clair
          </Button>
          <Button
            variant={theme === 'dark' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTheme('dark')}
          >
            Sombre
          </Button>
          <Button
            variant={theme === 'system' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTheme('system')}
          >
            Automatique
          </Button>
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Tester le toggle**

Aller sur `/settings`, cliquer "Clair" puis "Sombre" — le thème doit changer instantanément. Recharger la page — le choix doit persister.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/(app)/settings/page.tsx
git commit -m "feat: toggle thème (clair/sombre/auto) dans Settings"
```

---

### Task 5: Dashboard — card-elevated sur StatCard

**Files:**
- Modify: `frontend/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Modifier StatCard**

Changer uniquement la div wrapper de StatCard — de :
```tsx
<div className="border border-border rounded-lg p-5">
```
à :
```tsx
<div className="rounded-lg p-5 card-elevated">
```

Le fichier complet après modification :

```tsx
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
    <div className="rounded-lg p-5 card-elevated">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="text-3xl font-semibold mt-2">
        {value === undefined ? <span className="text-muted-foreground text-xl">—</span> : value}
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Vérifier visuellement**

Le dashboard doit montrer 3 cards avec ombre multicouche et élévation au hover.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/(app)/dashboard/page.tsx
git commit -m "feat: card-elevated sur StatCard dashboard"
```

---

### Task 6: list-row sur les pages liste (clients, tasks, history)

**Files:**
- Modify: `frontend/app/(app)/clients/page.tsx`
- Modify: `frontend/app/(app)/tasks/page.tsx`
- Modify: `frontend/app/(app)/history/page.tsx`

- [ ] **Step 1: clients/page.tsx — ajouter list-row**

Dans la div de chaque client, ajouter `list-row` :

```tsx
<div key={client.id} className="flex items-center justify-between px-4 py-3 list-row">
```

Le fichier complet :

```tsx
'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { ClientForm } from '@/components/client-form'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

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

- [ ] **Step 2: tasks/page.tsx — ajouter list-row**

Changer la div de chaque task (celle avec `cursor-pointer hover:bg-accent/30`) :

```tsx
<div
  key={task.id}
  className="flex items-center justify-between px-4 py-3 cursor-pointer list-row"
  onClick={() => setSelectedTask(task)}
>
```

Le fichier complet :

```tsx
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

- [ ] **Step 3: history/page.tsx — ajouter list-row**

Changer la div de chaque log :

```tsx
<div key={log.id} className="flex items-center justify-between px-4 py-3 list-row">
```

Le fichier complet :

```tsx
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

- [ ] **Step 4: Vérifier visuellement**

Naviguer sur `/clients`, `/tasks`, `/history` — les lignes doivent s'élever légèrement au hover.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/(app)/clients/page.tsx frontend/app/(app)/tasks/page.tsx frontend/app/(app)/history/page.tsx
git commit -m "feat: list-row hover elevation sur clients, tasks, history"
```

---

## Vérification end-to-end

Après les 6 tâches :

1. Démarrer le frontend : `cd frontend && npm run dev`
2. Aller sur `/settings` → tester les 3 boutons de thème (Clair / Sombre / Automatique)
3. Recharger la page — le thème doit persister
4. En mode Sombre : les h1 doivent avoir un gradient texte ambre
5. En mode Clair : fond crème avec teinte sable
6. Sidebar : fond légèrement translucide avec blur, lien actif avec glow
7. Dashboard : cards avec ombre multicouche, élévation au hover
8. `/clients`, `/tasks`, `/history` : lignes avec élévation au hover
