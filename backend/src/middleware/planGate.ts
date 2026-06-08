import { Request, Response, NextFunction } from 'express'
import { supabase } from '../services/supabase'
import { decrypt } from '../services/encryption'

export const OPTION_ADDON_MAP = {
  option_checkout: 'addon_f11',
  option_vocal: 'addon_f13',
  option_notaire: 'addon_f18',
} as const

export type OptionKey = keyof typeof OPTION_ADDON_MAP

const OPTION_LABELS: Record<OptionKey, string> = {
  option_checkout: 'Récupération des abandons de checkout',
  option_vocal: 'Récupération vocale IA',
  option_notaire: 'Module Notaire',
}

export async function getClientOptions(clientId: string): Promise<Record<OptionKey, boolean>> {
  const addonTypes = Object.values(OPTION_ADDON_MAP)
  const { data: rows } = await supabase
    .from('client_configs')
    .select('config_type, encrypted_value')
    .eq('client_id', clientId)
    .in('config_type', addonTypes)

  const active = new Set<string>()
  for (const r of rows ?? []) {
    try { if (decrypt(r.encrypted_value) === 'true') active.add(r.config_type) } catch { /* skip */ }
  }

  const result = {} as Record<OptionKey, boolean>
  for (const [optionKey, addonType] of Object.entries(OPTION_ADDON_MAP) as [OptionKey, string][]) {
    result[optionKey] = active.has(addonType)
  }
  return result
}

export type GateRequirement =
  | { plan: 'premium' }
  | { option: OptionKey }

export async function checkGate(
  clientId: string,
  requirement: GateRequirement
): Promise<{ error: string; message: string } | null> {
  if ('plan' in requirement) {
    const { data } = await supabase.from('clients').select('plan').eq('id', clientId).single()
    if (data?.plan !== requirement.plan) {
      return {
        error: 'PLAN_REQUIRED',
        message: `Cette fonctionnalité nécessite le plan ${requirement.plan === 'premium' ? 'Premium' : requirement.plan}.`,
      }
    }
    return null
  }

  const options = await getClientOptions(clientId)
  if (!options[requirement.option]) {
    return {
      error: 'OPTION_REQUIRED',
      message: `Cette fonctionnalité nécessite l'option « ${OPTION_LABELS[requirement.option]} » activée sur votre compte.`,
    }
  }
  return null
}

export function planGate(requirement: GateRequirement) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const clientId = (req as any).clientId as string | undefined
    if (!clientId) return res.status(401).json({ error: 'Non autorisé' })

    const failure = await checkGate(clientId, requirement)
    if (failure) return res.status(403).json(failure)
    next()
  }
}
