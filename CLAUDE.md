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

Phase : Brainstorming / Design
Avancement : Architecture validée, design en cours (section 2/5)

## DERNIÈRE FEATURE TERMINÉE

Aucune — projet non encore initialisé.

## PROCHAINE FEATURE À CODER

Phase 1 — Foundation :
1. Init monorepo + Git + .gitignore
2. Backend Express/TS (structure + health check)
3. Frontend Next.js 14 (structure + layout sidebar)
4. Supabase schema (migrations SQL)
5. Auth admin (Supabase Auth)
6. CRUD clients
7. Dashboard stats
8. Settings (toggle mode auto)
