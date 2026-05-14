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
Phase 2 — Logique métier complète : TERMINÉE

## DERNIÈRE FEATURE TERMINÉE

Phase 2 complète (logique métier bout en bout) :

Backend :
- middleware/stripe-sig.ts : vérification signature webhook par client (AES decrypt + SDK Stripe)
- routes/webhooks.ts : invoice.payment_failed + checkout.session.completed, dual mode auto/manuel
- routes/simulate.ts : event_type (failed_payment | checkout_completed) + custom_data
- routes/tasks.ts : GET paginé + filtres, POST /:id/preview (auto → Claude API), POST /:id/send (Resend + activity_log)
- routes/history.ts : GET paginé + filtres (status, client_id, date_from, date_to)
- routes/settings.ts : GET /test-anthropic pour valider clé API
- routes/clients.ts : CRUD complet avec GET/:id et PUT/:id (upsert configs)
- services/templates.ts : getTemplate() + buildPromptFailedPayment() + onboarding J0/J3/J7
- services/claude.ts : callClaude(prompt, model)
- services/resend.ts : from = '{sender_name} <domain>' via RESEND_FROM_DOMAIN
- cron.ts : runScheduledJobs() — scan scheduled_jobs → crée pending_tasks
- middleware/error-handler.ts : JSON structuré avec timestamp + code
- render.yaml : web service + cron job hourly

Frontend :
- /tasks : polling 30s, badge type (Impayé/Onboarding J0/J3/J7), montant
- /tasks/TaskDrawer : copier prompt, coller réponse Claude, aperçu, envoyer
- /tasks/SimulateModal : event_type selector (failed_payment | checkout_completed)
- /history : filtres client + statut, pagination, modal détails avec payload
- /clients : bouton Webhook (URL à copier), bouton Modifier (PUT /:id)
- /dashboard : 5 dernières activités + lien vers /tasks si pending

## PROCHAINE FEATURE À CODER (Phase 3)

- Multi-tenant : plusieurs admins, isolation par user_id
- Mode auto par défaut : config par client (pas global)
- Templates éditables par client
- Statistiques avancées : taux de conversion, revenus récupérés
- Notifications push/slack sur nouveau webhook reçu
- Interface de configuration des scheduled_jobs (délais J3/J7 configurables)
