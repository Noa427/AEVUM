# Phase 2 — Pilier "Récupération impayés" Design Spec
*2026-05-12*

## Contexte

Extension de AUTOMATEPRO pour traiter les événements `payment_intent.payment_failed` de Stripe. Quand un paiement échoue, l'app crée une tâche et génère un email de relance — manuellement (via Claude.ai) ou automatiquement (via Claude API).

## Décisions clés

- Email format : HTML simple (balises p, strong, a uniquement)
- Sujet email : généré par Claude dans la réponse (format "Objet: ...")
- Données Stripe : contexte variable (metadata optionnelles), prompt s'adapte
- FROM : `onboarding@resend.dev` (MVP), Reply-To : email de l'infopreneur
- Lien paiement : `hosted_invoice_url` extrait du webhook Stripe

## Nouveaux fichiers backend

| Fichier | Rôle |
|---|---|
| `src/routes/webhooks.ts` | POST /api/webhooks/stripe/:clientId |
| `src/routes/tasks.ts` | GET /api/tasks, POST /:id/preview, POST /:id/send |
| `src/routes/history.ts` | GET /api/history |
| `src/routes/simulate.ts` | POST /api/simulate |
| `src/middleware/stripe-sig.ts` | Vérification signature Stripe (raw body requis) |
| `src/services/resend.ts` | Envoi email via Resend SDK |
| `src/services/claude.ts` | Appel Claude API (mode auto uniquement) |
| `src/services/templates.ts` | Prompt template failed_payment + wrapper HTML email |

## Flux webhook

```
POST /api/webhooks/stripe/:clientId
  1. Lire raw body (pas de JSON parser)
  2. Récupérer stripe_webhook_secret du client (décrypté)
  3. stripe.webhooks.constructEvent(rawBody, sig, secret)
  4. Si event.type !== 'payment_intent.payment_failed' → ignorer, 200
  5. Extraire contexte :
     - amount = event.data.object.amount / 100
     - customer_email = event.data.object.receipt_email || metadata.customer_email
     - hosted_invoice_url = event.data.object.metadata?.hosted_invoice_url || ''
     - student_name = metadata?.student_name (optionnel)
     - product_name = metadata?.product_name (optionnel)
  6. Récupérer sender_name du client (décrypté)
  7. Générer prompt_template avec les variables disponibles
  8. Lire settings.auto_mode
```

**Mode manuel :**
```
→ INSERT pending_tasks { status: 'pending', context_json, prompt_template }
→ 200
```

**Mode automatique :**
```
→ INSERT pending_tasks { status: 'processing', context_json, prompt_template }
→ Appel Claude API
→ Parse réponse → { subject, body_html }
→ Resend.send(...)
→ INSERT activity_logs { status: 'sent' }
→ UPDATE pending_tasks { status: 'sent', ai_response, processed_at }
→ 200
```

## Prompt template `failed_payment`

```
Tu es expert en communication pour formateurs en ligne.
Rédige un email de relance pour un élève dont le paiement a échoué.

Formateur : {{sender_name}}
[student_name si présent] Prénom élève : {{student_name}}
[product_name si présent] Formation : {{product_name}}
Montant : {{amount}}€
Lien de paiement : {{payment_link}}

Format de ta réponse (OBLIGATOIRE) :
Objet: [sujet de l'email ici]

<p>...</p>
<p>...<a href="{{payment_link}}">Régulariser mon paiement</a>...</p>

Ton empathique et professionnel, 3 paragraphes max.
HTML simple uniquement : <p>, <strong>, <a> autorisés.
```

Variables substituées avant envoi à Claude (ou affichage en mode manuel).

## Parsing réponse Claude

```typescript
function parseClaudeResponse(response: string): { subject: string; body_html: string } {
  const lines = response.trim().split('\n')
  const subjectLine = lines[0] // "Objet: ..."
  const subject = subjectLine.replace(/^Objet:\s*/i, '').trim()
  const body_html = lines.slice(2).join('\n').trim() // saute la ligne vide
  return { subject, body_html }
}
```

## Wrapper HTML email (Resend)

```html
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
  {{body_html}}
  <hr style="border:none;border-top:1px solid #eee;margin:30px 0">
  <p style="font-size:12px;color:#999">Envoyé via AutomatePro pour {{sender_name}}</p>
</body>
</html>
```

## API Endpoints

| Méthode | Route | Corps / Réponse |
|---|---|---|
| POST | `/api/webhooks/stripe/:clientId` | raw body Stripe → 200 |
| POST | `/api/simulate` | `{ client_id, amount?, student_name? }` → crée pending_task |
| GET | `/api/tasks?status=pending` | `PendingTask[]` avec client name |
| POST | `/api/tasks/:id/preview` | `{ ai_response }` → `{ subject, body_html }` |
| POST | `/api/tasks/:id/send` | `{ subject, body_html }` → envoie email, log, update status |
| GET | `/api/history` | `ActivityLog[]` avec client name |

## Nouveaux fichiers frontend

| Fichier | Rôle |
|---|---|
| `app/(app)/tasks/page.tsx` | Liste tâches pending + bouton Simuler |
| `components/task-drawer.tsx` | Sheet shadcn : prompt → réponse → aperçu → envoi |
| `app/(app)/history/page.tsx` | Tableau activity_logs |
| `components/simulate-modal.tsx` | Modal : sélection client + montant + nom élève |

## UX task-drawer

Sheet (panel latéral) shadcn, ouvert au clic sur une tâche :

**État 1 — Saisie réponse :**
- Header : type tâche + nom client
- Contexte : montant, email élève
- Zone prompt (read-only) + bouton "Copier"
- Zone textarea "Coller la réponse Claude"
- Bouton "Aperçu →" (disabled si textarea vide)

**État 2 — Aperçu :**
- Sujet affiché en badge
- Rendu HTML dans un iframe ou div sandboxé
- Bouton "← Modifier" + bouton "Envoyer l'email →"

**État 3 — Envoi en cours / Succès :**
- Spinner pendant l'envoi
- Message "Email envoyé ✓" + fermeture automatique du drawer

## Simulate modal

Champs :
- Client (select dropdown, liste des clients existants)
- Montant (number input, défaut: 197)
- Prénom élève (text input, optionnel)
- Nom formation (text input, optionnel)

Bouton "Simuler" → POST /api/simulate → la tâche apparaît dans /tasks.

## Modifications index.ts

Ajouter les 4 nouveaux routers :
```typescript
// Le middleware existant skip déjà express.json() pour /api/webhooks
// Ajouter express.raw() AVANT le mount du router pour avoir req.body en Buffer
app.use('/api/webhooks', express.raw({ type: 'application/json' }), webhooksRouter)
app.use('/api/tasks', tasksRouter)
app.use('/api/history', historyRouter)
app.use('/api/simulate', simulateRouter)
```

Note : le middleware JSON existant dans index.ts skip déjà les routes `/api/webhooks`. L'ajout de `express.raw()` sur le même préfixe fournit `req.body` en `Buffer` pour la vérification de signature Stripe.

## Variables d'environnement ajoutées

```
RESEND_API_KEY=re_...
RESEND_FROM=onboarding@resend.dev
```

À ajouter dans `backend/.env.example` (déjà présent RESEND_API_KEY, ajouter RESEND_FROM).
