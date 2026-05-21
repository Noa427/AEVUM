'use client'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { ClientForm } from '@/components/client-form'
import { TaskDrawer } from '@/components/task-drawer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface Client {
  id: string
  name: string
  email: string
  created_at: string
  auto_mode: boolean
}

interface Task {
  id: string
  task_type: string
  context_json: Record<string, any>
  prompt_template: string | null
  created_at: string
  clients: { name: string; email: string } | null
}

interface LogRow {
  id: string
  action_type: string
  status: string
  created_at: string
  payload_json: Record<string, any>
}

interface PilierConfigs {
  support_email_enabled: string
  support_auto_reply: string
  politique_remboursement: string
  upsell_enabled: string
  upsell_product_name: string
  upsell_url: string
  upsell_price: string
}

type Tab = 'tasks' | 'history' | 'settings'

const TYPE_LABELS: Record<string, string> = {
  failed_payment: 'Impayé',
  onboarding_j0: 'Onboarding J0',
  onboarding_j3: 'Onboarding J+3',
  onboarding_j7: 'Onboarding J+7',
  upsell: 'Upsell',
  support_manual: 'Support IA',
}

const TYPE_BADGE_CLASS: Record<string, string> = {
  failed_payment: 'badge-failed-payment',
  onboarding_j0: 'badge-onboarding-j0',
  onboarding_j3: 'badge-onboarding-j3',
  onboarding_j7: 'badge-onboarding-j7',
  upsell: 'badge-upsell',
  support_manual: 'badge-support',
}

const ACTION_LABELS: Record<string, string> = {
  failed_payment_email: 'Relance impayé',
  onboarding_email: 'Email onboarding',
  onboarding_j0_email: 'Bienvenue J0',
  onboarding_j3_email: 'Suivi J+3',
  onboarding_j7_email: 'Engagement J+7',
  upsell_email: 'Upsell',
  support_reply: 'Réponse support',
}

function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `il y a ${minutes}min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `il y a ${hours}h`
  return `il y a ${Math.floor(hours / 24)}j`
}

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('tasks')

  const [client, setClient] = useState<Client | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [logs, setLogs] = useState<LogRow[]>([])
  const [configs, setConfigs] = useState<Partial<PilierConfigs>>({})
  const [configsLoaded, setConfigsLoaded] = useState(false)

  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [showEdit, setShowEdit] = useState(false)
  const [showWebhook, setShowWebhook] = useState(false)
  const [savingConfigs, setSavingConfigs] = useState(false)

  const loadClient = useCallback(async () => {
    try {
      const data = await api.get<Client>(`/api/clients/${id}`)
      setClient(data)
    } catch {
      router.push('/clients')
    }
  }, [id, router])

  const loadTasks = useCallback(async () => {
    try {
      const res = await api.get<{ data: Task[] }>(`/api/tasks?client_id=${id}&status=pending&limit=50`)
      setTasks(res.data ?? [])
    } catch {}
  }, [id])

  const loadHistory = useCallback(async () => {
    try {
      const res = await api.get<{ data: LogRow[] }>(`/api/history?client_id=${id}&limit=50`)
      setLogs(res.data ?? [])
    } catch {}
  }, [id])

  const loadConfigs = useCallback(async () => {
    if (configsLoaded) return
    try {
      const data = await api.get<Partial<PilierConfigs>>(`/api/clients/${id}/configs`)
      setConfigs(data)
      setConfigsLoaded(true)
    } catch {}
  }, [id, configsLoaded])

  useEffect(() => { loadClient() }, [loadClient])
  useEffect(() => { loadTasks() }, [loadTasks])
  useEffect(() => { if (tab === 'history') loadHistory() }, [tab, loadHistory])
  useEffect(() => { if (tab === 'settings') loadConfigs() }, [tab, loadConfigs])

  async function handleDelete() {
    if (!confirm(`Supprimer le client "${client?.name}" ? Cette action est irréversible.`)) return
    try {
      await api.delete(`/api/clients/${id}`)
      toast.success('Client supprimé')
      router.push('/clients')
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de la suppression')
    }
  }

  function setConfig(key: keyof PilierConfigs, value: string) {
    setConfigs(c => ({ ...c, [key]: value }))
  }

  async function saveConfigs() {
    setSavingConfigs(true)
    try {
      await api.put(`/api/clients/${id}/configs`, configs)
      toast.success('Configuration enregistrée')
    } catch (err: any) {
      toast.error(err.message || 'Erreur')
    } finally {
      setSavingConfigs(false)
    }
  }

  if (!client) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
        Chargement...
      </div>
    )
  }

  const initials = client.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Breadcrumb + actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/clients" className="hover:text-foreground transition-colors">Clients</Link>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
          </svg>
          <span className="text-foreground font-medium">{client.name}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={() => setShowWebhook(true)} className="text-xs gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
            </svg>
            Webhook
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowEdit(true)} className="text-xs gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
            </svg>
            Modifier
          </Button>
          <Button variant="ghost" size="sm" onClick={handleDelete} className="text-xs gap-1.5 text-muted-foreground hover:text-destructive">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
            Supprimer
          </Button>
        </div>
      </div>

      {/* En-tête client */}
      <div className="card-elevated p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
          <span className="text-sm font-bold text-primary">{initials}</span>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold">{client.name}</h1>
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold badge-sent">actif</span>
            {tasks.length > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] badge-pending rounded-full px-1.5 py-0.5">
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
                </svg>
                {tasks.length} tâche{tasks.length > 1 ? 's' : ''} en attente
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{client.email}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Client depuis le {new Date(client.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
            {' · '}Mode {client.auto_mode ? 'automatique' : 'manuel'}
          </p>
        </div>
      </div>

      {/* Onglets */}
      <div className="border-b border-border/60">
        <nav className="flex gap-1 -mb-px">
          {([
            { key: 'tasks', label: `Tâches en attente${tasks.length > 0 ? ` (${tasks.length})` : ''}` },
            { key: 'history', label: 'Historique' },
            { key: 'settings', label: 'Paramètres' },
          ] as { key: Tab; label: string }[]).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab : Tâches en attente */}
      {tab === 'tasks' && (
        tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center border border-border/60 rounded-xl bg-card/40">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
              </svg>
            </div>
            <p className="text-sm font-medium">Aucune tâche en attente</p>
            <p className="text-xs text-muted-foreground mt-1">Les tâches apparaîtront ici à chaque événement Stripe.</p>
          </div>
        ) : (
          <div className="border border-border/60 rounded-xl overflow-hidden divide-y divide-border/60 bg-card/30">
            {tasks.map(task => (
              <div
                key={task.id}
                className="flex items-center justify-between px-4 py-3.5 list-row cursor-pointer hover:bg-accent/40 transition-colors"
                onClick={() => setSelectedTask(task)}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TYPE_BADGE_CLASS[task.task_type] ?? 'badge-pending'}`}>
                      {TYPE_LABELS[task.task_type] ?? task.task_type}
                    </span>
                    {task.context_json.customer_name && (
                      <span className="text-sm font-medium">{task.context_json.customer_name}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {task.context_json.customer_email && (
                      <p className="text-xs text-muted-foreground truncate">{task.context_json.customer_email}</p>
                    )}
                    {task.context_json.amount !== undefined && (
                      <span className="text-xs text-muted-foreground">{task.context_json.amount}€</span>
                    )}
                    <span className="text-xs text-muted-foreground">{relativeTime(task.created_at)}</span>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="text-xs flex-shrink-0 ml-3">
                  Traiter
                </Button>
              </div>
            ))}
          </div>
        )
      )}

      {/* Tab : Historique */}
      {tab === 'history' && (
        logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center border border-border/60 rounded-xl bg-card/40">
            <p className="text-sm font-medium text-muted-foreground">Aucun historique pour ce client.</p>
          </div>
        ) : (
          <div className="border border-border/60 rounded-xl overflow-hidden divide-y divide-border/60 bg-card/30">
            {logs.map(log => (
              <div key={log.id} className="flex items-center justify-between px-4 py-3 list-row">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{ACTION_LABELS[log.action_type] ?? log.action_type}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {log.payload_json?.to && (
                      <p className="text-xs text-muted-foreground truncate">{log.payload_json.to}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {new Date(log.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium flex-shrink-0 ml-3 ${
                  log.status === 'sent' ? 'badge-sent' : 'badge-failed'
                }`}>
                  {log.status === 'sent' ? 'envoyé' : 'échoué'}
                </span>
              </div>
            ))}
          </div>
        )
      )}

      {/* Tab : Paramètres */}
      {tab === 'settings' && (
        <div className="space-y-6">

          {/* Pilier 3 — Support */}
          <div className="card-elevated p-5 space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <h3 className="text-sm font-semibold">Pilier 3 — Support client IA</h3>
            </div>
            <div className="space-y-3 pl-4 border-l border-border/60">
              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <span className="text-sm text-muted-foreground">Activer le support email</span>
                <input
                  type="checkbox"
                  checked={configs.support_email_enabled === 'true'}
                  onChange={e => setConfig('support_email_enabled', e.target.checked ? 'true' : 'false')}
                  className="w-4 h-4 accent-primary"
                />
              </label>
              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <span className="text-sm text-muted-foreground">Réponse automatique</span>
                <input
                  type="checkbox"
                  checked={configs.support_auto_reply !== 'false'}
                  onChange={e => setConfig('support_auto_reply', e.target.checked ? 'true' : 'false')}
                  className="w-4 h-4 accent-primary"
                />
              </label>
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Politique de remboursement</p>
                <textarea
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-y focus:outline-none focus:ring-2 focus:ring-ring/50"
                  placeholder="Ex: Remboursement possible sous 30 jours..."
                  value={configs.politique_remboursement ?? ''}
                  onChange={e => setConfig('politique_remboursement', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Pilier 4 — Upsell */}
          <div className="card-elevated p-5 space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              <h3 className="text-sm font-semibold">Pilier 4 — Upsell automatique J+30</h3>
            </div>
            <div className="space-y-3 pl-4 border-l border-border/60">
              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <span className="text-sm text-muted-foreground">Activer l&apos;upsell automatique</span>
                <input
                  type="checkbox"
                  checked={configs.upsell_enabled === 'true'}
                  onChange={e => setConfig('upsell_enabled', e.target.checked ? 'true' : 'false')}
                  className="w-4 h-4 accent-primary"
                />
              </label>
              <Input
                placeholder="Nom de l'offre (ex: Masterclass avancée)"
                value={configs.upsell_product_name ?? ''}
                onChange={e => setConfig('upsell_product_name', e.target.value)}
              />
              <Input
                placeholder="URL de la page de vente"
                value={configs.upsell_url ?? ''}
                onChange={e => setConfig('upsell_url', e.target.value)}
              />
              <Input
                placeholder="Prix affiché (ex: 297€)"
                value={configs.upsell_price ?? ''}
                onChange={e => setConfig('upsell_price', e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={saveConfigs} disabled={savingConfigs} className="btn-glow">
              {savingConfigs ? 'Enregistrement...' : 'Enregistrer les paramètres'}
            </Button>
          </div>
        </div>
      )}

      {/* TaskDrawer */}
      <TaskDrawer
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onSent={() => { setSelectedTask(null); loadTasks() }}
      />

      {/* Modal Modifier */}
      <ClientForm
        open={showEdit}
        initialData={client}
        onClose={() => setShowEdit(false)}
        onCreated={() => { setShowEdit(false); loadClient() }}
      />

      {/* Modal Webhook */}
      <Dialog open={showWebhook} onOpenChange={() => setShowWebhook(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>URL Webhook Stripe — {client.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Collez cette URL dans Stripe → Webhooks → Ajouter un endpoint.
            </p>
            <div className="bg-muted rounded-lg p-3 text-sm font-mono break-all select-all border border-border/60">
              {API_URL}/api/webhooks/stripe/{client.id}
            </div>
            <p className="text-xs text-muted-foreground">
              Événements :{' '}
              <code className="bg-muted px-1 py-0.5 rounded text-xs">invoice.payment_failed</code>
              {', '}
              <code className="bg-muted px-1 py-0.5 rounded text-xs">checkout.session.completed</code>
            </p>
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => navigator.clipboard.writeText(`${API_URL}/api/webhooks/stripe/${client.id}`)}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
              </svg>
              Copier l&apos;URL
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
