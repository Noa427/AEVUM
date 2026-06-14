export const USD_TO_EUR = 0.92

export const PRICE: Record<string, number> = {
  standard: 690, premium: 1290,
  addon_f11: 200, addon_f13: 350, addon_f18: 149,
  email: 0.001,
}

export const ADDON_TYPES = ['addon_f11', 'addon_f13', 'addon_f18'] as const

// Compte de test interne (Noa) : accès premium + tous les addons, mais exclu des stats/prix du dashboard
export const EXCLUDED_FROM_STATS_CLIENT_IDS = new Set(['11111111-1111-1111-1111-111111111111'])

export function planMrr(plan: string, addons: Iterable<string>): number {
  const addonSet = addons instanceof Set ? addons : new Set(addons)
  const base = plan === 'premium' ? PRICE.premium : PRICE.standard
  return base
    + (addonSet.has('addon_f11') ? PRICE.addon_f11 : 0)
    + (addonSet.has('addon_f13') ? PRICE.addon_f13 : 0)
    + (addonSet.has('addon_f18') ? PRICE.addon_f18 : 0)
}
