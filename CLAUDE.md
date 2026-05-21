# AUTOMATEPRO — Mémoire projet

## DÉCISIONS ARCHITECTURALES ACTÉES
*(Ne pas modifier sans accord explicite)*

- Stack : Node.js/Express/TS (Render) + Next.js 14/TS/Tailwind/shadcn (Vercel) + Supabase + Resend + Stripe
- Vitrine : Astro 6 / output:static (prerender=false pour pages SSR) + @astrojs/vercel, sur AEVUM/Vitrine/
- Architecture : DB comme file de messages (pending_tasks), webhook répond 200 immédiatement
- Auth : Admin unique en MVP, architecture multi-tenant ready (user_id sur chaque table)
- Mode IA : Manuel par défaut (pas d'ANTHROPIC_API_KEY requise), automatique optionnel
- Email FROM : Domaine admin + nom expéditeur personnalisé par client en MVP
- Config client MVP : nom + email + stripe_webhook_secret + sender_name (chiffré AES-256)
- Prompt templates : Fixes en MVP, éditables par client plus tard
- Scheduled jobs : Cron Render scan horaire sur scheduled_jobs
- Test mode : Bouton "Simuler un événement" dans le dashboard
- Validation tâche : Prévisualisation obligatoire → envoi en 2 clics
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

## ÉTAT ACTUEL DU PROJET

Phase 1 — Foundation : TERMINÉE
Phase 2 — Logique métier complète : TERMINÉE
Phase 3 — Auth client + portail Vitrine : EN COURS

## AUDIT BACKEND 2026-05-21

Nettoyage + optimisations + corrections appliquées :

Rangement :
- services/templates.ts : suppression de buildPrompt (alias mort, rien ne l'importait)

Optimisations :
- services/claude.ts : callClaude et callClaudeChat unifiés via callAnthropicMessage interne
- cron.ts : helper createTaskForJob extrait (3 appels RPC dédupliqués)

Bugs corrigés :
- B1 : decrypt() sans try/catch dans le config loop → protégé dans webhooks.ts, simulate.ts, tasks.ts
- B3 : pending_tasks.insert() sans vérification d'erreur dans handleCheckoutCompleted → erreur vérifiée, scheduled_jobs orphelins évités
- B4 : recoverStuckTasks ignorait silencieusement les erreurs Supabase → log + return sur erreur
- B5 : GET /client/stats chargeait tous les logs (max 1000 Supabase, compteurs faux au-delà) → 5 requêtes count parallèles avec head:true
- B6 : PUT + DELETE /client/automations/custom/:id race condition SELECT→UPDATE → opération atomique unique avec eq('client_id')
- B7 : runCustomAutomations N+1 queries (3N requêtes) → 3 requêtes batch parallèles
- B8 : automations specific_date jamais désactivées après envoi → active=false après succès

## DERNIÈRE FEATURE TERMINÉE

Templates par défaut + endpoints aide IA (suite Phase 3) :

- utils/getEmailTemplate.ts : getEmailTemplate(clientId, configType, variables) → { subject, body }
  - Cherche d'abord dans client_configs (JSON chiffré {subject,body})
  - Fallback sur 4 templates par défaut (j0, j3, j7, failed_payment)
  - Variables : {{nom}}, {{prenom}}, {{email}}, {{mot_de_passe}}, {{nom_formation}}, {{lien_acces}}
- routes/clientAuth.ts — 2 nouveaux endpoints (10 req/min par clientId) :
  - POST /client/ai/generate : body {emailType, formationName, tone, objective} → {subject, body}
  - POST /client/ai/improve : body {content, emailType} → {subject, body}
  - Modèle : claude-haiku-4-5-20251001
- services/claude.ts : callClaudeChat(user, system, model) — supporte system prompt + fallback env var
- middleware/rate-limit.ts : aiLimiter (10/min, keyed par clientId)
- routes/webhooks.ts : mode manuel pré-peuple ai_response avec getEmailTemplate (onboarding_j0 + failed_payment)
- routes/tasks.ts : preview manuel utilise task.ai_response pré-peuplé si body vide

Pour sauvegarder un template custom via le portail :
PUT /client/configs avec { config_type: "template_onboarding_j0", value: JSON.stringify({subject, body}) }

Vérification intégrale + corrections backend (suite Phase 3) :

- migrations/008_client_configs_unique.sql : contrainte UNIQUE (client_id, config_type) sur client_configs
  → ⚠️ À appliquer manuellement dans Supabase Dashboard SQL Editor si pas encore fait
- routes/clientAuth.ts :
  - ALLOWED_CONFIG_TYPES étendu à 12 types (piliers 1-4 complets) :
    sender_name, template_*, upsell_enabled, upsell_product_name, upsell_url, upsell_price,
    support_email_enabled, support_auto_reply, politique_remboursement
  - GET /client/automations : support vérifie 'support_email_enabled' (corrigé depuis 'support_enabled')
- .env : ENABLE_CRON=true ajouté (cron scheduled_jobs actif au démarrage)

Phase 3 — Auth client bout en bout (référence) :

Backend (AEVUM_LOGI_INFOPRENEUR/backend) :
- migrations/007_client_accounts.sql : +password_hash, +must_change_password sur clients
- middleware/authenticateClient.ts : vérifie JWT Bearer, attache req.clientId
- routes/clientAuth.ts monté sur /client (portalCors) :
  - POST /client/login : argon2id verify, délai anti-timing, JWT 7j
  - GET /client/me : email + mustChangePassword + createdAt
  - PUT /client/settings/password : argon2id re-hash, must_change_password=false
  - PUT /client/settings/email : vérifie unicité + currentPassword
  - GET /client/automations : piliers actifs (onboarding/recouvrement/support/upsell) + senderName
  - GET /client/history : logs paginés (?limit=&offset=)
  - GET /client/stats : 5 compteurs (total, ce_mois, onboarding, relances, upsells)
  - GET /client/configs : toutes configs déchiffrées AES-256
  - PUT /client/configs : upsert config chiffrée (12 types autorisés, nécessite migration 008)
- utils/generateClientCredentials.ts : génère mdp 12 chars, hash argon2id, save Supabase, envoi Resend
- scripts/seed-test-client.ts : insère client test + génère credentials (npm run seed:test)
- .env : JWT_SECRET + ENABLE_CRON=true
- Packages ajoutés : argon2, jsonwebtoken, @types/jsonwebtoken

Vitrine (AEVUM/Vitrine) :
- astro.config.mjs : output reste 'static' (Astro 6 supporte prerender=false nativement)
- .env : AEVUM_URL=http://localhost:3001 + JWT_SECRET (même valeur que backend)
- src/lib/auth.ts : getClientFromCookie() utilise import.meta.env.JWT_SECRET (pas process.env)
- src/pages/login.astro : secure:import.meta.env.PROD sur le cookie (HTTP localhost compatible)
- src/pages/client/dashboard.astro : SSR, appels /stats + /automations + /history en parallèle

## VARIABLES D'ENV CRITIQUES

Backend (.env) :
- JWT_SECRET=96987880578c094b67e336575a58f61d80fb7a12626b1eceb650ca5d373198e8
- VITRINE_URL=https://ton-site-vitrine.vercel.app (à mettre à jour pour prod)
- ENABLE_CRON=true (cron scheduled_jobs, à définir aussi sur Render)

Vitrine (.env) :
- AEVUM_URL=http://localhost:3001 (prod : URL Render du backend)
- JWT_SECRET= (même valeur que backend)

## ROUTES BACKEND

### Admin (requireAuth + adminCors + apiLimiter)
- GET    /api/clients                  → liste clients + stats pending/sent
- POST   /api/clients                  → créer client + configs + credentials
- GET    /api/clients/:id              → détail client
- PUT    /api/clients/:id              → modifier client
- DELETE /api/clients/:id              → supprimer client
- GET    /api/clients/:id/configs      → configs piliers déchiffrées
- PUT    /api/clients/:id/configs      → upsert configs piliers
- GET    /api/tasks                    → liste tâches paginées (?status&client_id&page&limit)
- POST   /api/tasks/:id/preview        → prévisualiser (génère ou utilise ai_response)
- POST   /api/tasks/:id/send           → valider + envoyer email
- GET    /api/dashboard                → stats globales
- GET    /api/history                  → logs paginés (?client_id&date_from&date_to&limit&offset)
- POST   /api/simulate                 → insérer tâche test (failed_payment | checkout_completed)
- GET    /api/settings                 → lire settings (clé API Anthropic)
- PUT    /api/settings                 → écrire settings
- POST   /api/support/inbound         → email entrant → classify → réponse IA
- GET    /api/portal/*                → portail legacy

### Webhook Stripe (webhookLimiter + stripe-sig)
- POST   /api/webhooks/:clientId       → checkout.session.completed | payment_intent.payment_failed | invoice.payment_failed

### Portail client (portalCors, JWT via authenticateClient)
- POST   /client/login                 → argon2id verify → JWT 7j (portalAuthLimiter 5/min)
- GET    /client/me                    → email + mustChangePassword + createdAt
- PUT    /client/settings/password     → changer mdp (vérifie currentPassword)
- PUT    /client/settings/email        → changer email (vérifie currentPassword + unicité)
- GET    /client/automations           → piliers actifs + senderName
- GET    /client/history               → logs paginés (?limit&offset)
- GET    /client/stats                 → 5 compteurs via count queries parallèles
- GET    /client/configs               → toutes configs déchiffrées
- PUT    /client/configs               → upsert config (12 types autorisés)
- GET    /client/automations/custom    → liste des custom automations du client
- POST   /client/automations/custom    → créer custom automation
- PUT    /client/automations/custom/:id → modifier (atomique, ownership garanti)
- DELETE /client/automations/custom/:id → supprimer (atomique, ownership garanti)
- POST   /client/ai/generate          → générer email IA (aiLimiter 10/min)
- POST   /client/ai/improve           → améliorer email IA (aiLimiter 10/min)

### Système
- GET    /health                       → { ok: true, timestamp }

## MIGRATIONS SUPABASE

| Fichier | Contenu | Statut |
|---|---|---|
| 001-006 | Tables de base (clients, pending_tasks, activity_logs, scheduled_jobs, settings, client_configs) | Appliquées |
| 007_client_accounts.sql | +password_hash, +must_change_password sur clients | Appliquée |
| 008_client_configs_unique.sql | UNIQUE (client_id, config_type) sur client_configs | ⚠️ À appliquer si pas encore fait |
| 009_custom_automations.sql | Table custom_automations | Appliquée |
| 010_create_task_for_job_rpc.sql | RPC create_task_for_job (atomique insert+job_done) | Appliquée |
| 011_add_custom_automation_task_type.sql | task_type 'custom_automation' dans l'enum | Appliquée |

## PROCHAINE FEATURE À CODER

- Pages Vitrine manquantes : /client/history, /client/customize, /client/settings
- Multi-tenant admin : plusieurs admins, isolation par user_id
- Mode auto par défaut : config par client (pas global)
- Statistiques avancées : taux de conversion, revenus récupérés
- Notifications push/slack sur nouveau webhook reçu
- Interface de configuration des scheduled_jobs (délais J3/J7 configurables)
