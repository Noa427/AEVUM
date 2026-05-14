# AutomatePro — AEVUM

Outil SaaS pour formateurs en ligne : automatise les emails de relance impayés et d'onboarding via Stripe webhooks + Claude AI + Resend.

## Stack

- **Backend** : Node.js / Express / TypeScript → déployé sur Render
- **Frontend** : Next.js 16 / TypeScript / Tailwind / shadcn → déployé sur Vercel
- **Base de données** : Supabase (PostgreSQL)
- **Email** : Resend
- **IA** : Anthropic Claude (optionnel — mode manuel disponible sans clé)
- **Paiements** : Stripe Webhooks

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

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | URL du projet Supabase |
| `SUPABASE_ANON_KEY` | Clé anon Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service role Supabase (accès admin) |
| `RESEND_API_KEY` | Clé API Resend |
| `RESEND_FROM_DOMAIN` | Adresse email expéditeur (ex: `contact@mondomaine.fr`) |
| `ENCRYPTION_KEY` | Clé AES-256 pour chiffrement configs clients (32 chars hex) |
| `STRIPE_SECRET_KEY` | Clé secrète Stripe (`sk_live_...` ou `sk_test_...`) |
| `FRONTEND_URL` | URL du frontend pour CORS (ex: `https://monapp.vercel.app`) |
| `PORT` | Port du serveur (défaut: 3001) |
| `ENABLE_CRON` | `true` pour activer le cron interne (sinon utiliser le cron Render) |

### Frontend (`frontend/.env.local`)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé anon Supabase |
| `NEXT_PUBLIC_API_URL` | URL du backend (ex: `https://automatepro-backend.onrender.com`) |

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
https://<backend-url>/api/webhooks/stripe/<client_id>
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
Stripe event → POST /api/webhooks/stripe/:clientId
  → vérification signature (webhook_secret du client)
  → mode manuel : INSERT pending_task (status=pending)
  → mode auto : Claude API → Resend → activity_log

Admin → /tasks → TaskDrawer
  → copier le prompt → coller dans Claude → coller la réponse
  → Aperçu → Envoyer → activity_log

Cron horaire → scheduled_jobs (J+3, J+7 onboarding)
  → crée pending_tasks correspondantes
```
