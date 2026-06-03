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
    if (!to.startsWith('+')) {
      console.warn(`[vocal] numéro non E.164 — appel annulé: ${to}`)
      return ''
    }
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    const safeUrl = audioUrl.replace(/&/g, '&amp;')
    const call = await client.calls.create({
      to,
      from: process.env.TWILIO_FROM_NUMBER!,
      twiml: `<Response><Play>${safeUrl}</Play><Hangup/></Response>`,
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

    // Idempotence : ne pas rappeler si un appel vocal a déjà été déclenché dans les 30 derniers jours
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const { data: existingCall } = await supabase
      .from('email_tracking')
      .select('id')
      .eq('client_id', clientId)
      .eq('channel', 'vocal')
      .eq('student_email', email)
      .gte('sent_at', thirtyDaysAgo)
      .maybeSingle()
    if (existingCall) {
      console.log(`[vocal] appel déjà effectué dans les 30j pour ${email} — ignoré`)
      return
    }

    const buffer = await generateVocalMessage(text)
    const audioUrl = await uploadVocalAudio(buffer, clientId, email)
    const callSid = await makeVocalCall(profile.phone, audioUrl)

    if (callSid) {
      await insertTrackingRow({ clientId, studentEmail: email, configType: 'vocal_recovery', channel: 'vocal' })

      await supabase.from('activity_logs').insert({
        client_id: clientId,
        action_type: 'vocal_recovery_sent',
        payload_json: { studentEmail: email, phone: profile.phone, callSid },
        status: 'sent',
      })

      console.log(`[vocal] appel déclenché → ${email} (callSid: ${callSid})`)
    } else {
      console.warn(`[vocal] appel Twilio non confirmé pour ${email} — tracking non enregistré`)
    }
  } catch (err: any) {
    console.error(`[vocal] sendVocalRecovery échoué (${studentEmail}):`, err.message)
  }
}
