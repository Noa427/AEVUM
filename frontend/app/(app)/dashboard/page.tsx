'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import Link from 'next/link'
import { Users, Clock, Mail, Activity, ArrowRight, TrendingUp } from 'lucide-react'

interface DashboardStats {
  clients: number
  pending_tasks: number
  emails_sent: number
}

interface LogRow {
  id: string
  action_type: string
  status: string
  created_at: string
  payload_json: Record<string, any>
  clients: { name: string } | null
}

const ACTION_LABELS: Record<string, string> = {
  failed_payment_email: 'Relance impayé',
  onboarding_j0_email: 'Bienvenue',
  onboarding_j3_email: 'Suivi J+3',
  onboarding_j7_email: 'Engagement J+7',
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [recentLogs, setRecentLogs] = useState<LogRow[]>([])

  useEffect(() => {
    api.get<DashboardStats>('/api/dashboard').then(setStats).catch(console.error)
    api.get<{ data: LogRow[] }>('/api/history?limit=5').then(r => setRecentLogs(r.data ?? [])).catch(() => {})
  }, [])

  return (
    <div className="space-y-8 animate-fade-in">
      {/* En-tête */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Vue d&apos;ensemble</h1>
        <p className="text-sm text-muted-foreground mt-1">Bienvenue sur AutomatePro — votre tableau de bord.</p>
      </div>

      {/* Alerte tâches en attente */}
      {stats?.pending_tasks ? (
        <Link
          href="/tasks"
          className="flex items-center justify-between rounded-lg border border-amber-500/40 bg-amber-500/8 px-4 py-3 text-sm hover:bg-amber-500/12 transition-colors group"
        >
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" />
            <span>
              <span className="font-medium text-amber-600 dark:text-amber-400">{stats.pending_tasks} tâche{stats.pending_tasks > 1 ? 's' : ''}</span>
              <span className="text-muted-foreground"> en attente de traitement</span>
            </span>
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
        </Link>
      ) : null}

      {/* Cards statistiques */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Clients actifs"
          value={stats?.clients}
          icon={Users}
          color="blue"
        />
        <StatCard
          title="Tâches en attente"
          value={stats?.pending_tasks}
          icon={Clock}
          color="amber"
          highlight={!!stats?.pending_tasks}
        />
        <StatCard
          title="Emails envoyés"
          value={stats?.emails_sent}
          icon={Mail}
          color="green"
        />
      </div>

      {/* Activité récente */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Activité récente</h2>
          <Link href="/history" className="text-xs text-primary hover:underline flex items-center gap-1">
            Tout voir <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {recentLogs.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-12 text-center border border-border/60 rounded-lg bg-card/40">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-3">
              <Activity className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">Aucune activité pour l&apos;instant</p>
            <p className="text-xs text-muted-foreground mt-1">Les emails envoyés apparaîtront ici.</p>
          </div>
        ) : (
          <div className="border border-border/60 rounded-lg overflow-hidden divide-y divide-border/60 bg-card/40">
            {recentLogs.map(log => (
              <div key={log.id} className="flex items-center justify-between px-4 py-3 list-row">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{log.clients?.name ?? '—'}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {ACTION_LABELS[log.action_type] ?? log.action_type}
                    {' · '}
                    {new Date(log.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </p>
                  {log.payload_json?.to && (
                    <p className="text-xs text-muted-foreground truncate">{log.payload_json.to}</p>
                  )}
                </div>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium flex-shrink-0 ml-3 ${
                  log.status === 'sent' ? 'badge-sent' : 'badge-failed'
                }`}>
                  {log.status === 'sent' ? 'envoyé' : 'échoué'}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

const iconColors: Record<string, string> = {
  blue:  'bg-blue-500/10 text-blue-500 dark:bg-blue-500/15 dark:text-blue-400',
  amber: 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
  green: 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
}

function StatCard({
  title,
  value,
  icon: Icon,
  color = 'blue',
  highlight,
}: {
  title: string
  value: number | undefined
  icon: React.ElementType
  color?: string
  highlight?: boolean
}) {
  const isLoading = value === undefined

  return (
    <div className={`card-elevated p-5 ${highlight ? 'border border-amber-500/30' : ''}`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconColors[color]}`}>
          <Icon className="w-4 h-4" />
        </div>
        {!isLoading && value > 0 && (
          <TrendingUp className="w-3.5 h-3.5 text-emerald-500 opacity-70" />
        )}
      </div>
      {isLoading ? (
        <>
          <div className="skeleton h-8 w-16 mb-1.5" />
          <div className="skeleton h-3 w-24" />
        </>
      ) : (
        <>
          <p className="text-3xl font-semibold tabular-nums">{value}</p>
          <p className="text-xs text-muted-foreground mt-1">{title}</p>
        </>
      )}
    </div>
  )
}

