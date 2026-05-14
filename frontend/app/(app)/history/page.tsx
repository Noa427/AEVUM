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
  const hasFilters = filterStatus !== 'all' || filterClient || dateFrom || dateTo

  const selectClass = "rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 transition-shadow"

  return (
    <div className="space-y-6 animate-fade-in">
      {/* En-tête */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Historique</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {total > 0 ? `${total} entrée${total > 1 ? 's' : ''} au total` : 'Tous les emails envoyés par AutomatePro'}
        </p>
      </div>

      {/* Filtres */}
      <div className="flex gap-2 flex-wrap items-center">
        <select
          value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value); setPage(1) }}
          className={selectClass}
        >
          <option value="all">Tous les statuts</option>
          <option value="sent">✓ Envoyé</option>
          <option value="failed">✗ Échoué</option>
        </select>

        <select
          value={filterClient}
          onChange={e => { setFilterClient(e.target.value); setPage(1) }}
          className={selectClass}
        >
          <option value="">Tous les clients</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Du</span>
          <input
            type="date"
            value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setPage(1) }}
            className={selectClass}
          />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">au</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => { setDateTo(e.target.value); setPage(1) }}
            className={selectClass}
          />
        </div>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setFilterStatus('all'); setFilterClient(''); setDateFrom(''); setDateTo(''); setPage(1) }}
            className="text-muted-foreground gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
            Réinitialiser
          </Button>
        )}
      </div>

      {/* Liste ou empty state */}
      {logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border border-border/60 rounded-xl bg-card/40">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
            </svg>
          </div>
          <p className="text-sm font-semibold text-foreground mb-1">
            {hasFilters ? "Aucun résultat pour ces filtres" : "Aucun historique pour l'instant"}
          </p>
          <p className="text-xs text-muted-foreground max-w-xs">
            {hasFilters ? 'Essayez de modifier ou réinitialiser vos filtres.' : 'Les emails envoyés apparaîtront ici.'}
          </p>
        </div>
      ) : (
        <>
          <div className="border border-border/60 rounded-xl overflow-hidden divide-y divide-border/60 bg-card/30">
            {logs.map((log, idx) => (
              <div
                key={log.id}
                className={`flex items-center justify-between px-4 py-3.5 list-row ${idx % 2 === 1 ? 'bg-muted/20' : ''}`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{log.clients?.name ?? '—'}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {ACTION_LABELS[log.action_type] ?? log.action_type}
                    {' · '}
                    {new Date(log.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </p>
                  {log.payload_json?.to && (
                    <p className="text-xs text-muted-foreground truncate">{log.payload_json.to}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    log.status === 'sent' ? 'badge-sent' : 'badge-failed'
                  }`}>
                    {log.status === 'sent' ? '✓ envoyé' : '✗ échoué'}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedLog(log)} className="text-xs text-muted-foreground hover:text-foreground gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    Détails
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Page {page} sur {totalPages} · {total} entrée{total > 1 ? 's' : ''}
              </span>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
                  </svg>
                  Précédent
                </Button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const p = page <= 3 ? i + 1 : page - 2 + i
                  if (p < 1 || p > totalPages) return null
                  return (
                    <Button key={p} variant={p === page ? 'default' : 'outline'} size="sm" onClick={() => setPage(p)} className="w-8 h-8 p-0">
                      {p}
                    </Button>
                  )
                })}
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="gap-1">
                  Suivant
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                  </svg>
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal détails */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Détails — {ACTION_LABELS[selectedLog?.action_type ?? ''] ?? selectedLog?.action_type}</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 bg-muted/40 rounded-lg p-4 border border-border/40">
                <span className="text-xs text-muted-foreground">Client</span>
                <span className="text-xs font-medium">{selectedLog.clients?.name ?? '—'}</span>
                <span className="text-xs text-muted-foreground">Date</span>
                <span className="text-xs font-medium">{new Date(selectedLog.created_at).toLocaleString('fr-FR')}</span>
                <span className="text-xs text-muted-foreground">Statut</span>
                <span className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-semibold ${selectedLog.status === 'sent' ? 'badge-sent' : 'badge-failed'}`}>
                  {selectedLog.status === 'sent' ? '✓ envoyé' : '✗ échoué'}
                </span>
                {selectedLog.payload_json?.to && (<>
                  <span className="text-xs text-muted-foreground">Destinataire</span>
                  <span className="text-xs font-medium truncate">{selectedLog.payload_json.to}</span>
                </>)}
                {selectedLog.payload_json?.subject && (<>
                  <span className="text-xs text-muted-foreground">Objet</span>
                  <span className="text-xs font-medium">{selectedLog.payload_json.subject}</span>
                </>)}
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-2 font-medium">Payload JSON</p>
                <pre className="bg-muted/60 border border-border/60 rounded-lg p-3 text-xs overflow-auto max-h-60 font-mono leading-relaxed">
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
