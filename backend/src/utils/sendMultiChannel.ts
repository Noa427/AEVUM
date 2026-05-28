import { supabase } from '../services/supabase'
import { decrypt } from '../services/encryption'
import { sendEmail } from '../services/resend'
import { sendSms } from '../services/sms'
import { sendWhatsApp } from '../services/whatsapp'
import { insertTrackingRow, injectTracking } from './tracking'

function injectVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`)
}

export interface MultiChannelOpts {
  clientId: string
  studentEmail: string
  configType: string
  automationId?: string
  /** JSON décrypté du config_type du template — optionnel */
  configJson?: Record<string, any>
  /** Variables pour interpoler sms_body/whatsapp_body */
  templateVars?: Record<string, string>
  to: string
  subject: string
  /** HTML non tracké — le tracking sera injecté ici */
  rawHtml: string
  senderName: string
  replyTo?: string
}

/**
 * Envoie l'email (avec tracking) puis SMS + WhatsApp silencieusement si configurés.
 * Retourne le trackingToken de l'email.
 */
export async function sendEmailWithChannels(opts: MultiChannelOpts): Promise<string> {
  // ── Email ──
  const token = await insertTrackingRow({
    clientId: opts.clientId,
    studentEmail: opts.studentEmail,
    configType: opts.configType,
    automationId: opts.automationId,
    channel: 'email',
  })
  const trackedHtml = injectTracking(opts.rawHtml, token, process.env.BACKEND_URL!)
  await sendEmail({
    to: opts.to,
    subject: opts.subject,
    html: trackedHtml,
    sender_name: opts.senderName,
    reply_to: opts.replyTo,
  })

  // ── SMS + WhatsApp (seulement si config JSON renseigné) ──
  const cfg = opts.configJson
  if (!cfg) return token

  const hasSms = cfg.sms_active === true && typeof cfg.sms_body === 'string'
  const hasWa  = cfg.whatsapp_active === true && typeof cfg.whatsapp_body === 'string'
  if (!hasSms && !hasWa) return token

  const vars = opts.templateVars ?? {}

  // Lookup phone + client WA creds en parallèle
  const [profileRes, clientRes] = await Promise.all([
    supabase
      .from('student_profiles')
      .select('phone')
      .eq('client_id', opts.clientId)
      .eq('email', opts.studentEmail.toLowerCase())
      .single(),
    hasWa
      ? supabase
          .from('clients')
          .select('whatsapp_phone_number_id, whatsapp_access_token, whatsapp_active')
          .eq('id', opts.clientId)
          .single()
      : Promise.resolve({ data: null }),
  ])

  const phone = profileRes.data?.phone ?? null
  if (!phone) return token

  // SMS
  if (hasSms) {
    try {
      const body = injectVars(cfg.sms_body as string, vars).slice(0, 160)
      await sendSms(phone, body)
      await insertTrackingRow({
        clientId: opts.clientId,
        studentEmail: opts.studentEmail,
        configType: opts.configType,
        channel: 'sms',
      })
    } catch (e: any) {
      console.error('[sms] silenced:', e.message)
    }
  }

  // WhatsApp
  if (hasWa) {
    const cl = (clientRes as any).data
    if (cl?.whatsapp_active && cl.whatsapp_phone_number_id && cl.whatsapp_access_token) {
      try {
        const body = injectVars(cfg.whatsapp_body as string, vars)
        const accessToken = decrypt(cl.whatsapp_access_token as string)
        await sendWhatsApp({
          phoneNumberId: cl.whatsapp_phone_number_id as string,
          accessToken,
          to: phone,
          body,
        })
        await insertTrackingRow({
          clientId: opts.clientId,
          studentEmail: opts.studentEmail,
          configType: opts.configType,
          channel: 'whatsapp',
        })
      } catch (e: any) {
        console.error('[whatsapp] silenced:', e.message)
      }
    }
  }

  return token
}
