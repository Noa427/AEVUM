'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

interface DashboardStats {
  clients: number
  pending_tasks: number
  emails_sent: number
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)

  useEffect(() => {
    api.get<DashboardStats>('/api/dashboard').then(setStats).catch(console.error)
  }, [])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Clients actifs" value={stats?.clients} />
        <StatCard title="Tâches en attente" value={stats?.pending_tasks} />
        <StatCard title="Emails envoyés" value={stats?.emails_sent} />
      </div>
    </div>
  )
}

function StatCard({ title, value }: { title: string; value: number | undefined }) {
  return (
    <div className="border border-border rounded-lg p-5">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="text-3xl font-semibold mt-2">
        {value === undefined ? <span className="text-muted-foreground text-xl">—</span> : value}
      </p>
    </div>
  )
}
