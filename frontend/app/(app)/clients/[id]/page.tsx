'use client'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { ClientForm } from '@/components/client-form'
import { SubscriptionModal } from '@/components/subscription-modal'
import { TaskDrawer } from '@/components/task-drawer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Check, Copy, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface Client {
  id: string
  name: string
  email: string
  created_at: string
  auto_mode: boolean
  plan: 'standard' | 'premium'
  payment_status: 'active' | 'unpaid'
  mrr: number
  student_count: number
  emails_sent_total: number
  ai_cost_eur_month: number
  last_activity: string | null
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
  addon_f11: string
  addon_f13: string
  addon_f18: string
}

type Tab = 'tasks' | 'history' | 'settings'
type HistoryFilter = 'all' | 'onboarding' | 'relance' | 'upsell' | 'custom'

const TYPE_LABELS: Record<string, string> = {
  failed_payment: 'Relance paiement',
  onboarding_j0: 'Onboarding J0',
  onboarding_j3: 'Onboarding J+3',
  onboarding_j7: 'Onboarding J+7',
  upsell: 'Upsell',
  support_manual: 'Support IA',
  custom_automation: 'Personnalisée',
}

const TYPE_BADGE_CLASS: Record<string, string> = {
  failed_payment: 'badge-failed-payment',
  onboarding_j0: 'badge-onboarding-j0',
  onboarding_j3: 'badge-onboarding-j3',
  onboarding_j7: 'badge-onboarding-j7',
  upsell: 'badge-upsell',
  support_manual: 'badge-support',
  custom_automation: 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-secondary text-secondary-foreground border border-border/60',
}

const ACTION_LABELS: Record<string, string> = {
  failed_payment_email: 'Relance impayé',
  onboarding_j0_email: 'Bienvenue J0',
  onboarding_j3_email: 'Suivi J+3',
  onboarding_j7_email: 'Engagement J+7',
  upsell_email: 'Upsell',
  support_reply: 'Réponse support',
  custom_automation: 'Automation personnalisée',
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `il y a ${minutes}min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `il y a ${hours}h`
  return `il y a ${Math.floor(hours / 24)}j`
}

function filterLogs(logs: LogRow[], filter: HistoryFilter): LogRow[] {
  if (filter === 'all') return logs
  if (filter === 'onboarding') return logs.filter(l => l.action_type.includes('onboarding'))
  if (filter === 'relance') return logs.filter(l => l.action_type.includes('payment') || l.action_type.includes('relance'))
  if (filter === 'upsell') return logs.filter(l => l.action_type.includes('upsell'))
  if (filter === 'custom') return logs.filter(l => l.action_type === 'custom_automation')
  return logs
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
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all')

  // Header copy button
  const [copiedHeader, setCopiedHeader] = useState(false)

  // Settings inline edit
  const [editingField, setEditingField] = useState<'name' | 'email' | null>(null)
  const [editValue, setEditValue] = useState('')
  const [savingField, setSavingField] = useState(false)

  // Settings stripe section
  const [webhookSecretInput, setWebhookSecretInput] = useState('')
  const [savingWebhook, setSavingWebhook] = useState(false)
  const [copiedSettings, setCopiedSettings] = useState(false)

  // Piliers save
  const [savingConfigs, setSavingConfigs] = useState(false)

  // Abonnement
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false)

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
      const res = await api.get<{ data: LogRow[] }>(`/api/history?client_id=${id}&limit=100`)
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
  useEffect(() => { loadConfigs() }, [loadConfigs])

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

  function copyWebhook(onCopied: () => void) {
    navigator.clipboard.writeText(`${API_URL}/api/webhooks/${client!.id}`)
    onCopied()
  }

  function startEdit(field: 'name' | 'email') {
    setEditingField(field)
    setEditValue(client![field])
  }

  async function saveEdit() {
    if (!editingField) return
    setSavingField(true)
    try {
      const payload = { name: client!.name, email: client!.email, [editingField]: editValue }
      await api.put(`/api/clients/${id}`, payload)
      setClient(c => c ? { ...c, [editingField!]: editValue } : c)
      setEditingField(null)
      toast.success('Mis à jour')
    } catch (err: any) {
      toast.error(err.message || 'Erreur')
    } finally {
      setSavingField(false)
    }
  }

  async function saveWebhookSecret() {
    if (!webhookSecretInput.trim()) return
    setSavingWebhook(true)
    try {
      await api.put(`/api/clients/${id}`, { name: client!.name, email: client!.email, stripe_webhook_secret: webhookSecretInput })
      setWebhookSecretInput('')
      toast.success('Secret Stripe mis à jour')
    } catch (err: any) {
      toast.error(err.message || 'Erreur')
    } finally {
      setSavingWebhook(false)
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
  const webhookUrl = `${API_URL}/api/webhooks/${client.id}`
  const filteredLogs = filterLogs(logs, historyFilter)

  const selectClass = "rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 transition-shadow"

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
          {/* Badge Stripe */}
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Stripe connecté
          </span>
          {/* Copy webhook URL */}
          <Button
            variant="outline"
            size="sm"
            className="text-xs gap-1.5"
            onClick={() => copyWebhook(() => { setCopiedHeader(true); setTimeout(() => setCopiedHeader(false), 2000) })}
          >
            {copiedHeader ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedHeader ? 'Copié ✓' : 'Copier URL webhook'}
          </Button>
          <Button variant="outline" size="sm" asChild className="text-xs gap-1.5">
            <a href={`mailto:${client.email}`}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
              </svg>
              Contacter
            </a>
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

      {/* Stats condensées */}
      <div className="card-elevated p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Paiement</p>
          <p className={`text-sm font-semibold mt-0.5 ${client.payment_status === 'active' ? 'text-emerald-400' : 'text-red-400'}`}>
            {client.payment_status === 'active' ? '✓ Actif' : '✗ Impayé'}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Élèves</p>
          <p className="text-sm font-semibold mt-0.5">{client.student_count}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Emails envoyés</p>
          <p className="text-sm font-semibold mt-0.5">{client.emails_sent_total}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Revenu (MRR)</p>
          <p className="text-sm font-semibold mt-0.5">{client.mrr.toLocaleString('fr-FR')}€</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Coût IA (mois)</p>
          <p className="text-sm font-semibold mt-0.5">{client.ai_cost_eur_month.toLocaleString('fr-FR')}€</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Dernière activité</p>
          <p className="text-sm font-semibold mt-0.5">{client.last_activity ? relativeTime(client.last_activity) : '—'}</p>
        </div>
      </div>

      {/* Abonnement */}
      <div className="card-elevated p-5 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold border ${
            client.plan === 'premium'
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
          }`}>
            Plan {client.plan === 'premium' ? 'Premium' : 'Standard'}
          </span>
          {configs.addon_f11 === 'true' && (
            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30">Abandon checkout</span>
          )}
          {configs.addon_f13 === 'true' && (
            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-violet-500/10 text-violet-400 border border-violet-500/30">Vocal IA</span>
          )}
          {configs.addon_f18 === 'true' && (
            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/30">Module Notaire</span>
          )}
          {configs.addon_f11 !== 'true' && configs.addon_f13 !== 'true' && configs.addon_f18 !== 'true' && (
            <span className="text-xs text-muted-foreground">Aucune option active</span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowSubscriptionModal(true)} className="text-xs gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
          </svg>
          Modifier
        </Button>
      </div>

      {/* Onglets */}
      <div className="border-b border-border/60">
        <nav className="flex gap-1 -mb-px">
          {([
            { key: 'tasks', label: `File d'attente${tasks.length > 0 ? ` (${tasks.length})` : ''}` },
            { key: 'history', label: 'Historique' },
            { key: 'settings', label: 'Paramètres' },
          ] as { key: Tab; label: string }[]).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab : File d'attente */}
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
                <div className="flex items-center gap-3 min-w-0">
                  {/* Type badge */}
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold flex-shrink-0 ${TYPE_BADGE_CLASS[task.task_type] ?? 'badge-pending'}`}>
                    {TYPE_LABELS[task.task_type] ?? task.task_type}
                  </span>
                  {/* Élève */}
                  <div className="min-w-0">
                    {task.context_json.customer_name && (
                      <p className="text-sm font-medium truncate">{task.context_json.customer_name}</p>
                    )}
                    <div className="flex items-center gap-2">
                      {task.context_json.customer_email && (
                        <p className="text-xs text-muted-foreground truncate">{task.context_json.customer_email}</p>
                      )}
                      {task.context_json.amount !== undefined && (
                        <span className="text-xs text-muted-foreground flex-shrink-0">{task.context_json.amount}€</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{relativeTime(task.created_at)}</span>
                  <Button variant="outline" size="sm" className="text-xs">Traiter</Button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Tab : Historique */}
      {tab === 'history' && (
        <div className="space-y-4">
          {/* Filtre type */}
          <div className="flex items-center gap-2">
            <select
              value={historyFilter}
              onChange={e => setHistoryFilter(e.target.value as HistoryFilter)}
              className={selectClass}
            >
              <option value="all">Tous les types</option>
              <option value="onboarding">Onboarding</option>
              <option value="relance">Relance</option>
              <option value="upsell">Upsell</option>
              <option value="custom">Personnalisé</option>
            </select>
            {historyFilter !== 'all' && (
              <button
                onClick={() => setHistoryFilter('all')}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                ✕ Réinitialiser
              </button>
            )}
          </div>

          {filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center border border-border/60 rounded-xl bg-card/40">
              <p className="text-sm font-medium text-muted-foreground">
                {logs.length === 0 ? 'Aucun historique pour ce client.' : 'Aucun résultat pour ce filtre.'}
              </p>
            </div>
          ) : (
            <div className="border border-border/60 rounded-xl overflow-hidden divide-y divide-border/60 bg-card/30">
              {filteredLogs.map(log => (
                <div key={log.id} className="flex items-center justify-between px-4 py-3 list-row">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{ACTION_LABELS[log.action_type] ?? log.action_type}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {/* Élève */}
                      {log.payload_json?.to && (
                        <p className="text-xs text-muted-foreground truncate">{log.payload_json.to}</p>
                      )}
                      <p className="text-xs text-muted-foreground flex-shrink-0">{formatDate(log.created_at)}</p>
                    </div>
                  </div>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium flex-shrink-0 ml-3 ${
                    log.status === 'sent' ? 'badge-sent' : 'badge-failed'
                  }`}>
                    {log.status === 'sent' ? '✓ envoyé' : '✗ échoué'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab : Paramètres */}
      {tab === 'settings' && (
        <div className="space-y-5">

          {/* Informations de base */}
          <div className="card-elevated p-5 space-y-4">
            <h3 className="text-sm font-semibold">Informations</h3>
            {(['name', 'email'] as const).map(field => (
              <div key={field} className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground mb-0.5">{field === 'name' ? 'Nom' : 'Email'}</p>
                  {editingField === field ? (
                    <div className="flex items-center gap-2">
                      <Input
                        type={field === 'email' ? 'email' : 'text'}
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        className="h-8 text-sm"
                        autoFocus
                        disabled={savingField}
                      />
                      <Button size="sm" className="h-8 gap-1" onClick={saveEdit} disabled={savingField}>
                        {savingField ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditingField(null)} disabled={savingField}>
                        ✕
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm font-medium truncate">{client[field]}</p>
                  )}
                </div>
                {editingField !== field && (
                  <Button variant="ghost" size="sm" className="text-xs flex-shrink-0" onClick={() => startEdit(field)}>
                    Modifier
                  </Button>
                )}
              </div>
            ))}
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Mode IA</p>
              <p className="text-sm font-medium">{client.auto_mode ? 'Automatique' : 'Manuel'}</p>
            </div>
          </div>

          {/* Intégration Stripe */}
          <div className="card-elevated p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Intégration Stripe</h3>
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Connecté
              </span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">URL Webhook</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-muted rounded-lg px-3 py-2 text-xs font-mono break-all border border-border/60">
                  {webhookUrl}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-shrink-0 gap-1.5"
                  onClick={() => copyWebhook(() => { setCopiedSettings(true); setTimeout(() => setCopiedSettings(false), 2000) })}
                >
                  {copiedSettings ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedSettings ? 'Copié' : 'Copier'}
                </Button>
              </div>
              <a
                href="https://dashboard.stripe.com/webhooks"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1.5"
              >
                <ExternalLink className="w-3 h-3" />
                Ouvrir Stripe Webhooks
              </a>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Mettre à jour le secret</p>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="whsec_..."
                  value={webhookSecretInput}
                  onChange={e => setWebhookSecretInput(e.target.value)}
                  className="text-sm"
                  disabled={savingWebhook}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-shrink-0 gap-1.5"
                  onClick={saveWebhookSecret}
                  disabled={savingWebhook || !webhookSecretInput.trim()}
                >
                  {savingWebhook && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Enregistrer
                </Button>
              </div>
            </div>
          </div>

          {/* Pilier 3 — Support élève IA */}
          <div className="card-elevated p-5 space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <h3 className="text-sm font-semibold">Pilier 3 — Support élève IA</h3>
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
            <Button onClick={saveConfigs} disabled={savingConfigs} className="btn-glow gap-2">
              {savingConfigs && <Loader2 className="w-4 h-4 animate-spin" />}
              {savingConfigs ? 'Enregistrement...' : 'Enregistrer les paramètres'}
            </Button>
          </div>
        </div>
      )}

      <TaskDrawer
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onSent={() => { setSelectedTask(null); loadTasks() }}
      />

      <ClientForm
        open={showEdit}
        initialData={client}
        onClose={() => setShowEdit(false)}
        onCreated={() => { setShowEdit(false); loadClient() }}
      />

      <SubscriptionModal
        open={showSubscriptionModal}
        client={{ id: client.id, name: client.name, email: client.email, plan: client.plan }}
        options={{
          option_checkout: configs.addon_f11 === 'true',
          option_vocal: configs.addon_f13 === 'true',
          option_notaire: configs.addon_f18 === 'true',
        }}
        onClose={() => setShowSubscriptionModal(false)}
        onSaved={(next) => {
          setClient(c => c ? { ...c, plan: next.plan } : c)
          setConfigs(c => ({ ...c, addon_f11: next.option_checkout ? 'true' : 'false', addon_f13: next.option_vocal ? 'true' : 'false', addon_f18: next.option_notaire ? 'true' : 'false' }))
        }}
      />
    </div>
  )
}
