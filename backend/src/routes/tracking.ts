import { Router } from 'express'
import { supabase } from '../services/supabase'
import { GIF_1x1, isSafeRedirectUrl } from '../utils/tracking'

export const trackingRouter = Router()

// Email open pixel
trackingRouter.get('/open/:token', async (req, res) => {
  const { token } = req.params
  // Fire-and-forget — only set on first open
  supabase
    .from('email_tracking')
    .update({ opened_at: new Date().toISOString() })
    .eq('id', token)
    .is('opened_at', null)
    .then(() => {})

  res.set('Content-Type', 'image/gif')
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.set('Pragma', 'no-cache')
  res.send(GIF_1x1)
})

// Click redirect
trackingRouter.get('/click/:token', async (req, res) => {
  const { token } = req.params
  const rawUrl = req.query.url as string | undefined
  if (!rawUrl) return res.status(400).send('URL manquante')

  // Valider que le token existe en DB — empêche l'utilisation comme open redirector
  const { data: row } = await supabase
    .from('email_tracking')
    .select('id')
    .eq('id', token)
    .single()

  if (!row) return res.status(404).send('Token invalide')

  let decoded: string
  try {
    decoded = decodeURIComponent(rawUrl)
  } catch {
    return res.status(400).send('URL invalide')
  }

  if (!isSafeRedirectUrl(decoded)) {
    return res.status(400).send('URL invalide')
  }

  supabase
    .from('email_tracking')
    .update({ clicked_at: new Date().toISOString(), click_url: decoded })
    .eq('id', token)
    .is('clicked_at', null)
    .then(() => {})

  res.redirect(302, decoded)
})
