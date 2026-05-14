'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface LogRow {
  id: string
  action_type: string
  status: string
  created_at: string
  payload_json: Record<string, any>
  clients: { name: string } | null
}

interface PaginatedLogs {
  data: LogRow[]
  total: number
  page: number
  limit: number
}

interface Client { id: string; name: string }

export default function HistoryPage() {
  const [logs, setLogs] = useState<LogRow[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [selectedLog, setSelectedLog] = useState<LogRow | null>(null)
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterClient, setFilterClient] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const limit = 20

  useEffect(() => {
    api.get<Client[]>('/api/clients').then(setClients).catch(() => {})
  }, [])

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) })
    if (filterStatus !== 'all') params.set('status', filterStatus)
    if (filterClient) params.set('client_id', filterClient)
    if (dateFrom) params.set('date_from', new Date(dateFrom).toISOString())
    if (dateTo) {
      const end = new Date(dateTo)
      end.setHours(23, 59, 59, 999)
      params.set('date_to', end.toISOString())
    }

    api.get<PaginatedLogs>(`/api/history?${params}`)
      .then(res => { setLogs(res.data ?? []); setTotal(res.total ?? 0) })
      .catch(() => {})
  }, [filterStatus, filterClient, dateFrom, dateTo, page])

  const ACTION_LABELS: Record<string, string> = {
    failed_payment_email: 'Relance impayé',
    onboarding_j0_email: 'Bienvenue',
    onboarding_j3_email: 'Suivi J+3',
    onboarding_j7_email: 'Engagement J+7',
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Historique</h1>

      <div className="flex gap-3 flex-wrap">
        <select
          value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value); setPage(1) }}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        >
          <option value="all">Tous les statuts</option>
          <option value="sent">Envoyé</option>
          <option value="failed">Échoué</option>
        </select>
        <select
          value={filterClient}
          onChange={e => { setFilterClient(e.target.value); setPage(1) }}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        >
          <option value="">Tous les clients</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={e => { setDateFrom(e.target.value); setPage(1) }}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          title="Du"
        />
        <input
          type="date"
          value={dateTo}
          onChange={e => { setDateTo(e.target.value); setPage(1) }}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          title="Au"
        />
        {(filterStatus !== 'all' || filterClient || dateFrom || dateTo) && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterStatus('all'); setFilterClient(''); setDateFrom(''); setDateTo(''); setPage(1) }}>
            Réinitialiser
          </Button>
        )}
      </div>

      {logs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun résultat.</p>
      ) : (
        <>
          <div className="border border-border rounded-lg divide-y divide-border">
            {logs.map(log => (
              <div key={log.id} className="flex items-center justify-between px-4 py-3 list-row">
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
                <div className="flex items-center gap-2">
                  <Badge variant={log.status === 'sent' ? 'default' : 'destructive'}>
                    {log.status === 'sent' ? 'envoyé' : 'échoué'}
                  </Badge>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedLog(log)}>
                    Détails
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{total} entrée{total > 1 ? 's' : ''}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  ← Précédent
                </Button>
                <span className="px-2 py-1">{page} / {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                  Suivant →
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Détails — {ACTION_LABELS[selectedLog?.action_type ?? ''] ?? selectedLog?.action_type}</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-3 text-sm">
              <div className="flex gap-2">
                <span className="text-muted-foreground">Client :</span>
                <span>{selectedLog.clients?.name ?? '—'}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground">Date :</span>
                <span>{new Date(selectedLog.created_at).toLocaleString('fr-FR')}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground">Statut :</span>
                <Badge variant={selectedLog.status === 'sent' ? 'default' : 'destructive'}>
                  {selectedLog.status}
                </Badge>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Payload :</p>
                <pre className="bg-muted rounded p-3 text-xs overflow-auto">
                  {JSON.stringify(selectedLog.payload_json, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
