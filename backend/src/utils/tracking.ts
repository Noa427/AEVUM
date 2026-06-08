import { randomUUID } from 'crypto'
import { supabase } from '../services/supabase'

// Standard 1×1 transparent GIF
export const GIF_1x1 = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
)

export async function insertTrackingRow(opts: {
  clientId: string
  studentEmail: string
  configType: string
  automationId?: string
  channel?: string
}): Promise<string> {
  const id = randomUUID()
  const { error } = await supabase.from('email_tracking').insert({
    id,
    client_id: opts.clientId,
    student_email: opts.studentEmail.toLowerCase(),
    config_type: opts.configType,
    automation_id: opts.automationId ?? null,
    channel: opts.channel ?? 'email',
    sent_at: new Date().toISOString(),
  })
  if (error) console.warn('[tracking] insert failed:', error.message)
  return id
}

// N'autorise que les URLs http(s) — bloque javascript:, data: et autres schémas dangereux
export function isSafeRedirectUrl(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol)
  } catch {
    return false
  }
}

export function injectTracking(html: string, token: string, backendUrl: string): string {
  const pixel = `<img src="${backendUrl}/track/open/${token}" width="1" height="1" style="display:none" alt="">`
  const withPixel = html.includes('</body>')
    ? html.replace('</body>', `${pixel}</body>`)
    : html + pixel

  // Wrap external links — skip already-wrapped tracking links
  return withPixel.replace(/href="(https?:\/\/[^"]+)"/g, (match, url) => {
    if (url.includes('/track/click/')) return match
    if (!isSafeRedirectUrl(url)) return match
    return `href="${backendUrl}/track/click/${token}?url=${encodeURIComponent(url)}"`
  })
}
