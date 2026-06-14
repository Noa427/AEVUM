# AEVUM APP — Mémoire projet

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
- Phase 3 — Auth client + portail Vitrine : TERMINÉE (toutes pages portail présentes)
- Audit 2026-05-28 : URL webhook corrigée, code mort supprimé (portal.ts, supabase-server.ts, stubs history/tasks)
- Hardening sécurité 2026-05-28 : 10 corrections (E1-E3, M4-M8, F9-F15), 0 vulnérabilité npm
- Redesign AEVUM APP 2026-06-01 : renommage, plans Standard/Premium, addons F11/F13/F18 par client, coûts IA auto (tokens), dashboard enrichi MRR/coûts/profit, page clients refaite avec filtres/tri/toggles inline
- Audit complet + 19 corrections 2026-06-03 : sécurité (webhooks hors adminCors, blacklist crons, idempotence), bugs (POST→PUT settings, PUT clients guard, tracking send-manual), UX portail (pagination élèves, panel upsell, labels history, Premium gate rapport vidéo), Vitrine (Se connecter navbar, CGU tarifs, footer légal)
- Audit graphify 2026-06-07 : dérive de prix détectée — le changement de grille tarifaire du 2026-06-03 (commit badc2ba, Premium 1290/F11 +200/F13 +350) n'avait pas été répercuté dans le code (dashboard.ts + clients/page.tsx restaient sur 1200/150/300, committés 2 jours avant). Corrigé sur `fix/prix-dashboard`. README.md racine également mis à jour (branding AEVUM, Next.js 14, RESEND_FROM_EMAIL, route webhook réelle) sur `chore/readme-update`
- Plan gating backend 2026-06-08 : middleware planGate.ts (checkGate/planGate → 403 PLAN_REQUIRED|OPTION_REQUIRED), options option_checkout/option_vocal/option_notaire exposées comme alias de addon_f11/f13/f18 (lecture/écriture via client_configs, pas de nouvelles colonnes), gates posés sur POST /client/vocal/send (option_vocal) et PUT /client/configs pour rapport_video_active (plan premium), routes admin POST /api/clients + PUT /api/clients/:id/plan (gestion plan/options + log activity_logs 'plan_updated'). Sur `feat/plan-gating-backend`
- Dette technique 2026-06-13 : validation Zod (ClientUpdateSchema) sur PUT /api/clients/:id pour sender_name/stripe_webhook_secret (champ absent vs vide) (110c6d1) ; gate vocal_ia_active sur addon_f13/option_vocal dans PUT /client/configs (3a2bea6)
- client_configs multi-formation 2026-06-13 : migration 026 (formation_key généré + UNIQUE (client_id, config_type, formation_key)) — les configs template_* sont désormais par formation, le reste reste global (formation_id NULL). GET/PUT /client/configs et getEmailTemplate adaptés (254cd2a, 0d94f7a, ab2a593, 7cdff25)
- Quota IA mensuel 2026-06-14 : migration 028 (clients.ai_quota_eur_month, NULL = défaut global settings.ai_quota_eur_month_default, 5€ par défaut) ; middleware aiQuotaGate (utils/pricing EXCLUDED_FROM_STATS_CLIENT_IDS exempté) posé sur POST /client/ai/generate et /ai/improve → 429 AI_QUOTA_EXCEEDED si usage du mois (ai_usage_logs) ≥ quota ; réglage global via GET/PUT /api/settings (ai_quota_eur_month_default), override par client via GET/PUT /api/clients/:id (ai_quota_eur_month, ai_quota_eur_month_effective) + UI fiche client (onglet Paramètres)
- Délais J3/J7 configurables par client 2026-06-14 : migration 029 (4 nouveaux config_types : delay_onboarding_j3/j7, delay_failed_payment_j3/j7, valeur = nombre de jours en string, vide = défaut 3/7) ; webhooks.ts calcule j3At/j7At via getDelayDays(configMap, ...) avec fallback DEFAULT_DELAYS (schemas/client.ts) pour handleCheckoutCompleted (onboarding) et handleFailedPayment (relance impayé) ; admin GET/PUT /api/clients/:id/configs accepte ces 4 types (validation 1-90 jours) + UI fiche client (onglet Paramètres, carte "Délais de relance")
- Notifications Slack 2026-06-14 : settings.slack_webhook_url (encrypted, géré via GET/PUT /api/settings → has_slack_webhook), services/slack.ts envoie une notif (best-effort) sur checkout.session.completed (✅ vente), checkout.session.expired (🛒 abandon), payment_intent/invoice.payment_failed (⚠️ échec paiement) — tous clients confondus, déclenché depuis webhooks.ts (notifySlack) ; UI Settings (carte "Notifications Slack")

## STRUCTURE DES FICHIERS

```
backend/src/
  index.ts                  — point d'entrée, montage routes, cron
  cron.ts                   — jobs horaires (scheduled_jobs, custom_automations, testimonials)
  routes/
    clients.ts              — CRUD clients + configs piliers + addons (admin) — plan/payment_status/addons dans GET/PUT
    dashboard.ts            — MRR, coûts IA/emails/infra, profit net, options, features Premium (admin)
    history.ts              — logs paginés (admin)
    tasks.ts                — preview + send tâches (admin)
    simulate.ts             — simulation événements Stripe (admin)
    settings.ts             — clé API Anthropic + infra_monthly_cost (admin)
    support.ts              — email entrant → classify → réponse IA (admin)
    webhooks.ts             — Stripe events → pending_tasks
    tracking.ts             — /track/open + /track/click (public)
    clientAuth.ts           — tout le portail client (/client/*)
  services/
    supabase.ts             — client Supabase service role
    encryption.ts           — AES-256 encrypt/decrypt
    resend.ts               — sendEmail()
    claude.ts               — callClaude(prompt, model?, clientId?) + callClaudeChat() + callClaudeAdmin() (clé admin_anthropic_api_key) — log tokens dans ai_usage_logs
    businessReport.ts       — generateBusinessReport(userId, adminEmail) : snapshot + IA + stockage business_reports + email
    templates.ts            — prompts IA + parseClaudeResponse + wrapEmailHtml
    whatsapp.ts             — sendWhatsApp() + validateWhatsApp() (F16)
    sms.ts                  — sendSms() via Twilio (F20)
    vocal.ts                — generateVocalMessage/uploadVocalAudio/makeVocalCall/sendVocalRecovery — ElevenLabs+Twilio (F13, addon_f13)
    videoreport.ts          — generateWeeklyVideo (buildScript/generateSlides/generateAudio/assembleMp4) (F17)
    slack.ts                — sendSlackNotification(text) via settings.slack_webhook_url (best-effort, silencieux si non configuré)
  middleware/
    auth.ts                 — requireAuth (Supabase JWT admin)
    authenticateClient.ts   — JWT client → req.clientId + req.clientEmail
    rate-limit.ts           — webhookLimiter, apiLimiter, loginLimiter, aiLimiter…
    stripe-sig.ts           — vérification signature Stripe
    error-handler.ts        — handler global Express
    validate.ts             — middleware Zod
    admin-access-log.ts     — log chaque requête admin dans activity_logs
    planGate.ts             — gating plan/options client : checkGate()/planGate() → 403 PLAN_REQUIRED|OPTION_REQUIRED ; OPTION_ADDON_MAP (option_checkout/vocal/notaire ↔ addon_f11/f13/f18)
  utils/
    generateClientCredentials.ts — génère mdp, hash argon2id, envoie email Resend
    getEmailTemplate.ts     — cherche config DB puis fallback defaults
    tracking.ts             — insertTrackingRow + injectTracking (pixel + lien)
    sendMultiChannel.ts     — sendEmailWithChannels() — dispatch email + WhatsApp/SMS selon canaux actifs du client
    businessMetrics.ts      — getBusinessSnapshot(userId) : MRR/coûts/profit/churn scopés user_id (pour rapports IA)
  schemas/
    client.ts               — schémas Zod + ALLOWED_CONFIG_TYPES (27 types : 23 piliers/templates + addon_f11/f13/f18 + vocal_ia_active)

frontend/
  app/
    page.tsx                — redirect → /dashboard
    (auth)/login/           — page de connexion admin (Supabase Auth)
    (app)/layout.tsx        — layout avec sidebar
    (app)/dashboard/        — MRR hero + coûts + profit net + 6 stats + tableau coûts/client + options + features Premium
    (app)/clients/          — plan/addons/paiement inline + filtres/tri cumulatifs + MRR calculé
    (app)/clients/[id]/     — détail client (tâches / historique / paramètres)
    (app)/settings/         — clé API Anthropic + thème + coût infra mensuel
    (app)/reports/          — rapports IA hebdo business (liste + détail + génération manuelle)
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
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL` — adresse expéditeur complète (ex: noreply@tondomaine.com)
- `STRIPE_SECRET_KEY`
- `FRONTEND_URL`, `VITRINE_URL`, `BACKEND_URL`
- `NODE_ENV=production` — obligatoire en prod (masque stack traces)
- `ANTHROPIC_API_KEY` — optionnel (mode auto)
- `ENABLE_CRON=true` — activer le cron sur Render

Vitrine (.env) :
- `AEVUM_URL` — URL Render du backend
- `JWT_SECRET` — même valeur que backend

## ROUTES BACKEND

### Admin (requireAuth + adminCors + apiLimiter)
- GET/POST  /api/clients                   → liste / créer client + credentials (POST accepte plan + option_checkout/vocal/notaire)
- GET/PUT/DELETE /api/clients/:id          → détail / modifier / supprimer
- PUT       /api/clients/:id/plan          → maj plan + options (addon_f11/f13/f18), log activity_logs 'plan_updated'
- GET/PUT   /api/clients/:id/configs       → configs piliers (support, upsell…)
- GET       /api/tasks                     → tâches paginées (?status&client_id&page&limit)
- POST      /api/tasks/:id/preview         → génère ou utilise ai_response pré-peuplé
- POST      /api/tasks/:id/send            → valide + envoie email
- GET       /api/dashboard                 → MRR, coûts IA/emails/infra, profit net, options, features Premium, coûts/client
- GET       /api/history                   → logs paginés (?client_id&date_from&date_to&limit&offset)
- GET       /api/reports                   → rapports business IA paginés (?page&limit)
- GET       /api/reports/:id               → détail rapport business IA
- POST      /api/reports/generate          → génère un rapport business IA immédiatement
- POST      /api/simulate                  → tâche test (failed_payment | checkout_completed)
- GET/PUT   /api/settings                  → clé API Anthropic + infra_monthly_cost
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
- GET       /client/me                     → email + mustChangePassword + pausedUntil + plan + option_checkout/vocal/notaire + whatsapp_connected
- PUT       /client/settings/password      → changer mdp
- PUT       /client/settings/email         → changer email (vérifie currentPassword)
- GET       /client/automations            → piliers actifs + senderName
- GET/POST  /client/automations/custom     → liste / créer custom automation
- PUT/DELETE /client/automations/custom/:id → modifier / supprimer (atomique)
- GET       /client/history                → logs paginés (?limit&offset)
- GET       /client/stats                  → compteurs + tracking 30j + taux recouvrement
- GET/PUT   /client/configs                → configs déchiffrées / upsert (19 types)
- POST      /client/ai/generate            → générer email IA (aiLimiter 10/min + aiQuotaGate, 429 AI_QUOTA_EXCEEDED)
- POST      /client/ai/improve             → améliorer email IA (aiLimiter 10/min + aiQuotaGate, 429 AI_QUOTA_EXCEEDED)
- POST      /client/test-send             → envoi email test à soi-même
- POST/DELETE /client/pause               → pause automations N jours / reprendre
- GET/POST  /client/blacklist              → liste / ajouter email blacklisté
- DELETE    /client/blacklist/:email       → retirer de la blacklist
- GET       /client/students               → liste élèves paginée (?status&search&page)
- GET       /client/students/:id           → détail élève + historique emails + tracking
- POST      /client/send-manual            → envoi manuel à un élève (template ou custom)
- GET/POST  /client/formations             → liste / créer formation
- PUT/DELETE /client/formations/:id        → modifier / supprimer formation
- POST      /client/vocal/send            → déclenchement manuel appel vocal IA (addon_f13)
- POST/DELETE /client/settings/whatsapp   → connecter / déconnecter WhatsApp Business

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
| 017 | Table student_profiles (card_exp, phone, last_lms_activity) | Appliquée |
| 018 | +whatsapp_phone_number_id, +whatsapp_access_token, +whatsapp_active sur clients | Appliquée |
| 019 | +channel sur email_tracking | Appliquée |
| 020 | +token_version SMALLINT sur clients (révocation JWT) | Appliquée |
| 021 | +plan (standard/premium) + payment_status (active/unpaid) sur clients | Appliquée |
| 022 | Table ai_usage_logs (tokens + coût USD par appel IA, RLS activé) | Appliquée |
| 023 | +id UUID sur student_profiles (PK secondaire unique) | Appliquée |
| 024 | +password_reset_used_at sur clients | Appliquée |
| 025 | RLS activé sur tables sans policy (service_role bypass) | Appliquée |
| 026 | client_configs.formation_key (généré) + UNIQUE (client_id, config_type, formation_key) | Appliquée |
| 027 | valid_config_type alignée sur ALLOWED_CONFIG_TYPES (27 types manquants depuis 006) + rejoue 026 (jamais appliquée) | Appliquée manuellement le 2026-06-14 via SQL Editor (hors tracking migrations) |
| 028 | +ai_quota_eur_month (NULL = défaut global) sur clients | Appliquée manuellement le 2026-06-14 via SQL Editor (hors tracking migrations) |
| 029 | valid_config_type + delay_onboarding_j3/j7, delay_failed_payment_j3/j7 | Appliquée manuellement le 2026-06-14 via SQL Editor (hors tracking migrations) |
| 030 | Table business_reports (rapports IA hebdo, RLS activé) | À appliquer |

## MODÈLE D'ABONNEMENT

| Plan | Prix | Features |
|---|---|---|
| Standard | 690€/m | Toutes features de base (F1–F13 inclus dans le plan) |
| Premium | 1 290€/m | Standard + F14 (pré-dunning) + F15 (churn) + F16 (WhatsApp) + F17 (rapport vidéo) + F19 (coaching) + F20 (SMS) |
| Option F11 | +200€/m | Récupération abandons checkout |
| Option F13 | +350€/m + coûts d'appels | Récupération vocale IA |
| Option F18 | +149€/dossier | Module Notaire |

Stockage : `clients.plan` (standard/premium) + `clients.payment_status` (active/unpaid) + `client_configs` pour addon_f11/f13/f18.

## PROCHAINE FEATURE À CODER

- Intégration Stripe côté admin pour paiement automatique clients — reportée 2026-06-14, scope à définir (facturation récurrente vs lien de paiement) quand le besoin sera clair
- Multi-tenant admin : plusieurs admins, isolation par user_id

## À FAIRE (dette technique signalée)

- `sendVideoReport` et `sendWeeklyReport` ont la même fenêtre lundi 08h UTC — deux reports lourds en simultané (corrigé : sendVideoReport décalé à 9h UTC, cron.ts)
- `/client/automations` retourne `recouvrement: true` si stripe_webhook_secret présent — indicateur peu fiable (corrigé : reflète template_failed_payment_j1 configuré, clientAuth.ts)
- Audit sécurité 2026-06-14 : IDOR multi-tenant — corrigé : toutes les lectures admin scopées sur `user_id` : `clients.ts` (`GET /`, `GET /:id`, `GET /:id/configs`), `tasks.ts` (`GET /`, `POST /:id/preview`, `POST /:id/send` via `clients!inner(...)` + `.eq('clients.user_id', userId)` ou vérif propriétaire avant action), `history.ts` (`GET /`), `dashboard.ts` (agrégation scopée par client_id du user), `support.ts` (`POST /inbound` vérifie propriétaire du client_id du body), `simulate.ts` (`POST /` vérifie propriétaire avant insertion)
