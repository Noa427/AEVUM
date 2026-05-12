# AUTOMATEPRO — Design Spec
*2026-05-12*

## Contexte

SaaS d'automatisation IA pour infopreneurs francophones. L'admin (utilisateur unique en MVP) gère N clients (infopreneurs). Pour chaque client, l'app intercepte des événements Stripe et génère des emails de relance ou d'onboarding — manuellement (via Claude.ai) ou automatiquement (via Claude API).

## Architecture

**Approche retenue :** DB comme file de messages. Le webhook répond 200 immédiatement après INSERT dans `pending_tasks`. Le traitement (manuel ou auto) est découplé.

```
Vercel (Next.js 14)  ←→  Render (Express/TS)  ←→  Supabase (Postgres)
                                  ↕
                    Stripe webhooks / Resend / Claude API (optionnel)
```

## Stack

- Backend : Node.js + Express + TypeScript (Render)
- Frontend : Next.js 14 App Router + TypeScript + Tailwind + shadcn/ui (Vercel)
- DB : Supabase (Postgres + Auth)
- Email : Resend (FROM domaine admin, sender name personnalisé par client)
- Paiements : Stripe webhooks
- IA : Claude API (optionnel — mode auto désactivé si pas de clé)

## Modes de fonctionnement

**Mode manuel (défaut) :** webhook → pending_task créée → dashboard affiche contexte + prompt copier-coller → admin colle réponse Claude.ai → aperçu → envoi.

**Mode automatique (optionnel) :** webhook → Claude API appelée → email généré → envoi. Activable dans /settings si `ANTHROPIC_API_KEY` est renseignée.

## Schéma BDD

Toutes les tables ont `user_id uuid` pour multi-tenant readiness.

**clients** — id, user_id, name, email, created_at  
**client_configs** — id, client_id, config_type (`stripe_webhook_secret` | `sender_name`), encrypted_value (AES-256)  
**pending_tasks** — id, client_id, task_type, context_json, prompt_template, ai_response, status (`pending`→`processing`→`sent`|`failed`), created_at, processed_at  
**activity_logs** — id, client_id, action_type, payload_json, status, created_at  
**scheduled_jobs** — id, client_id, job_type, scheduled_for, status, payload_json  
**settings** — id, key, value

**task_type values :** `failed_payment` | `onboarding_j0` | `onboarding_j3` | `onboarding_j7`

## API Endpoints (backend)

| Méthode | Route | Rôle |
|---|---|---|
| POST | `/api/webhooks/stripe/:clientId` | Reçoit webhook Stripe, vérifie signature, INSERT pending_task |
| POST | `/api/simulate` | Crée fausse tâche pour test (admin only) |
| GET/POST/DELETE | `/api/clients` | CRUD clients |
| GET/POST | `/api/clients/:id/configs` | Configs chiffrées par client |
| GET | `/api/tasks` | Liste tâches filtrées par status |
| POST | `/api/tasks/:id/preview` | Génère aperçu email (Claude API ou template statique) |
| POST | `/api/tasks/:id/send` | Envoie email via Resend, log dans activity_logs |
| GET | `/api/history` | Historique activity_logs |
| GET/PUT | `/api/settings` | Mode auto toggle + clé Anthropic |

## Frontend Pages

| Route | Contenu |
|---|---|
| `/login` | Auth Supabase |
| `/dashboard` | Stats : tâches en attente, emails envoyés, clients actifs |
| `/clients` | Liste + formulaire modal nouveau client |
| `/tasks` | Liste pending — drawer par tâche (voir UX ci-dessous) |
| `/history` | Tableau logs |
| `/settings` | Toggle mode auto + champ clé Anthropic |

**UX drawer tâche manuelle :**
1. Contexte (client, événement, montant)
2. Prompt pré-rempli + bouton "Copier"
3. Champ "Coller la réponse Claude"
4. Bouton "Aperçu" → email formaté
5. Bouton "Envoyer" → statut sent ✓

## Prompt Templates (MVP — fixes)

Un template par task_type. Variables injectées depuis context_json :
- `{{client_name}}`, `{{student_name}}`, `{{amount}}`, `{{product_name}}`, `{{payment_link}}`

## Scheduled Jobs (Phase 3)

Cron Render toutes les heures. Scanne `scheduled_jobs` où `scheduled_for <= now()` et `status = pending`. Pour chaque job : génère tâche onboarding J+3 ou J+7 → même pipeline que task normale.

## Config client (MVP)

Formulaire minimal : nom + email. Configs chiffrées : `stripe_webhook_secret` + `sender_name`.

## Variables d'environnement

Backend : `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `ENCRYPTION_KEY`, `ANTHROPIC_API_KEY` (optionnel), `STRIPE_*` (par client en DB)

Frontend : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL`

## Roadmap MVP

1. Foundation : monorepo + auth + CRUD clients + dashboard + settings
2. Pilier "Impayés" : webhook Stripe + tâches manuelles + envoi email
3. Pilier "Onboarding" : checkout webhook + emails J0/J3/J7
4. Pilier "Support IA" : à spécifier
5. Mode automatique : activer Claude API end-to-end

## Décisions reportées

- Multi-tenant (logins infopreneurs) : architecture prête, non implémenté
- Prompt templates éditables par client : prévu Phase 2+
- Email FROM par domaine client : migration Resend prévue après MVP
