# AUTOMATEPRO — Mémoire projet

## DÉCISIONS ARCHITECTURALES ACTÉES
*(Ne pas modifier sans accord explicite)*

- Stack : Node.js/Express/TS (Render) + Next.js 14/TS/Tailwind/shadcn (Vercel) + Supabase + Resend + Stripe
- Vitrine : Astro 6 / output:static + @astrojs/vercel, sur AEVUM/Vitrine/
- Architecture : DB comme file de messages (pending_tasks), webhook répond 200 immédiatement
- Auth admin : Supabase Auth (JWT Bearer), unique en MVP, multi-tenant ready (user_id sur chaque table)
- Auth client : argon2id + JWT 7j (JWT_SECRET partagé backend/Vitrine)
- Mode IA : Manuel par défaut, automatique optionnel par client (auto_mode)
- Email FROM : domaine admin + sender_name personnalisé par client (chiffré AES-256)
- Scheduled jobs : Cron Render scan horaire sur scheduled_jobs + custom_automations
- Validation tâche admin : prévisualisation obligatoire → envoi en 2 clics
- Monorepo : /backend + /frontend + /supabase + CLAUDE.md à la racine

## RÈGLES D'INTERACTION
*(Ne pas modifier sans accord explicite)*

- Réponses condensées, directes, pas de préambule ni récap
- Commentaires code uniquement sur logique non-triviale
- Pas de fichiers de doc supplémentaires sauf demande
- Ne jamais afficher un fichier >100 lignes — annoncer création + nb lignes
- Ne jamais afficher tsconfig/package.json/gitignore après création
- Valider groupé, pas micro-décision par micro-décision
- Français uniquement, pas d'emojis sauf ✓ ✗
- Mode production direct : code final propre dès le premier jet
- Enchaîner plusieurs fichiers sans redemander validation entre chaque

## RÈGLES POUR ÉCONOMISER LES TOKENS

- Lire CLAUDE.md en début de session avant toute action
- Lire le code existant avant d'en écrire du nouveau
- Réutiliser les patterns existants (rate limiters, validate(), supabase patterns, wrapEmailHtml)
- Modifier par diff ciblé — pas de réécriture de fichiers entiers
- Pas de récap inutile, pas de préambule décoratif
- Un commit par feature/fix, message clair
- Demander avant de supprimer du code (règle absolue)
- Ne pas relire un fichier déjà lu dans la même session

## ÉTAT ACTUEL DU PROJET

- Phase 1 — Foundation : TERMINÉE
- Phase 2 — Logique métier complète : TERMINÉE
- Phase 3 — Auth client + portail Vitrine : backend TERMINÉ, pages Vitrine EN COURS
- Audit 2026-05-28 : URL webhook corrigée, code mort supprimé (portal.ts, supabase-server.ts, stubs history/tasks)

## STRUCTURE DES FICHIERS

```
backend/src/
  index.ts                  — point d'entrée, montage routes, cron
  cron.ts                   — jobs horaires (scheduled_jobs, custom_automations, testimonials)
  routes/
    clients.ts              — CRUD clients + configs piliers (admin)
    dashboard.ts            — stats globales (admin)
    history.ts              — logs paginés (admin)
    tasks.ts                — preview + send tâches (admin)
    simulate.ts             — simulation événements Stripe (admin)
    settings.ts             — clé API Anthropic (admin)
    support.ts              — email entrant → classify → réponse IA (admin)
    webhooks.ts             — Stripe events → pending_tasks
    tracking.ts             — /track/open + /track/click (public)
    clientAuth.ts           — tout le portail client (/client/*)
  services/
    supabase.ts             — client Supabase service role
    encryption.ts           — AES-256 encrypt/decrypt
    resend.ts               — sendEmail()
    claude.ts               — callClaude() + callClaudeChat()
    templates.ts            — prompts IA + parseClaudeResponse + wrapEmailHtml
  middleware/
    auth.ts                 — requireAuth (Supabase JWT admin)
    authenticateClient.ts   — JWT client → req.clientId + req.clientEmail
    rate-limit.ts           — webhookLimiter, apiLimiter, loginLimiter, aiLimiter…
    stripe-sig.ts           — vérification signature Stripe
    error-handler.ts        — handler global Express
    validate.ts             — middleware Zod
    admin-access-log.ts     — log chaque requête admin dans activity_logs
  utils/
    generateClientCredentials.ts — génère mdp, hash argon2id, envoie email Resend
    getEmailTemplate.ts     — cherche config DB puis fallback defaults
    tracking.ts             — insertTrackingRow + injectTracking (pixel + lien)
  schemas/
    client.ts               — schémas Zod + ALLOWED_CONFIG_TYPES (19 types)

frontend/
  app/
    page.tsx                — redirect → /dashboard
    (auth)/login/           — page de connexion admin (Supabase Auth)
    (app)/layout.tsx        — layout avec sidebar
    (app)/dashboard/        — stats globales + activité récente
    (app)/clients/          — liste clients
    (app)/clients/[id]/     — détail client (tâches / historique / paramètres)
    (app)/settings/         — clé API Anthropic + thème
  components/
    sidebar.tsx             — navigation + logout
    client-form.tsx         — modale création/édition client
    task-drawer.tsx         — drawer preview + envoi tâche
    simulate-modal.tsx      — simulation événement Stripe
    ui/                     — button, input, dialog, badge, table, skeleton, switch
  lib/
    api.ts                  — apiFetch avec Bearer token Supabase
    supabase.ts             — createBrowserClient (auth admin)
    utils.ts                — cn()
```

## VARIABLES D'ENV CRITIQUES

Backend (.env) :
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`
- `ENCRYPTION_KEY` — AES-256 (32 bytes hex)
- `JWT_SECRET` — partagé avec Vitrine
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- `STRIPE_SECRET_KEY`
- `FRONTEND_URL`, `VITRINE_URL`, `BACKEND_URL`
- `ANTHROPIC_API_KEY` — optionnel (mode auto)
- `ENABLE_CRON=true` — activer le cron sur Render

Vitrine (.env) :
- `AEVUM_URL` — URL Render du backend
- `JWT_SECRET` — même valeur que backend

## ROUTES BACKEND

### Admin (requireAuth + adminCors + apiLimiter)
- GET/POST  /api/clients                   → liste / créer client + credentials
- GET/PUT/DELETE /api/clients/:id          → détail / modifier / supprimer
- GET/PUT   /api/clients/:id/configs       → configs piliers (support, upsell…)
- GET       /api/tasks                     → tâches paginées (?status&client_id&page&limit)
- POST      /api/tasks/:id/preview         → génère ou utilise ai_response pré-peuplé
- POST      /api/tasks/:id/send            → valide + envoie email
- GET       /api/dashboard                 → stats globales (clients, pending, emails du mois)
- GET       /api/history                   → logs paginés (?client_id&date_from&date_to&limit&offset)
- POST      /api/simulate                  → tâche test (failed_payment | checkout_completed)
- GET/PUT   /api/settings                  → clé API Anthropic
- POST      /api/support/inbound           → email entrant → classify → réponse IA

### Webhook Stripe
- POST      /api/webhooks/:clientId        → checkout.completed | payment_intent.failed | invoice.failed | checkout.expired

### Tracking (public, sans auth)
- GET       /track/open/:trackingId        → pixel ouverture email
- GET       /track/click/:trackingId       → redirect lien + log click

### Portail client (portalCors + JWT authenticateClient)
- POST      /client/login                  → argon2id → JWT 7j (loginLimiter 5/15min)
- POST      /client/forgot-password        → envoi email reset (forgotPasswordLimiter 3/15min)
- POST      /client/reset-password         → nouveau mdp via token JWT 1h
- GET       /client/me                     → email + mustChangePassword + pausedUntil
- PUT       /client/settings/password      → changer mdp
- PUT       /client/settings/email         → changer email (vérifie currentPassword)
- GET       /client/automations            → piliers actifs + senderName
- GET/POST  /client/automations/custom     → liste / créer custom automation
- PUT/DELETE /client/automations/custom/:id → modifier / supprimer (atomique)
- GET       /client/history                → logs paginés (?limit&offset)
- GET       /client/stats                  → compteurs + tracking 30j + taux recouvrement
- GET/PUT   /client/configs                → configs déchiffrées / upsert (19 types)
- POST      /client/ai/generate            → générer email IA (aiLimiter 10/min)
- POST      /client/ai/improve             → améliorer email IA (aiLimiter 10/min)
- POST      /client/test-send             → envoi email test à soi-même
- POST/DELETE /client/pause               → pause automations N jours / reprendre
- GET/POST  /client/blacklist              → liste / ajouter email blacklisté
- DELETE    /client/blacklist/:email       → retirer de la blacklist
- GET       /client/students               → liste élèves paginée (?status&search&page)
- GET       /client/students/:id           → détail élève + historique emails + tracking
- POST      /client/send-manual            → envoi manuel à un élève (template ou custom)
- GET/POST  /client/formations             → liste / créer formation
- PUT/DELETE /client/formations/:id        → modifier / supprimer formation

### Système
- GET       /health                        → { ok: true, timestamp }

## MIGRATIONS SUPABASE

| Fichier | Contenu | Statut |
|---|---|---|
| 001-006 | Tables de base (clients, pending_tasks, activity_logs, scheduled_jobs, settings, client_configs) | Appliquées |
| 007 | +password_hash, +must_change_password sur clients | Appliquée |
| 008 | UNIQUE (client_id, config_type) sur client_configs | Appliquée |
| 009 | Table custom_automations | Appliquée |
| 010 | RPC create_task_for_job (atomique insert+job_done) | Appliquée |
| 011 | task_type 'custom_automation' dans l'enum | Appliquée |
| 012 | +paused_until sur clients | Appliquée |
| 013 | Table client_blacklist | Appliquée |
| 014 | Table email_tracking + RLS | Appliquée |
| 015 | Table formations | Appliquée |
| 016 | RLS policies sur email_tracking, formations, client_blacklist | Appliquée |

## PROCHAINE FEATURE À CODER

- Pages Vitrine manquantes : /client/history, /client/customize, /client/settings
- Multi-tenant admin : plusieurs admins, isolation par user_id
- Statistiques avancées : taux de conversion, revenus récupérés dans le dashboard admin
- Notifications push/slack sur nouveau webhook reçu
- Interface de configuration des délais J3/J7 par client

## À FAIRE (dette technique signalée)

*(aucune dette technique connue)*
