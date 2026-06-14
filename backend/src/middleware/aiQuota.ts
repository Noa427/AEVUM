import { Request, Response, NextFunction } from 'express'
import { supabase } from '../services/supabase'
import { USD_TO_EUR, EXCLUDED_FROM_STATS_CLIENT_IDS } from '../utils/pricing'

export const DEFAULT_AI_QUOTA_EUR_MONTH = 5

export async function getAiQuotaDefault(): Promise<number> {
  const { data } = await supabase.from('settings').select('value').eq('key', 'ai_quota_eur_month_default').maybeSingle()
  const val = parseFloat(data?.value ?? '')
  return isNaN(val) || val < 0 ? DEFAULT_AI_QUOTA_EUR_MONTH : val
}

export async function getAiUsageEurMonth(clientId: string): Promise<number> {
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const { data } = await supabase
    .from('ai_usage_logs')
    .select('cost_usd')
    .eq('client_id', clientId)
    .gte('created_at', startOfMonth.toISOString())

  const totalUsd = (data ?? []).reduce((sum, r) => sum + r.cost_usd, 0)
  return Math.round(totalUsd * USD_TO_EUR * 100) / 100
}

// quota du client (ai_quota_eur_month) ou défaut global si NULL
export async function getEffectiveAiQuota(clientId: string): Promise<number> {
  const { data: client } = await supabase.from('clients').select('ai_quota_eur_month').eq('id', clientId).single()
  if (client?.ai_quota_eur_month !== null && client?.ai_quota_eur_month !== undefined) {
    return Number(client.ai_quota_eur_month)
  }
  return getAiQuotaDefault()
}

export async function aiQuotaGate(req: Request, res: Response, next: NextFunction) {
  const clientId = (req as any).clientId as string | undefined
  if (!clientId) return res.status(401).json({ error: 'Non autorisé' })
  if (EXCLUDED_FROM_STATS_CLIENT_IDS.has(clientId)) return next()

  const [quota, usage] = await Promise.all([getEffectiveAiQuota(clientId), getAiUsageEurMonth(clientId)])
  if (usage >= quota) {
    return res.status(429).json({
      error: 'AI_QUOTA_EXCEEDED',
      message: 'Quota d\'usage IA mensuel atteint. Contactez votre administrateur.',
    })
  }
  next()
}
