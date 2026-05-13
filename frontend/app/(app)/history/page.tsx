'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'

interface LogRow {
  id: string
  action_type: string
  status: string
  created_at: string
  payload_json: Record<string, any>
  clients: { name: string } | null
}

export default function HistoryPage() {
  const [logs, setLogs] = useState<LogRow[]>([])

  useEffect(() => {
    api.get<LogRow[]>('/api/history').then(setLogs).catch(() => {})
  }, [])

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Historique</h1>
      {logs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun envoi pour l'instant.</p>
      ) : (
        <div className="border border-border rounded-lg divide-y divide-border">
          {logs.map(log => (
            <div key={log.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium">{log.clients?.name ?? '—'}</p>
                <p className="text-xs text-muted-foreground">
                  {log.action_type} · {new Date(log.created_at).toLocaleString('fr-FR')}
                </p>
                {log.payload_json?.to && (
                  <p className="text-xs text-muted-foreground">{log.payload_json.to}</p>
                )}
              </div>
              <Badge variant={log.status === 'sent' ? 'default' : 'destructive'}>
                {log.status}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
