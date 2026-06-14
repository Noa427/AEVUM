'use client'
import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface BusinessReport {
  id: string
  content: string
  metrics_json: Record<string, any>
  created_at: string
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function ReportsPage() {
  const [reports, setReports] = useState<BusinessReport[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<BusinessReport | null>(null)
  const [generating, setGenerating] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ data: BusinessReport[] }>('/api/reports?limit=50')
      setReports(res.data ?? [])
    } catch {} finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function generateNow() {
    setGenerating(true)
    try {
      const report = await api.post<BusinessReport>('/api/reports/generate', {})
      toast.success('Rapport généré')
      setReports(rs => [report, ...rs])
      setSelected(report)
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de la génération')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rapports business</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Analyse hebdomadaire IA — MRR, churn, anomalies, recommandations.
          </p>
        </div>
        <Button onClick={generateNow} disabled={generating} className="btn-glow gap-1.5 flex-shrink-0">
          {generating ? <><span className="spinner" /> Génération…</> : 'Générer maintenant'}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-1 border border-border/60 rounded-xl overflow-hidden divide-y divide-border/60 bg-card/30">
          {loading ? (
            <div className="space-y-2 p-3">{[0, 1, 2].map(i => <div key={i} className="h-12 bg-muted rounded-lg animate-pulse" />)}</div>
          ) : reports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <p className="text-sm font-medium">Aucun rapport</p>
              <p className="text-xs text-muted-foreground mt-1">Le premier rapport sera généré le lundi à 10h UTC, ou cliquez sur « Générer maintenant ».</p>
            </div>
          ) : (
            reports.map(r => (
              <div
                key={r.id}
                className={`px-4 py-3 cursor-pointer hover:bg-accent/40 transition-colors ${selected?.id === r.id ? 'bg-accent/60' : ''}`}
                onClick={() => setSelected(r)}
              >
                <p className="text-sm font-medium">{formatDate(r.created_at)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  MRR {r.metrics_json?.mrr_total ?? '—'}€ · Profit net {r.metrics_json?.profit_net_eur ?? '—'}€
                </p>
              </div>
            ))
          )}
        </div>

        <div className="md:col-span-2 border border-border/60 rounded-xl bg-card/30 p-5">
          {selected ? (
            <div>
              <p className="text-xs text-muted-foreground mb-3">{formatDate(selected.created_at)}</p>
              <div className="text-sm whitespace-pre-wrap leading-relaxed">{selected.content}</div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full py-12 text-center">
              <p className="text-sm text-muted-foreground">Sélectionnez un rapport pour l&apos;afficher.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
