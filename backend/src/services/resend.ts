// backend/src/services/resend.ts
import { Resend } from 'resend'

export async function sendEmail(params: {
  to: string
  subject: string
  html: string
  reply_to?: string
}): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY!)
  const from = process.env.RESEND_FROM || 'onboarding@resend.dev'
  const { error } = await resend.emails.send({
    from,
    to: params.to,
    subject: params.subject,
    html: params.html,
    ...(params.reply_to ? { replyTo: params.reply_to } : {}),
  })
  if (error) throw new Error(error.message)
}
