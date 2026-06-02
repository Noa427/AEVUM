# F13 — Récupération vocale IA : Design

**Date** : 2026-06-02  
**Stack** : Node.js/Express/TS, ElevenLabs, Twilio, Supabase  
**Statut** : approuvé

---

## Contexte

Quand un élève n'a pas réglé son impayé après la relance email J+7, AEVUM génère un message audio personnalisé via ElevenLabs et passe un appel téléphonique via Twilio. Le client AEVUM peut aussi déclencher un appel manuellement depuis son portail sur n'importe quel élève.

Variables d'env déjà présentes : `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `ELEVENLABS_API_KEY`.

---

## Architecture

### Approche retenue

Service `vocal.ts` avec signature interne email-based. Le cron appelle directement avec l'email issu de `context_json`. L'endpoint API valide le UUID → traduit en email → délègue au service. Trigger vocal inline dans `handleStandardJob` au moment de la création du pending_task J+7.

---

## Migration 023

Fichier : `supabase/migrations/023_student_profiles_uuid.sql`

```sql
ALTER TABLE student_profiles
  ADD COLUMN id UUID NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE student_profiles
  ADD CONSTRAINT student_profiles_id_unique UNIQUE (id);

CREATE INDEX idx_student_profiles_id ON student_profiles(id);
```

La PK `(client_id, email)` reste inchangée. Le UUID sert uniquement aux lookups par l'endpoint API.

---

## Service `src/services/vocal.ts`

### `generateVocalMessage(text: string): Promise<Buffer>`
- Appel fetch vers ElevenLabs `/v1/text-to-speech/EXAVITQu4vr4xnSDxMaL` (voix Sarah, même que videoreport)
- Modèle : `eleven_multilingual_v2`, `voice_settings: { stability: 0.5, similarity_boost: 0.75 }`
- Timeout : `AbortSignal.timeout(30_000)`
- Erreur non-2xx : throw avec message

### `uploadVocalAudio(buffer: Buffer, clientId: string, studentEmail: string): Promise<string>`
- Bucket : `rapports-video` (existant), dossier `vocal/`
- Nom : `vocal_{clientId}_{shortHash(email)}_{Date.now()}.mp3` (shortHash = 8 premiers chars de base64 de l'email pour éviter caractères spéciaux)
- `contentType: 'audio/mpeg'`, `upsert: true`
- URL signée valable 3600s (largement suffisant pour l'appel)

### `makeVocalCall(to: string, audioUrl: string): Promise<string>`
- Crée un appel Twilio avec `from: TWILIO_FROM_NUMBER`
- TwiML : `<Response><Play>{audioUrl}</Play><Hangup/></Response>`
- Retourne le `callSid`
- Wrap try/catch : log silencieux, ne propage pas l'erreur (retourne `''` si échec)

### `sendVocalRecovery(clientId: string, studentEmail: string): Promise<void>`

Flux complet :

1. Lookup `student_profiles` par `(client_id, email)` → récupère `phone`
2. Si `phone` null → `console.log('[vocal] phone manquant pour', studentEmail)` + return
3. Lookup `pending_tasks` le plus récent avec `customer_email = studentEmail` et `client_id = clientId` pour récupérer `prenom`, `nom_formation`, `montant`, `lien_paiement`
4. Construire le texte :
   > "Bonjour {prenom}, c'est un message automatique concernant votre formation {nom_formation}. Un paiement de {montant} euros est en attente depuis plusieurs jours. Pour régulariser votre situation et conserver l'accès à votre formation, rendez-vous sur le lien qui vous a été envoyé par email. Si vous avez déjà effectué le paiement, ignorez ce message. Merci et bonne journée."
5. `generateVocalMessage(text)` → buffer MP3
6. `uploadVocalAudio(buffer, clientId, studentEmail)` → audioUrl
7. `makeVocalCall(phone, audioUrl)` → callSid
8. `insertTrackingRow({ clientId, studentEmail, configType: 'vocal_recovery', channel: 'vocal' })`
9. `supabase.from('activity_logs').insert({ action_type: 'vocal_recovery_sent', payload_json: { studentEmail, phone, callSid }, status: 'sent' })`

Wrap try/catch global → log erreur, ne propage pas (le cron ne doit pas planter).

---

## Intégration cron (`cron.ts` — `handleStandardJob`)

Après `createTaskForJob(...)` quand `job.job_type === 'failed_payment_j7'` :

```
1. SELECT encrypted_value FROM client_configs WHERE client_id = job.client_id AND config_type = 'vocal_ia_active'
2. Parse JSON → si absent ou active !== true → skip
3. SELECT count FROM email_tracking WHERE client_id = job.client_id AND student_email = ctx.customer_email AND channel = 'vocal' AND sent_at >= début du mois courant
4. Si count > 0 → skip (idempotence)
5. void sendVocalRecovery(job.client_id, ctx.customer_email)  // fire-and-forget
```

Le vocal part en parallèle du cron — ni await ni catch au niveau `handleStandardJob`.

---

## Endpoint `POST /client/vocal/send`

Route dans `clientAuth.ts`, après les routes formations :

```
POST /client/vocal/send
Auth: authenticateClient
Rate limit: portalLimiter
Body: { student_id: string }  // UUID v4
```

Flux :
1. Valider UUID avec `UUID_RE` → 400 `{ error: 'student_id invalide' }` si échec
2. `SELECT email, phone FROM student_profiles WHERE id = $uuid AND client_id = $clientId` → 404 si absent
3. Si `phone` null → 400 `{ error: 'Numéro de téléphone non renseigné pour cet élève' }`
4. `await sendVocalRecovery(clientId, row.email)`
5. `res.json({ success: true, message: 'Appel vocal déclenché' })`

---

## Config `vocal_ia_active`

Ajout dans `ALLOWED_CONFIG_TYPES` de `schemas/client.ts`.  
Valeur stockée (chiffrée) : `JSON.stringify({ active: true })`.  
Accepté automatiquement par les endpoints `/client/configs` existants.

---

## Vérifications post-implémentation

- `npm run build` sans erreur TypeScript
- `sendVocalRecovery` avec `phone = null` → log + return, pas de throw
- Endpoint `/client/vocal/send` : 400 si phone absent, 404 si UUID inconnu, 401 si token manquant
- Entrées `email_tracking` avec `channel = 'vocal'` correctement insérées
- Aucune régression sur envois SMS, email, Twilio SMS existants
