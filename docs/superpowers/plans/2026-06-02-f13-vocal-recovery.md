# F13 — Récupération vocale IA : Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Générer un message audio ElevenLabs et passer un appel Twilio à l'élève après J+7 impayé, avec déclenchement automatique (cron) et manuel (portail client).

**Architecture:** Service `vocal.ts` email-based en interne. Le cron appelle directement avec l'email de `context_json`. L'endpoint API traduit UUID → email avant de déléguer. Trigger inline dans `handleStandardJob` après création du pending_task J+7.

**Tech Stack:** Node.js/TypeScript, ElevenLabs REST API, Twilio SDK (`twilio@^6`), Supabase Storage (bucket `rapports-video`), Express.

---

## Fichiers touchés

| Action | Fichier |
|--------|---------|
| Créer | `supabase/migrations/023_student_profiles_uuid.sql` |
| Créer | `backend/src/services/vocal.ts` |
| Modifier | `backend/src/schemas/client.ts` |
| Modifier | `backend/src/cron.ts` |
| Modifier | `backend/src/routes/clientAuth.ts` |

---

## Task 1 : Migration 023 — UUID sur student_profiles

**Files:**
- Create: `supabase/migrations/023_student_profiles_uuid.sql`

- [ ] **Step 1 : Créer la migration**

```sql
-- supabase/migrations/023_student_profiles_uuid.sql
ALTER TABLE student_profiles
  ADD COLUMN id UUID NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE student_profiles
  ADD CONSTRAINT student_profiles_id_unique UNIQUE (id);

CREATE INDEX idx_student_profiles_id ON student_profiles(id);
```

- [ ] **Step 2 : Appliquer sur Supabase**

Dans le dashboard Supabase → SQL Editor, exécuter le contenu du fichier.
Vérifier : `SELECT id, client_id, email FROM student_profiles LIMIT 5;` — chaque row doit avoir un UUID non-null.

- [ ] **Step 3 : Commit**

```bash
git add supabase/migrations/023_student_profiles_uuid.sql
git commit -m "feat(migration): 023 — ajout colonne id UUID sur student_profiles"
```

---

## Task 2 : Service `vocal.ts`

**Files:**
- Create: `backend/src/services/vocal.ts`

- [ ] **Step 1 : Créer le service complet**

```typescript
// backend/src/services/vocal.ts
import twilio from 'twilio'
import { supabase } from './supabase'
import { insertTrackingRow } from '../utils/tracking'

const ELEVENLABS_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL' // Sarah — même voix que videoreport

export async function generateVocalMessage(text: string): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY manquant')

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`ElevenLabs erreur ${res.status}: ${err}`)
  }

  return Buffer.from(await res.arrayBuffer())
}

export async function uploadVocalAudio(
  buffer: Buffer,
  clientId: string,
  studentEmail: string
): Promise<string> {
  // Base64-encode email → 8 chars safe pour nom de fichier
  const shortHash = Buffer.from(studentEmail).toString('base64').slice(0, 8).replace(/[/+=]/g, '_')
  const storagePath = `vocal/${clientId}_${shortHash}_${Date.now()}.mp3`

  const { error } = await supabase.storage
    .from('rapports-video')
    .upload(storagePath, buffer, { contentType: 'audio/mpeg', upsert: true })

  if (error) throw new Error(`Upload audio échoué: ${error.message}`)

  const { data } = await supabase.storage
    .from('rapports-video')
    .createSignedUrl(storagePath, 3600)

  if (!data?.signedUrl) throw new Error('URL signée non générée')
  return data.signedUrl
}

export async function makeVocalCall(to: string, audioUrl: string): Promise<string> {
  try {
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    const call = await client.calls.create({
      to,
      from: process.env.TWILIO_FROM_NUMBER!,
      twiml: `<Response><Play>${audioUrl}</Play><Hangup/></Response>`,
    })
    return call.sid
  } catch (err: any) {
    console.error('[vocal] makeVocalCall échoué:', err.message)
    return ''
  }
}

export async function sendVocalRecovery(clientId: string, studentEmail: string): Promise<void> {
  try {
    const email = studentEmail.toLowerCase()

    const { data: profile } = await supabase
      .from('student_profiles')
      .select('phone')
      .eq('client_id', clientId)
      .eq('email', email)
      .single()

    if (!profile?.phone) {
      console.log(`[vocal] phone manquant pour ${email} (client ${clientId})`)
      return
    }

    const { data: task } = await supabase
      .from('pending_tasks')
      .select('context_json')
      .eq('client_id', clientId)
      .contains('context_json', { customer_email: email })
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const ctx = (task?.context_json as Record<string, any>) ?? {}
    const prenom = ctx.student_name ?? (ctx.customer_name as string | undefined)?.split(' ')[0] ?? 'étudiant'
    const nomFormation = ctx.product_name ?? 'votre formation'
    const montant = ctx.amount ? String(ctx.amount) : ''

    const montantPhrase = montant
      ? `Un paiement de ${montant} euros est en attente depuis plusieurs jours.`
      : `Un paiement est en attente depuis plusieurs jours.`

    const text =
      `Bonjour ${prenom}, c'est un message automatique concernant votre formation ${nomFormation}. ` +
      `${montantPhrase} ` +
      `Pour régulariser votre situation et conserver l'accès à votre formation, ` +
      `rendez-vous sur le lien qui vous a été envoyé par email. ` +
      `Si vous avez déjà effectué le paiement, ignorez ce message. ` +
      `Merci et bonne journée.`

    const buffer = await generateVocalMessage(text)
    const audioUrl = await uploadVocalAudio(buffer, clientId, email)
    const callSid = await makeVocalCall(profile.phone, audioUrl)

    await insertTrackingRow({ clientId, studentEmail: email, configType: 'vocal_recovery', channel: 'vocal' })

    await supabase.from('activity_logs').insert({
      client_id: clientId,
      action_type: 'vocal_recovery_sent',
      payload_json: { studentEmail: email, phone: profile.phone, callSid },
      status: 'sent',
    })

    console.log(`[vocal] appel déclenché → ${email} (callSid: ${callSid || 'n/a'})`)
  } catch (err: any) {
    console.error(`[vocal] sendVocalRecovery échoué (${studentEmail}):`, err.message)
  }
}
```

- [ ] **Step 2 : Vérifier le build TypeScript**

```bash
cd backend && npm run build
```

Attendu : aucune erreur sur `src/services/vocal.ts`.

- [ ] **Step 3 : Commit**

```bash
git add backend/src/services/vocal.ts
git commit -m "feat(vocal): service ElevenLabs + Twilio pour récupération vocale"
```

---

## Task 3 : Ajouter `vocal_ia_active` dans les config types

**Files:**
- Modify: `backend/src/schemas/client.ts`

- [ ] **Step 1 : Ajouter `vocal_ia_active` dans `ALLOWED_CONFIG_TYPES`**

Dans `backend/src/schemas/client.ts`, remplacer :

```typescript
  'addon_f11',
  'addon_f13',
  'addon_f18',
] as const
```

par :

```typescript
  'addon_f11',
  'addon_f13',
  'addon_f18',
  'vocal_ia_active',
] as const
```

- [ ] **Step 2 : Vérifier le build**

```bash
cd backend && npm run build
```

Attendu : aucune erreur.

- [ ] **Step 3 : Commit**

```bash
git add backend/src/schemas/client.ts
git commit -m "feat(schemas): ajouter vocal_ia_active dans ALLOWED_CONFIG_TYPES"
```

---

## Task 4 : Intégration cron — trigger vocal après J+7

**Files:**
- Modify: `backend/src/cron.ts`

- [ ] **Step 1 : Ajouter l'import de `sendVocalRecovery`**

En haut de `backend/src/cron.ts`, après les imports existants, ajouter :

```typescript
import { sendVocalRecovery } from './services/vocal'
```

La ligne s'insère après :
```typescript
import { generateWeeklyVideo, WeeklyStats } from './services/videoreport'
```

- [ ] **Step 2 : Ajouter le trigger vocal dans `handleStandardJob`**

Dans `handleStandardJob`, remplacer :

```typescript
  const prompt_template = getTemplate(task_type, ctx).prompt
  await createTaskForJob(job.id, job.client_id, task_type, ctx, prompt_template, 'pending')
  console.log(`[cron] job ${job.id} (${task_type}) → pending_task créée (atomique)`)
}
```

par :

```typescript
  const prompt_template = getTemplate(task_type, ctx).prompt
  await createTaskForJob(job.id, job.client_id, task_type, ctx, prompt_template, 'pending')
  console.log(`[cron] job ${job.id} (${task_type}) → pending_task créée (atomique)`)

  if (job.job_type === 'failed_payment_j7' && ctx.customer_email) {
    const { data: vocalCfg } = await supabase
      .from('client_configs')
      .select('encrypted_value')
      .eq('client_id', job.client_id)
      .eq('config_type', 'vocal_ia_active')
      .single()

    let vocalActive = false
    if (vocalCfg?.encrypted_value) {
      try { vocalActive = JSON.parse(decrypt(vocalCfg.encrypted_value))?.active === true } catch {}
    }

    if (vocalActive) {
      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      startOfMonth.setHours(0, 0, 0, 0)

      const { count: alreadyCalled } = await supabase
        .from('email_tracking')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', job.client_id)
        .eq('student_email', (ctx.customer_email as string).toLowerCase())
        .eq('channel', 'vocal')
        .gte('sent_at', startOfMonth.toISOString())

      if (!alreadyCalled || alreadyCalled === 0) {
        void sendVocalRecovery(job.client_id, ctx.customer_email as string)
      }
    }
  }
}
```

- [ ] **Step 3 : Vérifier le build**

```bash
cd backend && npm run build
```

Attendu : aucune erreur.

- [ ] **Step 4 : Commit**

```bash
git add backend/src/cron.ts
git commit -m "feat(cron): trigger vocal après J+7 si vocal_ia_active"
```

---

## Task 5 : Endpoint `POST /client/vocal/send`

**Files:**
- Modify: `backend/src/routes/clientAuth.ts`

- [ ] **Step 1 : Ajouter l'import de `sendVocalRecovery`**

En haut de `backend/src/routes/clientAuth.ts`, dans le bloc d'imports des services, ajouter :

```typescript
import { sendVocalRecovery } from '../services/vocal'
```

La ligne s'insère après :
```typescript
import { validateWhatsApp } from '../services/whatsapp'
```

- [ ] **Step 2 : Ajouter l'endpoint à la fin du fichier, avant la dernière accolade**

À la fin de `clientAuth.ts`, avant la dernière ligne (après le `DELETE /client/formations/:id`), ajouter :

```typescript
// POST /client/vocal/send
clientAuthRouter.post('/vocal/send', authenticateClient, portalLimiter, async (req, res) => {
  const clientId = (req as any).clientId as string
  const { student_id } = req.body as { student_id?: string }

  if (!student_id || !UUID_RE.test(student_id)) {
    return res.status(400).json({ error: 'student_id invalide' })
  }

  const { data: profile } = await supabase
    .from('student_profiles')
    .select('email, phone')
    .eq('id', student_id)
    .eq('client_id', clientId)
    .single()

  if (!profile) {
    return res.status(404).json({ error: 'Élève introuvable' })
  }

  if (!profile.phone) {
    return res.status(400).json({ error: 'Numéro de téléphone non renseigné pour cet élève' })
  }

  await sendVocalRecovery(clientId, profile.email as string)
  res.json({ success: true, message: 'Appel vocal déclenché' })
})
```

- [ ] **Step 3 : Vérifier le build complet**

```bash
cd backend && npm run build
```

Attendu : 0 erreur TypeScript.

- [ ] **Step 4 : Commit**

```bash
git add backend/src/routes/clientAuth.ts
git commit -m "feat(portal): POST /client/vocal/send — déclenchement manuel appel vocal"
```

---

## Task 6 : Vérifications finales

- [ ] **Step 1 : Build propre depuis zéro**

```bash
cd backend && rm -rf dist && npm run build
```

Attendu : `dist/` généré sans erreur ni warning TypeScript.

- [ ] **Step 2 : Vérifier les cas limites en lecture de code**

- `sendVocalRecovery` avec `phone = null` → `console.log` + `return` (ligne ~30 du service)
- `sendVocalRecovery` avec ElevenLabs down → catch global, log erreur, pas de throw
- `makeVocalCall` avec Twilio down → catch interne, retourne `''`, pas de throw
- Endpoint `POST /client/vocal/send` sans Bearer → `authenticateClient` retourne 401 (middleware existant)
- Endpoint avec UUID inexistant → 404
- Endpoint avec phone null → 400 avec message explicite

- [ ] **Step 3 : Vérifier `ALLOWED_CONFIG_TYPES` couvre le nouveau type**

Confirmer dans `schemas/client.ts` que `'vocal_ia_active'` est dans le tableau. Le endpoint `/client/configs` (PUT) accepte désormais `{ config_type: 'vocal_ia_active', value: '{"active":true}' }` sans modification.

- [ ] **Step 4 : Commit final si des ajustements ont été faits**

```bash
git add -p
git commit -m "fix(vocal): ajustements post-review"
```

---

## Récapitulatif des commits attendus

1. `feat(migration): 023 — ajout colonne id UUID sur student_profiles`
2. `feat(vocal): service ElevenLabs + Twilio pour récupération vocale`
3. `feat(schemas): ajouter vocal_ia_active dans ALLOWED_CONFIG_TYPES`
4. `feat(cron): trigger vocal après J+7 si vocal_ia_active`
5. `feat(portal): POST /client/vocal/send — déclenchement manuel appel vocal`
