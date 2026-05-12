# AUTOMATEPRO — Mémoire projet

## DÉCISIONS ARCHITECTURALES ACTÉES
*(Ne pas modifier sans accord explicite)*

- Stack : Node.js/Express/TS (Render) + Next.js 14/TS/Tailwind/shadcn (Vercel) + Supabase + Resend + Stripe
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
Commits poussés sur Noa427/AEVUM (branch: main)

## DERNIÈRE FEATURE TERMINÉE

Phase 1 Foundation complète :
- Monorepo init (backend Express/TS + frontend Next.js 16 + supabase/migrations)
- Supabase schema 6 tables (clients, client_configs, pending_tasks, activity_logs, scheduled_jobs, settings)
- Auth admin (Supabase Auth, login page, middleware getUser())
- CRUD clients avec configs chiffrées AES-256-GCM
- Dashboard stats (3 compteurs)
- Settings mode auto + clé Anthropic (validation live)
- Sidebar navigation

## PROCHAINE FEATURE À CODER

Phase 2 — Pilier "Récupération impayés" :
1. Endpoint POST /api/webhooks/stripe/:clientId (vérif signature Stripe)
2. Logique dual mode : manuel → INSERT pending_task / auto → Claude API + Resend
3. Page /tasks avec drawer tâche manuelle (copier prompt → coller réponse → aperçu → envoyer)
4. POST /api/tasks/:id/preview (génère aperçu email)
5. POST /api/tasks/:id/send (Resend, log activity)
6. Page /history (liste activity_logs)
7. POST /api/simulate (crée fausse tâche pour test)
