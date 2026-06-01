# AEVUM APP — Redesign UI + Gestion Plans + Coûts

**Date :** 2026-06-01  
**Statut :** Validé

---

## Objectif

Trois axes :
1. Renommer l'app "AutomatePro" → "AEVUM APP"
2. Enrichir le dashboard avec MRR, coûts automatiques, profit net par client
3. Refaire la page Clients avec gestion plan/options/paiement inline

---

## 1. Renommage

Remplacer toutes les occurrences de "AutomatePro" / "Automate Pro" / "AutomatePro" par "AEVUM APP" dans :
- `frontend/components/sidebar.tsx` — logo texte (ligne 55)
- `frontend/app/(app)/dashboard/page.tsx` — sous-titre (ligne 58)

---

## 2. Data model

### 2a. Migration clients — plan + payment_status

Ajouter deux colonnes sur la table `clients` :

```sql
ALTER TABLE clients
  ADD COLUMN plan TEXT NOT NULL DEFAULT 'standard'
    CHECK (plan IN ('standard', 'premium')),
  ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'active'
    CHECK (payment_status IN ('active', 'unpaid'));
```

- `plan` : `standard` (690€/m) ou `premium` (1200€/m). Défaut `standard`.
- `payment_status` : `active` ou `unpaid`. Toggle manuel depuis l'app. Prévu Stripe plus tard.

### 2b. Options (addons) — client_configs existants

Les options F11 / F13 / F18 sont stockées dans `client_configs` avec les config_types :
- `addon_f11` → valeur `"true"` / `"false"` (chiffré AES-256)
- `addon_f13` → valeur `"true"` / `"false"`
- `addon_f18` → valeur `"true"` / `"false"`

Ces trois types sont ajoutés à `ALLOWED_CONFIG_TYPES` dans `backend/src/schemas/client.ts`.

### 2c. Tracking coûts IA — table ai_usage_logs

```sql
CREATE TABLE ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  model TEXT NOT NULL,
  input_tokens INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  cost_usd NUMERIC(10,6) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON ai_usage_logs(client_id, created_at);
```

Alimentée à chaque appel `callClaude()` et `callClaudeChat()` dans `backend/src/services/claude.ts` — l'API Anthropic retourne `usage.input_tokens` + `usage.output_tokens` dans chaque réponse. Le coût est calculé selon le modèle :
- `claude-sonnet-4-6` : input $3/MTok, output $15/MTok
- Autres modèles : tarif configurable via constante dans le service

`client_id` peut être null (appels sans contexte client, ex: support).

### 2d. Coût infra — settings existants

Le coût infra mensuel (Render + Vercel + Supabase) est saisi une fois par mois dans les paramètres admin, stocké dans la table `settings` existante avec la clé `infra_monthly_cost` (valeur en euros, non chiffrée).

---

## 3. Backend — nouvelles routes et modifications

### 3a. GET /api/dashboard — enrichi

La route existante retourne actuellement `{ clients, pending_tasks, emails_sent }`.

Elle doit retourner en plus :

```typescript
{
  // existants
  clients: number,
  pending_tasks: number,
  emails_sent: number,

  // nouveaux
  mrr_total: number,           // somme MRR tous clients actifs
  mrr_standard: number,        // nb clients Standard × 690
  mrr_premium: number,         // nb clients Premium × 1200
  mrr_options: number,         // somme options actives
  count_standard: number,
  count_premium: number,
  count_unpaid: number,
  unpaid_amount: number,       // MRR des clients impayés

  // coûts ce mois (depuis début du mois courant)
  cost_ai_usd: number,         // somme ai_usage_logs.cost_usd
  cost_ai_eur: number,         // converti (taux fixe 0.92 ou config)
  cost_emails_eur: number,     // emails_sent × 0.001
  cost_infra_eur: number,      // settings.infra_monthly_cost
  cost_total_eur: number,
  profit_net_eur: number,      // mrr_total - cost_total. mrr_total inclut les impayés (revenu théorique max). Le tableau par client affiche "non payé" sur les impayés pour montrer l'écart réel.
  margin_pct: number,          // profit_net_eur / mrr_total * 100

  // options vendues
  options_revenue: {
    f11: { count: number, revenue: number },
    f13: { count: number, revenue: number },
    f18: { count: number, revenue: number },
  },

  // features premium — taux d'activation (parmi clients Premium)
  premium_features: {
    f14: number,  // nb Premium clients ayant config active
    f15: number,
    f16: number,
    f17: number,
    f19: number,
    f20: number,
  },

  // coût par client
  client_costs: Array<{
    id: string,
    name: string,
    plan: string,
    payment_status: string,
    mrr: number,
    cost_ai_eur: number,
    cost_emails_eur: number,
    cost_infra_eur: number,
    profit_net_eur: number,
    addons: string[],
  }>,
}
```

Le MRR par client est calculé côté backend :
- Standard = 690€
- Premium = 1200€
- + F11 actif → +150€
- + F13 actif → +300€
- + F18 actif → +149€ (traité comme fixe mensuel pour la vue, à affiner plus tard)

### 3b. PUT /api/clients/:id — accepte plan et payment_status

Les champs `plan` et `payment_status` sont ajoutés au payload accepté par la route PUT existante. Validation Zod étendue.

### 3c. PUT /api/clients/:id/configs — toggle addons

Aucune nouvelle route. Les addons utilisent la route configs existante (`PUT /api/clients/:id/configs`) avec les clés `addon_f11`, `addon_f13`, `addon_f18`.

### 3d. callClaude() — logging tokens

Dans `backend/src/services/claude.ts`, après chaque appel réussi à l'API Anthropic, insérer une ligne dans `ai_usage_logs` :

```typescript
const usage = response.usage
const costUsd = (usage.input_tokens * 3 + usage.output_tokens * 15) / 1_000_000
await supabase.from('ai_usage_logs').insert({
  client_id: clientId ?? null,
  model: response.model,
  input_tokens: usage.input_tokens,
  output_tokens: usage.output_tokens,
  cost_usd: costUsd,
})
```

`callClaude()` et `callClaudeChat()` reçoivent un `clientId?: string` optionnel en dernier paramètre — valeur par défaut `undefined` → null en DB. Tous les appelants existants compilent sans modification (paramètre optionnel non-breaking).

---

## 4. Frontend — page /dashboard

Refonte complète de `frontend/app/(app)/dashboard/page.tsx`.

### Structure

```
HeroSection         — 3 blocs côte à côte : MRR / Coûts / Profit net
StatsRow            — 6 compteurs : Standard · Premium · Tâches · Emails · Impayés · Options
CostsPanel          — grid 2 colonnes : [TableauParClient] + [OptionsRevenue + FeaturesPremium]
RecentActivity      — liste condensée 5 dernières entrées
```

### HeroSection

**Bloc MRR** (vert, border vert) :
- Valeur `mrr_total` en gros (32px, emerald)
- Barre de composition 3 couleurs (indigo=Standard, vert=Premium, ambre=Options) avec légende

**Bloc Coûts** (rouge, border rouge) :
- Total `cost_total_eur` en rouge
- Détail 3 lignes : IA (auto) / Emails (auto) / Infra (↗ saisir si non défini)
- Si `cost_infra_eur` = 0 → afficher un lien "Définir dans les paramètres"

**Bloc Profit net** (vert, border vert double) :
- Valeur `profit_net_eur`
- Barre de progression pleine à `margin_pct`%
- Label "Marge X%"

### StatsRow — 6 cartes

| Stat | Couleur | Valeur | Sous-valeur |
|---|---|---|---|
| Standard | indigo | `count_standard` | `mrr_standard`€/m |
| Premium | emerald | `count_premium` | `mrr_premium`€/m |
| Tâches | ambre | `pending_tasks` | "à valider" |
| Emails | blue | `emails_sent` | "ce mois" |
| Impayé | red | `count_unpaid` | `-unpaid_amount`€ |
| Options | gray | somme options actives | "vendues" |

### CostsPanel — tableau par client

Colonnes : Client (nom + plan badge) · MRR · IA · Emails · Infra · Net

- Plan badge : indigo="Standard", emerald="Premium"
- Client impayé : MRR en rouge, Net = "non payé", ligne légèrement opaque
- Infra par client = `cost_infra_eur / count_clients` (répartition équitable)

### OptionsRevenue

F11 (ambre) / F13 (violet clair) / F18 (gris si 0) avec count et revenu total. Total en bas.

### FeaturesPremium

Pour chaque feature Premium (F14–F20 hors F18) : nom · dots (vert=actif, gris=inactif) · score X/Y.
- Si feature désactivée faute de clé env → afficher la raison en gris italique.

### RecentActivity

Identique à l'actuel mais condensé : nom client bold + type action + email élève + badge statut + temps relatif.

---

## 5. Frontend — page /clients

Refonte complète de `frontend/app/(app)/clients/page.tsx`.

### Structure

```
PageHeader          — titre "Clients" + sous-titre MRR total + bouton "+ Nouveau client"
ControlBar          — recherche + filtres + tri + chips filtres actifs
ClientTable         — tableau inline avec édition plan/addons/paiement
```

### ControlBar

Recherche plein texte (nom ou email).

Filtres (cumulatifs, logique AND — tous les filtres actifs doivent être satisfaits simultanément) :
- Plan : Tous / Standard / Premium
- Statut paiement : Tous / Actif / Impayé
- Option active : Toutes / Avec F11 / Avec F13 / Avec F18 / Sans option

Tri (select) :
- Nom A→Z / Nom Z→A / MRR ↓ / MRR ↑ / Plan / Date création

Chips des filtres actifs avec × pour retirer.

Bouton "Réinit." remet tout à zéro.

### ClientTable

Colonnes : Client (avatar + nom + email) · Plan (dropdown) · Options (badges) · MRR (calculé) · Paiement (badge + toggle) · Tâches

**Plan dropdown** : select inline `standard` | `premium` — sauvegarde immédiate sur `PUT /api/clients/:id`.

**Options badges** : F11 / F13 / F18 — clic = toggle actif/inactif — appel `PUT /api/clients/:id/configs`. Badge coloré si actif (F11=ambre, F13=violet, F18=rose), gris si inactif. Tooltip au hover avec le prix (+150€ / +300€ / +149€).

**MRR** : calculé localement depuis plan + addons actifs. Standard=690, Premium=1200, F11=+150, F13=+300, F18=+149. Couleur indigo si Standard, emerald si Premium, rouge si impayé.

**Paiement** : badge "● actif" (vert) ou "● impayé" (rouge) — clic = toggle — appel `PUT /api/clients/:id` avec `payment_status`.

**Tâches** : compteur ambre si > 0, gris sinon. Clic → naviguer vers `/clients/:id`.

La colonne de navigation (flèche →) reste : clic sur la **partie non-interactive** de la ligne (nom, email, MRR) navigue vers `/clients/:id`. Les éléments interactifs (dropdown plan, badges options, badge paiement) appellent `e.stopPropagation()` pour ne pas déclencher la navigation.

---

## 6. Hors scope (noté pour plus tard)

- Limites d'usage par client (quota IA/mois) — avant lancement AEVUM
- Clé IA admin séparée (provider configurable) pour rapports AEVUM
- Intégration Stripe côté admin pour paiement automatique
- Rapports IA hebdo sur le business AEVUM (MRR, churn clients, etc.)

---

## 7. Migrations à appliquer

| Fichier | Contenu |
|---|---|
| `021_plan_payment_status.sql` | Colonnes `plan` + `payment_status` sur `clients` |
| `022_ai_usage_logs.sql` | Table `ai_usage_logs` |

---

## 8. Fichiers modifiés/créés

### Créés
- `supabase/migrations/021_plan_payment_status.sql`
- `supabase/migrations/022_ai_usage_logs.sql`

### Modifiés
- `backend/src/schemas/client.ts` — ajout `addon_f11`, `addon_f13`, `addon_f18` dans `ALLOWED_CONFIG_TYPES`
- `backend/src/routes/clients.ts` — PUT accepte `plan` + `payment_status`
- `backend/src/routes/dashboard.ts` — réponse enrichie avec MRR, coûts, options, features
- `backend/src/services/claude.ts` — logging tokens après chaque appel
- `frontend/components/sidebar.tsx` — renommage AEVUM APP
- `frontend/app/(app)/dashboard/page.tsx` — refonte complète
- `frontend/app/(app)/clients/page.tsx` — refonte complète
