// backend/src/middleware/stripe-sig.ts
import { Request, Response, NextFunction } from 'express'
import Stripe from 'stripe'
import { supabase } from '../services/supabase'
import { decrypt } from '../services/encryption'

export async function verifyStripeSignature(req: Request, res: Response, next: NextFunction) {
  const clientId = req.params.clientId
  const sig = req.headers['stripe-signature'] as string | undefined
  if (!sig) return res.status(400).json({ error: 'Signature Stripe manquante' })

  const { data: configs } = await supabase
    .from('client_configs')
    .select('encrypted_value')
    .eq('client_id', clientId)
    .eq('config_type', 'stripe_webhook_secret')

  if (!configs || configs.length === 0) {
    return res.status(400).json({ error: 'Client ou secret introuvable' })
  }

  const secret = decrypt(configs[0].encrypted_value)
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

  try {
    const event = stripe.webhooks.constructEvent(req.body as Buffer, sig, secret)
    ;(req as any).stripeEvent = event
    next()
  } catch (err: any) {
    return res.status(400).json({ error: `Signature invalide: ${err.message}` })
  }
}
