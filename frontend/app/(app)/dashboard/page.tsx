'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import Link from 'next/link'
import { ArrowRight, Clock } from 'lucide-react'

interface ClientCost {
  id: string
  name: string
  plan: string
  payment_status: string
  mrr: number
  cost_ai_eur: number
  cost_emails_eur: number
  cost_infra_eur: number
  profit_net_eur: number | null
  addons: string[]
}

interface DashboardData {
  clients: number
  pending_tasks: number
  emails_sent: number
  mrr_total: number
  mrr_standard: number
  mrr_premium: number
  mrr_options: number
  count_standard: number
  count_premium: number
  count_unpaid: number
  unpaid_amount: number
  cost_ai_usd: number
  cost_ai_eur: number
  cost_emails_eur: number
  cost_infra_eur: number
  cost_total_eur: number
  profit_net_eur: number
  margin_pct: number
  options_revenue: {
    f11: { count: number; revenue: number }
    f13: { count: number; revenue: number }
    f18: { count: number; revenue: number }
  }
  premium_features: { f14: number; f15: number; f16: number; f17: number; f19: number; f20: number }
  premium_count: number
  client_costs: ClientCost[]
}

interface LogRow {
  id: string
  client_id: string | null
  action_type: string
  status: string
  created_at: string
  payload_json: Record<string, any>
  clients: { name: string } | null
}

const ACTION_LABELS: Record<string, string> = {
  failed_payment_email: 'Relance impayé',
  onboarding_j0_email: 'Bienvenue J0',
  onboarding_j3_email: 'Suivi J+3',
  onboarding_j7_email: 'Engagement J+7',
  upsell_email: 'Upsell',
  support_auto_acces: 'Support accès',
  custom_automation: 'Automation personnalisée',
}

const PREMIUM_FEATURE_LABELS: Array<{ key: keyof DashboardData['premium_features']; label: string }> = [
  { key: 'f14', label: 'F14 · Pré-dunning CB' },
  { key: 'f15', label: 'F15 · Churn prédictif' },
  { key: 'f16', label: 'F16 · WhatsApp Business' },
  { key: 'f17', label: 'F17 · Rapport vidéo IA' },
  { key: 'f19', label: 'F19 · Coaching élèves' },
  { key: 'f20', label: 'F20 · SMS Twilio' },
]

function fmt(n: number, dec = 0): string {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

function relTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60) return `${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}j`
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [logs, setLogs] = useState<LogRow[]>([])
  const [loadingLogs, setLoadingLogs] = useState(true)

  useEffect(() => {
    api.get<DashboardData>('/api/dashboard').then(setData).catch(console.error)
    api.get<{ data: LogRow[] }>('/api/history?limit=5&status=sent')
      .then(r => setLogs(r.data ?? []))
      .catch(() => {})
      .finally(() => setLoadingLogs(false))
  }, [])

  if (!data) return (
    <div className="space-y-6 animate-fade-in">
      <div className="h-8 w-48 bg-muted rounded animate-pulse" />
      <div className="grid grid-cols-3 gap-4">
        {[0,1,2].map(i => <div key={i} className="h-32 bg-muted rounded-xl animate-pulse" />)}
      </div>
    </div>
  )

  const mrrTotal = data.mrr_total
  const barStd = mrrTotal > 0 ? (data.mrr_standard / mrrTotal * 100).toFixed(1) : '0'
  const barPrem = mrrTotal > 0 ? (data.mrr_premium / mrrTotal * 100).toFixed(1) : '0'
  const barOpt = mrrTotal > 0 ? (data.mrr_options / mrrTotal * 100).toFixed(1) : '0'

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Vue d&apos;ensemble</h1>
        <p className="text-sm text-muted-foreground mt-1">AEVUM APP — tableau de bord admin</p>
      </div>

      {data.pending_tasks > 0 && (
        <Link href="/clients" className="flex items-center justify-between rounded-lg border border-amber-500/40 bg-amber-500/8 px-4 py-3 text-sm hover:bg-amber-500/12 transition-colors group">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" />
            <span>
              <span className="font-medium text-amber-600 dark:text-amber-400">{data.pending_tasks} tâche{data.pending_tasks > 1 ? 's' : ''}</span>
              <span className="text-muted-foreground"> en attente de validation</span>
            </span>
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
        </Link>
      )}

      {/* Hero 3 blocs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* MRR */}
        <div className="card-elevated p-5 border-emerald-500/20">
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Revenu mensuel (MRR)</p>
          <p className="text-4xl font-extrabold text-emerald-500 tabular-nums">{fmt(mrrTotal)}€</p>
          <p className="text-xs text-muted-foreground mt-1">{data.clients} client{data.clients > 1 ? 's' : ''}{data.count_unpaid > 0 ? ` · ${data.count_unpaid} impayé` : ''}</p>
          <div className="flex h-2 rounded overflow-hidden mt-3">
            <div style={{ width: `${barStd}%` }} className="bg-indigo-500" title={`Standard ${data.mrr_standard}€`} />
            <div style={{ width: `${barPrem}%` }} className="bg-emerald-500" title={`Premium ${data.mrr_premium}€`} />
            <div style={{ width: `${barOpt}%` }} className="bg-amber-500" title={`Options ${data.mrr_options}€`} />
          </div>
          <div className="flex gap-3 mt-1.5 flex-wrap">
            <span className="text-[10px] text-indigo-400 flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-indigo-500 inline-block" />Std {fmt(data.mrr_standard)}€</span>
            <span className="text-[10px] text-emerald-400 flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500 inline-block" />Prem {fmt(data.mrr_premium)}€</span>
            <span className="text-[10px] text-amber-400 flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-500 inline-block" />Opt {fmt(data.mrr_options)}€</span>
          </div>
        </div>

        {/* Coûts */}
        <div className="card-elevated p-5 border-red-500/20">
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Coûts ce mois</p>
          <p className="text-4xl font-extrabold text-red-500 tabular-nums">-{fmt(data.cost_total_eur)}€</p>
          <div className="mt-3 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">IA Anthropic <span className="text-emerald-600 dark:text-emerald-400 text-[10px]">auto</span></span>
              <span className="font-medium">{fmt(data.cost_ai_eur, 2)}€</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Emails Resend <span className="text-emerald-600 dark:text-emerald-400 text-[10px]">auto</span></span>
              <span className="font-medium">{fmt(data.cost_emails_eur, 2)}€</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">
                Infra (Render+Vercel+SB)
                {data.cost_infra_eur === 0 && (
                  <Link href="/settings" className="ml-1 text-primary hover:underline text-[10px]">↗ définir</Link>
                )}
              </span>
              <span className="font-medium">{fmt(data.cost_infra_eur)}€</span>
            </div>
          </div>
        </div>

        {/* Profit net */}
        <div className="card-elevated p-5 border-2 border-emerald-500/30">
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Profit net <span className="normal-case text-[10px]">(hors taxes)</span></p>
          <p className="text-4xl font-extrabold text-emerald-500 tabular-nums">{fmt(data.profit_net_eur)}€</p>
          <div className="mt-3">
            <div className="h-2 bg-muted rounded overflow-hidden">
              <div className="h-full bg-emerald-500 rounded transition-all" style={{ width: `${Math.min(data.margin_pct, 100)}%` }} />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-xs text-muted-foreground">Marge</span>
              <span className="text-xs font-bold text-emerald-500">{fmt(data.margin_pct, 1)}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* 6 stats secondaires */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {[
          { label: 'Standard', value: data.count_standard, sub: `${fmt(data.mrr_standard)}€/m`, color: 'text-indigo-400' },
          { label: 'Premium', value: data.count_premium, sub: `${fmt(data.mrr_premium)}€/m`, color: 'text-emerald-400' },
          { label: 'Tâches', value: data.pending_tasks, sub: 'à valider', color: 'text-amber-400' },
          { label: 'Emails', value: data.emails_sent, sub: 'ce mois', color: 'text-blue-400' },
          { label: 'Impayés', value: data.count_unpaid, sub: data.count_unpaid > 0 ? `-${fmt(data.unpaid_amount)}€` : '—', color: data.count_unpaid > 0 ? 'text-red-400' : 'text-muted-foreground' },
          { label: 'Options', value: data.options_revenue.f11.count + data.options_revenue.f13.count + data.options_revenue.f18.count, sub: 'vendues', color: 'text-foreground' },
        ].map(({ label, value, sub, color }) => (
          <div key={label} className="card-elevated p-3 text-center">
            <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
            <p className="text-xs font-medium text-foreground mt-0.5">{label}</p>
            <p className="text-[10px] text-muted-foreground">{sub}</p>
          </div>
        ))}
      </div>

      {/* Coûts par client + options + features Premium */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Tableau par client — 3/5 */}
        <div className="lg:col-span-3 card-elevated overflow-hidden">
          <div className="px-4 py-3 border-b border-border/60">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Coût & profit par client</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">IA calculé auto via tokens · infra répartie équitablement</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/60 text-muted-foreground">
                  <th className="text-left px-4 py-2.5 font-medium">Client</th>
                  <th className="text-right px-3 py-2.5 font-medium">MRR</th>
                  <th className="text-right px-3 py-2.5 font-medium">IA</th>
                  <th className="text-right px-3 py-2.5 font-medium">Emails</th>
                  <th className="text-right px-3 py-2.5 font-medium">Infra</th>
                  <th className="text-right px-4 py-2.5 font-medium">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {data.client_costs.map(c => (
                  <tr key={c.id} className={c.payment_status === 'unpaid' ? 'opacity-60' : ''}>
                    <td className="px-4 py-3">
                      <Link href={`/clients/${c.id}`} className="font-medium hover:text-primary transition-colors">{c.name}</Link>
                      <p className={`text-[10px] mt-0.5 ${c.plan === 'premium' ? 'text-emerald-500' : 'text-indigo-400'}`}>
                        {c.plan === 'premium' ? 'Premium' : 'Standard'}
                        {c.addons.length > 0 && ` + ${c.addons.map(a => a.replace('addon_', '').toUpperCase()).join(' ')}`}
                      </p>
                    </td>
                    <td className={`px-3 py-3 text-right font-semibold tabular-nums ${c.payment_status === 'unpaid' ? 'text-red-400' : c.plan === 'premium' ? 'text-emerald-400' : 'text-indigo-400'}`}>
                      {fmt(c.mrr)}€
                    </td>
                    <td className="px-3 py-3 text-right text-muted-foreground tabular-nums">{c.cost_ai_eur > 0 ? `-${fmt(c.cost_ai_eur, 2)}€` : '—'}</td>
                    <td className="px-3 py-3 text-right text-muted-foreground tabular-nums">{c.cost_emails_eur > 0 ? `-${fmt(c.cost_emails_eur, 2)}€` : '—'}</td>
                    <td className="px-3 py-3 text-right text-muted-foreground tabular-nums">-{fmt(c.cost_infra_eur, 0)}€</td>
                    <td className={`px-4 py-3 text-right font-bold tabular-nums ${c.payment_status === 'unpaid' ? 'text-red-400' : 'text-emerald-400'}`}>
                      {c.payment_status === 'unpaid' ? 'impayé' : `${fmt(c.profit_net_eur ?? 0)}€`}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border/60 bg-muted/30">
                  <td className="px-4 py-2.5 text-muted-foreground">Total</td>
                  <td className="px-3 py-2.5 text-right font-bold text-emerald-400 tabular-nums">{fmt(data.mrr_total)}€</td>
                  <td className="px-3 py-2.5 text-right text-muted-foreground tabular-nums">-{fmt(data.cost_ai_eur, 2)}€</td>
                  <td className="px-3 py-2.5 text-right text-muted-foreground tabular-nums">-{fmt(data.cost_emails_eur, 2)}€</td>
                  <td className="px-3 py-2.5 text-right text-muted-foreground tabular-nums">-{fmt(data.cost_infra_eur, 0)}€</td>
                  <td className="px-4 py-2.5 text-right font-bold text-emerald-400 tabular-nums">{fmt(data.profit_net_eur)}€</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Options + Features — 2/5 */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* Options payantes */}
          <div className="card-elevated p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Options payantes</p>
            <p className="text-[10px] text-muted-foreground mb-3">Modules vendus en supplément</p>
            <div className="space-y-2.5">
              {[
                { key: 'f11', label: 'Abandons checkout', price: '+200€', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
                { key: 'f13', label: 'Récup. vocale IA', price: '+350€', color: 'bg-violet-500/10 text-violet-400 border-violet-500/20' },
                { key: 'f18', label: 'Module Notaire', price: '+149€/dos.', color: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
              ].map(({ key, label, price, color }) => {
                const opt = data.options_revenue[key as 'f11' | 'f13' | 'f18']
                return (
                  <div key={key} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`border rounded px-1.5 py-0.5 text-[10px] font-bold ${color}`}>{key.toUpperCase()}</span>
                      <div>
                        <p className="text-xs text-foreground">{label}</p>
                        <p className="text-[10px] text-muted-foreground">{price} · {opt.count} client{opt.count > 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <p className={`text-sm font-bold tabular-nums ${opt.count > 0 ? 'text-amber-400' : 'text-muted-foreground/40'}`}>{fmt(opt.revenue)}€</p>
                  </div>
                )
              })}
            </div>
            <div className="border-t border-border/60 mt-3 pt-2.5 flex justify-between">
              <span className="text-xs text-muted-foreground">Total options</span>
              <span className="text-sm font-bold text-amber-400">{fmt(data.mrr_options)}€</span>
            </div>
          </div>

          {/* Features Premium */}
          <div className="card-elevated p-4 flex-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Features Premium activées</p>
            <p className="text-[10px] text-muted-foreground mb-3">Sur {data.premium_count} client{data.premium_count > 1 ? 's' : ''} Premium — combien ont activé la feature</p>
            <div className="space-y-2">
              {PREMIUM_FEATURE_LABELS.map(({ key, label }) => {
                const count = data.premium_features[key]
                const total = data.premium_count
                const color = count === 0 ? 'text-muted-foreground/40' : count < total ? 'text-amber-400' : 'text-emerald-400'
                return (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        {Array.from({ length: Math.max(total, 1) }).map((_, i) => (
                          <span key={i} className={`w-2 h-2 rounded-full border ${i < count ? (count < total ? 'bg-amber-400 border-amber-400' : 'bg-emerald-400 border-emerald-400') : 'bg-transparent border-border'}`} />
                        ))}
                      </div>
                      <span className={`text-[10px] font-semibold ${color}`}>{count}/{total}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Activité récente */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Activité récente</h2>
          <Link href="/clients" className="text-xs text-primary hover:underline flex items-center gap-1">
            Voir les clients <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        {loadingLogs ? (
          <div className="space-y-2">{[0,1,2].map(i => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}</div>
        ) : logs.length === 0 ? (
          <div className="flex items-center justify-center py-10 border border-border/60 rounded-lg bg-card/40">
            <p className="text-sm text-muted-foreground">Aucune activité pour l&apos;instant</p>
          </div>
        ) : (
          <div className="border border-border/60 rounded-lg overflow-hidden divide-y divide-border/60 bg-card/40">
            {logs.map(log => (
              <div key={log.id} className="flex items-center justify-between px-4 py-2.5">
                <div className="min-w-0">
                  {log.clients?.name && (
                    <Link href={`/clients/${log.client_id}`} className="text-sm font-semibold hover:text-primary transition-colors">
                      {log.clients.name}
                    </Link>
                  )}
                  <p className="text-xs text-muted-foreground truncate">
                    {ACTION_LABELS[log.action_type] ?? log.action_type}
                    {log.payload_json?.to && ` · ${log.payload_json.to}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  <span className="text-xs text-muted-foreground">{relTime(log.created_at)}</span>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${log.status === 'sent' ? 'badge-sent' : 'badge-failed'}`}>
                    {log.status === 'sent' ? 'envoyé' : 'échoué'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
