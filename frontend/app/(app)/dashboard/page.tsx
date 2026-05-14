'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'

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
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Clients actifs" value={stats?.clients} />
        <StatCard
          title="Tâches en attente"
          value={stats?.pending_tasks}
          highlight={!!stats?.pending_tasks}
        />
        <StatCard title="Emails envoyés" value={stats?.emails_sent} />
      </div>

      {stats?.pending_tasks ? (
        <Link
          href="/tasks"
          className="block rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm hover:bg-amber-500/15 transition-colors"
        >
          {stats.pending_tasks} tâche{stats.pending_tasks > 1 ? 's' : ''} en attente →
        </Link>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Activité récente</h2>
        {recentLogs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune activité pour l'instant.</p>
        ) : (
          <div className="border border-border rounded-lg divide-y divide-border">
            {recentLogs.map(log => (
              <div key={log.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{log.clients?.name ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">
                    {ACTION_LABELS[log.action_type] ?? log.action_type} ·{' '}
                    {new Date(log.created_at).toLocaleString('fr-FR')}
                  </p>
                  {log.payload_json?.to && (
                    <p className="text-xs text-muted-foreground">{log.payload_json.to}</p>
                  )}
                </div>
                <Badge variant={log.status === 'sent' ? 'default' : 'destructive'}>
                  {log.status === 'sent' ? 'envoyé' : 'échoué'}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function StatCard({ title, value, highlight }: { title: string; value: number | undefined; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-5 card-elevated ${highlight ? 'border border-amber-500/40' : ''}`}>
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="text-3xl font-semibold mt-2">
        {value === undefined ? <span className="text-muted-foreground text-xl">—</span> : value}
      </p>
    </div>
  )
}
