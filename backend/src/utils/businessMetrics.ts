import { supabase } from '../services/supabase'
import { decrypt } from '../services/encryption'
import { PRICE, USD_TO_EUR, ADDON_TYPES, planMrr, EXCLUDED_FROM_STATS_CLIENT_IDS } from './pricing'

export interface BusinessSnapshot {
  clients: number
  pending_tasks: number
  emails_sent: number
  mrr_total: number
  count_standard: number
  count_premium: number
  count_unpaid: number
  unpaid_amount: number
  cost_ai_eur: number
  cost_emails_eur: number
  cost_infra_eur: number
  cost_total_eur: number
  profit_net_eur: number
  margin_pct: number
}

export async function getBusinessSnapshot(userId: string): Promise<BusinessSnapshot> {
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)
  const som = startOfMonth.toISOString()

  const [clientsRes, infraRes] = await Promise.all([
    supabase.from('clients').select('id, plan, payment_status').eq('user_id', userId),
    supabase.from('settings').select('value').eq('key', 'infra_monthly_cost').maybeSingle(),
  ])

  const clients = (clientsRes.data ?? []).filter(c => !EXCLUDED_FROM_STATS_CLIENT_IDS.has(c.id))
  const clientIds = clients.map(c => c.id)
  const infraEur = parseFloat(infraRes.data?.value ?? '0') || 0

  const [pendingRes, aiRes, addonRes, emailRes] = await Promise.all([
    clientIds.length
      ? supabase.from('pending_tasks').select('id', { count: 'exact', head: true }).eq('status', 'pending').in('client_id', clientIds)
      : Promise.resolve({ count: 0 } as any),
    clientIds.length
      ? supabase.from('ai_usage_logs').select('client_id, cost_usd').in('client_id', clientIds).gte('created_at', som)
      : Promise.resolve({ data: [] } as any),
    clientIds.length
      ? supabase.from('client_configs').select('client_id, config_type, encrypted_value')
          .in('client_id', clientIds).in('config_type', [...ADDON_TYPES])
      : Promise.resolve({ data: [] } as any),
    clientIds.length
      ? supabase.from('activity_logs').select('client_id')
          .in('client_id', clientIds).eq('status', 'sent').gte('created_at', som)
      : Promise.resolve({ data: [] } as any),
  ])

  const addonMap: Record<string, Set<string>> = {}
  for (const r of (addonRes as any).data ?? []) {
    try {
      if (decrypt(r.encrypted_value) === 'true') {
        if (!addonMap[r.client_id]) addonMap[r.client_id] = new Set()
        addonMap[r.client_id].add(r.config_type)
      }
    } catch {}
  }

  const emailsTotal = (emailRes as any).data?.length ?? 0

  let totalAiUsd = 0
  for (const r of (aiRes as any).data ?? []) totalAiUsd += r.cost_usd

  let mrrTotal = 0, countStandard = 0, countPremium = 0, countUnpaid = 0, unpaidAmount = 0
  for (const c of clients) {
    const addons = addonMap[c.id] ?? new Set()
    const mrr = planMrr(c.plan, addons)
    mrrTotal += mrr
    if (c.plan === 'standard') countStandard++
    else countPremium++
    if (c.payment_status === 'unpaid') { countUnpaid++; unpaidAmount += mrr }
  }

  const costAiEur = Math.round(totalAiUsd * USD_TO_EUR * 100) / 100
  const costEmailsEur = Math.round(emailsTotal * PRICE.email * 100) / 100
  const costTotalEur = Math.round((costAiEur + costEmailsEur + infraEur) * 100) / 100
  const profitNetEur = Math.round((mrrTotal - costTotalEur) * 100) / 100
  const marginPct = mrrTotal > 0 ? Math.round((profitNetEur / mrrTotal) * 1000) / 10 : 0

  return {
    clients: clients.length,
    pending_tasks: (pendingRes as any).count ?? 0,
    emails_sent: emailsTotal,
    mrr_total: mrrTotal,
    count_standard: countStandard,
    count_premium: countPremium,
    count_unpaid: countUnpaid,
    unpaid_amount: Math.round(unpaidAmount * 100) / 100,
    cost_ai_eur: costAiEur,
    cost_emails_eur: costEmailsEur,
    cost_infra_eur: infraEur,
    cost_total_eur: costTotalEur,
    profit_net_eur: profitNetEur,
    margin_pct: marginPct,
  }
}
