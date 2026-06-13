import { Router } from 'express'
import { supabase } from '../services/supabase'
import { requireAuth } from '../middleware/auth'
import { decrypt } from '../services/encryption'

export const dashboardRouter = Router()
dashboardRouter.use(requireAuth)

const USD_TO_EUR = 0.92
const PRICE: Record<string, number> = {
  standard: 690, premium: 1290,
  addon_f11: 200, addon_f13: 350, addon_f18: 149,
  email: 0.001,
}
const ADDON_TYPES = ['addon_f11', 'addon_f13', 'addon_f18'] as const
const PREMIUM_FEATURE_CONFIGS: Record<string, string> = {
  f14: 'template_predunning',
  f15: 'template_churn_reengagement',
  f17: 'rapport_video_active',
  f19: 'template_coaching_j14',
}

dashboardRouter.get('/', async (_req, res) => {
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)
  const som = startOfMonth.toISOString()

  const [clientsRes, pendingRes, infraRes, aiRes] = await Promise.all([
    supabase.from('clients').select('id, name, plan, payment_status, whatsapp_active'),
    supabase.from('pending_tasks').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('settings').select('value').eq('key', 'infra_monthly_cost').maybeSingle(),
    supabase.from('ai_usage_logs').select('client_id, cost_usd').gte('created_at', som),
  ])

  const clients = clientsRes.data ?? []
  const clientIds = clients.map(c => c.id)
  const infraEur = parseFloat(infraRes.data?.value ?? '0') || 0
  const infraPerClient = clients.length > 0 ? infraEur / clients.length : 0

  const [addonRes, featureRes, emailRes] = await Promise.all([
    clientIds.length
      ? supabase.from('client_configs').select('client_id, config_type, encrypted_value')
          .in('client_id', clientIds).in('config_type', [...ADDON_TYPES])
      : { data: [] },
    clientIds.length
      ? supabase.from('client_configs').select('client_id, config_type')
          .in('client_id', clientIds)
          .in('config_type', Object.values(PREMIUM_FEATURE_CONFIGS))
      : { data: [] },
    clientIds.length
      ? supabase.from('activity_logs').select('client_id')
          .in('client_id', clientIds).eq('status', 'sent').gte('created_at', som)
      : { data: [] },
  ])

  // Addon map : client_id → Set<config_type>
  const addonMap: Record<string, Set<string>> = {}
  for (const r of (addonRes as any).data ?? []) {
    try {
      if (decrypt(r.encrypted_value) === 'true') {
        if (!addonMap[r.client_id]) addonMap[r.client_id] = new Set()
        addonMap[r.client_id].add(r.config_type)
      }
    } catch {}
  }

  // Feature activation map
  const featureMap: Record<string, Set<string>> = {}
  for (const r of (featureRes as any).data ?? []) {
    if (!featureMap[r.client_id]) featureMap[r.client_id] = new Set()
    featureMap[r.client_id].add(r.config_type)
  }

  // Email counts this month per client
  const emailCount: Record<string, number> = {}
  for (const l of (emailRes as any).data ?? []) {
    if (l.client_id) emailCount[l.client_id] = (emailCount[l.client_id] ?? 0) + 1
  }
  const emailsTotal = Object.values(emailCount).reduce((a, b) => a + b, 0)

  // AI costs this month per client
  const aiCostUsdPerClient: Record<string, number> = {}
  let aiNullCostUsd = 0
  for (const r of aiRes.data ?? []) {
    if (r.client_id) {
      aiCostUsdPerClient[r.client_id] = (aiCostUsdPerClient[r.client_id] ?? 0) + r.cost_usd
    } else {
      aiNullCostUsd += r.cost_usd
    }
  }
  const totalAiUsd = Object.values(aiCostUsdPerClient).reduce((a, b) => a + b, 0) + aiNullCostUsd

  function clientMrr(c: { id: string; plan: string }): number {
    const base = c.plan === 'premium' ? PRICE.premium : PRICE.standard
    const addons = addonMap[c.id] ?? new Set()
    return base
      + (addons.has('addon_f11') ? PRICE.addon_f11 : 0)
      + (addons.has('addon_f13') ? PRICE.addon_f13 : 0)
      + (addons.has('addon_f18') ? PRICE.addon_f18 : 0)
  }

  // MRR breakdown
  let mrrStandardBase = 0, mrrPremiumBase = 0, mrrOptionsTotal = 0
  let countStandard = 0, countPremium = 0, countUnpaid = 0, unpaidAmount = 0
  let f11Count = 0, f11Rev = 0, f13Count = 0, f13Rev = 0, f18Count = 0, f18Rev = 0

  for (const c of clients) {
    const addons = addonMap[c.id] ?? new Set()
    if (c.plan === 'standard') { countStandard++; mrrStandardBase += PRICE.standard }
    else { countPremium++; mrrPremiumBase += PRICE.premium }
    if (c.payment_status === 'unpaid') { countUnpaid++; unpaidAmount += clientMrr(c) }
    if (addons.has('addon_f11')) { f11Count++; f11Rev += PRICE.addon_f11; mrrOptionsTotal += PRICE.addon_f11 }
    if (addons.has('addon_f13')) { f13Count++; f13Rev += PRICE.addon_f13; mrrOptionsTotal += PRICE.addon_f13 }
    if (addons.has('addon_f18')) { f18Count++; f18Rev += PRICE.addon_f18; mrrOptionsTotal += PRICE.addon_f18 }
  }
  const mrrTotal = mrrStandardBase + mrrPremiumBase + mrrOptionsTotal

  // Costs
  const costAiEur = Math.round(totalAiUsd * USD_TO_EUR * 100) / 100
  const costEmailsEur = Math.round(emailsTotal * PRICE.email * 100) / 100
  const costTotalEur = Math.round((costAiEur + costEmailsEur + infraEur) * 100) / 100
  const profitNetEur = Math.round((mrrTotal - costTotalEur) * 100) / 100
  const marginPct = mrrTotal > 0 ? Math.round((profitNetEur / mrrTotal) * 1000) / 10 : 0

  // Premium feature activation counts
  const premiumClients = clients.filter(c => c.plan === 'premium')
  const premiumCount = premiumClients.length
  function featCount(configType: string): number {
    return premiumClients.filter(c => featureMap[c.id]?.has(configType)).length
  }

  // Per-client cost detail
  const clientCosts = clients.map(c => {
    const mrr = clientMrr(c)
    const aiEur = Math.round((aiCostUsdPerClient[c.id] ?? 0) * USD_TO_EUR * 100) / 100
    const emailsEur = Math.round((emailCount[c.id] ?? 0) * PRICE.email * 100) / 100
    const infra = Math.round(infraPerClient * 100) / 100
    return {
      id: c.id,
      name: c.name,
      plan: c.plan,
      payment_status: c.payment_status,
      mrr,
      cost_ai_eur: aiEur,
      cost_emails_eur: emailsEur,
      cost_infra_eur: infra,
      profit_net_eur: c.payment_status === 'active'
        ? Math.round((mrr - aiEur - emailsEur - infra) * 100) / 100
        : null,
      addons: [...(addonMap[c.id] ?? [])],
    }
  })

  res.json({
    clients: clients.length,
    pending_tasks: pendingRes.count ?? 0,
    emails_sent: emailsTotal,
    mrr_total: mrrTotal,
    mrr_standard: mrrStandardBase,
    mrr_premium: mrrPremiumBase,
    mrr_options: mrrOptionsTotal,
    count_standard: countStandard,
    count_premium: countPremium,
    count_unpaid: countUnpaid,
    unpaid_amount: unpaidAmount,
    cost_ai_usd: Math.round(totalAiUsd * 1000000) / 1000000,
    cost_ai_eur: costAiEur,
    cost_emails_eur: costEmailsEur,
    cost_infra_eur: infraEur,
    cost_total_eur: costTotalEur,
    profit_net_eur: profitNetEur,
    margin_pct: marginPct,
    options_revenue: {
      f11: { count: f11Count, revenue: f11Rev },
      f13: { count: f13Count, revenue: f13Rev },
      f18: { count: f18Count, revenue: f18Rev },
    },
    premium_features: {
      f14: featCount(PREMIUM_FEATURE_CONFIGS.f14),
      f15: featCount(PREMIUM_FEATURE_CONFIGS.f15),
      f16: premiumClients.filter(c => (c as any).whatsapp_active).length,
      f17: featCount(PREMIUM_FEATURE_CONFIGS.f17),
      f19: featCount(PREMIUM_FEATURE_CONFIGS.f19),
      f20: 0,
    },
    premium_count: premiumCount,
    client_costs: clientCosts,
  })
})
