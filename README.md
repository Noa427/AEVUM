# AEVUM

Outil SaaS pour formateurs en ligne : automatise les emails de relance impayés et d'onboarding via Stripe webhooks + Claude AI + Resend.

## Stack

- **Backend** : Node.js / Express / TypeScript → déployé sur Render
- **Frontend** : Next.js 14 / TypeScript / Tailwind / shadcn → déployé sur Vercel
- **Base de données** : Supabase (PostgreSQL)
- **Email** : Resend
- **IA** : Anthropic Claude (optionnel — mode manuel disponible sans clé)
- **Paiements** : Stripe Webhooks

## Interface utilisateur

### Design system

- **Police** : Inter (Google Fonts)
- **Thème** : dark/light/système via `next-themes`
- **Couleurs accent** : tokens HSL définis dans `globals.css` (primary, accent, muted…)
- **Inspiration** : Linear, Vercel, Notion — minimaliste, sobre, professionnel

### Composants shadcn/ui utilisés

| Composant | Usage |
|-----------|-------|
| `Button` | Boutons d'action partout, variantes default/outline/ghost |
| `Badge` | Statuts et types de tâches (remplacés par classes CSS custom) |
| `Dialog` / `DialogContent` / `DialogHeader` / `DialogTitle` | Modals clients, webhook, tâches, historique |
| `Input` | Formulaires client, clé API |
| `Switch` | Toggle mode automatique (Settings) |
| `Table` | (disponible, non utilisé en production) |

### Dépendances UI ajoutées

| Package | Usage |
|---------|-------|
| `sonner` | Toasts (succès vert, erreur rouge, info bleu) — position bottom-right |
| `lucide-react` | Icônes (déjà présent) : `Zap`, `LayoutDashboard`, `Users`, `Clock`, `History`, `Settings`, `LogOut`, `Menu`, `X`, `ArrowRight`, `TrendingUp`, `Activity`, `Mail`, `Users` |

### Fichiers modifiés (UI uniquement)

**Phase 1 — Sidebar + Dashboard**
- `frontend/app/globals.css` — design tokens, animations, skeleton, badges, sidebar
- `frontend/components/sidebar.tsx` — logo, barre active, avatar, responsive mobile
- `frontend/app/(app)/layout.tsx` — hamburger menu mobile, header sticky
- `frontend/app/(app)/dashboard/page.tsx` — StatCards avec icônes, skeleton, empty state, badges custom

**Phase 2 — Clients + Tâches + TaskDrawer**
- `frontend/app/(app)/clients/page.tsx` — avatars initiales, empty state CTA, badges colorés, icônes actions
- `frontend/app/(app)/tasks/page.tsx` — badges task_type colorés, date relative, empty state, pastilles dot
- `frontend/components/task-drawer.tsx` — header sticky, section Contexte grid, bouton Copier feedback, spinner, état done

**Phase 3 — Historique + Paramètres**
- `frontend/app/(app)/history/page.tsx` — filtres stylisés, lignes alternées, pagination avec numéros, modal détails grid
- `frontend/app/(app)/settings/page.tsx` — sections cards, eye-toggle clé API, spinners, badge validité, section À propos

**Phase 4 — Finitions globales**
- `frontend/app/layout.tsx` — `<Toaster>` sonner avec `richColors`
- `frontend/components/ui/skeleton.tsx` — composants `<Skeleton>`, `<SkeletonText>`, `<SkeletonStatCard>`, `<SkeletonList>`, `<SkeletonListRow>`

### Utiliser les toasts sonner

```tsx
import { toast } from 'sonner'

// Succès
toast.success('Client créé avec succès')

// Erreur
toast.error('Une erreur est survenue')

// Info
toast.info('Rafraîchissement en cours...')

// Promise
toast.promise(apiCall(), {
  loading: 'Envoi en cours...',
  success: 'Email envoyé !',
  error: 'Échec de l\'envoi',
})
```

### Utiliser les Skeletons

```tsx
import { SkeletonList, SkeletonStatCard } from '@/components/ui/skeleton'

// Pendant le chargement d'une liste
{loading ? <SkeletonList rows={5} /> : <MaListe />}

// Pendant le chargement d'une stat card
{loading ? <SkeletonStatCard /> : <StatCard value={42} />}
```

---

## Installation locale

```bash
# Cloner le repo
git clone https://github.com/Noa427/AEVUM.git
cd AEVUM

# Backend
cd backend
cp .env.example .env
npm install
npm run dev

# Frontend (nouveau terminal)
cd ../frontend
cp .env.example .env.local
npm install
npm run dev
```

Frontend : http://localhost:3000  
Backend : http://localhost:3001

## Variables d'environnement

### Backend (`backend/.env`)

| Variable | Obligatoire | Description |
|----------|-------------|-------------|
| `SUPABASE_URL` | ✓ | URL du projet Supabase |
| `SUPABASE_ANON_KEY` | ✓ | Clé anon Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | ✓ | Clé service role Supabase (accès admin) |
| `RESEND_API_KEY` | ✓ | Clé API Resend |
| `RESEND_FROM_EMAIL` | ✓ | Adresse email expéditeur complète (ex: `noreply@tondomaine.com`) |
| `ENCRYPTION_KEY` | ✓ | Clé AES-256 pour chiffrement configs clients (32 chars hex) |
| `ADMIN_SECRET` | ✓ | Secret pour les routes admin (requireAuth) |
| `JWT_SECRET` | ✓ | Secret JWT portail client (partager avec la Vitrine) |
| `FRONTEND_URL` | ✓ | URL du frontend admin pour CORS |
| `VITRINE_URL` | ✓ | URL de la Vitrine Astro (CORS portail + lien email credentials) |
| `STRIPE_SECRET_KEY` | — | Clé secrète Stripe (si vérification côté SDK) |
| `ANTHROPIC_API_KEY` | — | Si absent, clé lue depuis la table settings Supabase |
| `ENABLE_CRON` | — | `true` pour activer le cron au démarrage (Render : définir aussi en env var) |
| `PORT` | — | Port Express (défaut : 3001) |

### Vitrine Astro (`AEVUM/Vitrine/.env`)

| Variable | Description |
|----------|-------------|
| `AEVUM_URL` | URL du backend (ex: `https://backend.onrender.com` en prod, `http://localhost:3001` en dev) |
| `JWT_SECRET` | Même valeur que le backend |

### Frontend admin (`frontend/.env.local`)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé anon Supabase |
| `NEXT_PUBLIC_API_URL` | URL du backend (ex: `https://aevum-backend.onrender.com`) |

## Commandes backend

```bash
cd backend
npm run dev          # tsx watch — rechargement à chaud
npm run build        # tsc → dist/
npm run start        # node dist/index.js (prod)
npm run seed:test    # insérer un client de test + envoyer ses credentials par email
```

## Déploiement

### Backend sur Render

1. Créer un **Web Service** pointant sur `/backend`
   - Build : `npm install && npm run build`
   - Start : `npm start`
   - Ajouter toutes les variables d'environnement backend

2. Créer un **Cron Job** pointant sur `/backend`
   - Schedule : `0 * * * *` (toutes les heures)
   - Command : `node -e "const { runScheduledJobs } = require('./dist/cron'); runScheduledJobs().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })"`
   - Ajouter : `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ENCRYPTION_KEY`

### Frontend sur Vercel

1. Importer le repo, sélectionner `/frontend` comme root directory
2. Ajouter les variables d'environnement frontend
3. Deploy

### Stripe Webhooks

Pour chaque client, récupérer l'URL webhook dans l'interface (/clients → Webhook) :

```
https://<backend-url>/api/webhooks/<client_id>
```

Événements à activer dans Stripe :
- `invoice.payment_failed`
- `checkout.session.completed`

### Supabase

Appliquer les migrations du dossier `/supabase/migrations` via le dashboard Supabase ou la CLI :

```bash
supabase db push
```

## Flux de traitement

```
Stripe event → POST /api/webhooks/:clientId
  → vérification signature (webhook_secret du client)
  → mode manuel : INSERT pending_task (status=pending)
  → mode auto : Claude API → Resend → activity_log

Admin → /tasks → TaskDrawer
  → copier le prompt → coller dans Claude → coller la réponse
  → Aperçu → Envoyer → activity_log

Cron horaire → scheduled_jobs (J+3, J+7 onboarding)
  → crée pending_tasks correspondantes
```
