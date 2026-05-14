'use client'
import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SimulateModal } from '@/components/simulate-modal'
import { TaskDrawer } from '@/components/task-drawer'

interface Task {
  id: string
  task_type: string
  context_json: Record<string, any>
  prompt_template: string | null
  created_at: string
  clients: { name: string; email: string } | null
}

interface PaginatedTasks {
  data: Task[]
  total: number
  page: number
  limit: number
}

const TYPE_LABELS: Record<string, string> = {
  failed_payment: 'Impayé',
  onboarding_j0: 'Onboarding J0',
  onboarding_j3: 'Onboarding J+3',
  onboarding_j7: 'Onboarding J+7',
}

const TYPE_BADGE_CLASS: Record<string, string> = {
  failed_payment: 'badge-failed-payment',
  onboarding_j0: 'badge-onboarding-j0',
  onboarding_j3: 'badge-onboarding-j3',
  onboarding_j7: 'badge-onboarding-j7',
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `il y a ${minutes}min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `il y a ${hours}h`
  const days = Math.floor(hours / 24)
  return `il y a ${days}j`
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [showSimulate, setShowSimulate] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)

  const load = useCallback(async () => {
    const res = await api.get<PaginatedTasks>('/api/tasks?status=pending&limit=50').catch(() => null)
    if (res?.data) setTasks(res.data)
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [load])

  return (
    <div className="space-y-6 animate-fade-in">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tâches en attente</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {tasks.length > 0
              ? `${tasks.length} tâche${tasks.length > 1 ? 's' : ''} à traiter · Rafraîchissement auto toutes les 30s`
              : 'Les tâches générées par vos webhooks apparaissent ici'}
          </p>
        </div>
        <Button variant="outline" onClick={() => setShowSimulate(true)} className="gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          Simuler un événement
        </Button>
      </div>

      {/* Liste ou empty state */}
      {tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border border-border/60 rounded-xl bg-card/40">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </div>
          <p className="text-sm font-semibold text-foreground mb-1">Aucune tâche en attente</p>
          <p className="text-xs text-muted-foreground mb-5 max-w-xs">
            Tout est traité ! Les nouvelles tâches apparaîtront dès réception d&apos;un événement Stripe.
          </p>
          <Button variant="outline" onClick={() => setShowSimulate(true)} className="gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            Simuler un événement test
          </Button>
        </div>
      ) : (
        <div className="border border-border/60 rounded-xl overflow-hidden divide-y divide-border/60 bg-card/30">
          {tasks.map(task => (
            <div
              key={task.id}
              className="flex items-center justify-between px-4 py-3.5 cursor-pointer list-row"
              onClick={() => setSelectedTask(task)}
            >
              {/* Infos tâche */}
              <div className="flex items-center gap-3 min-w-0">
                {/* Indicateur type */}
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  task.task_type === 'failed_payment'
                    ? 'bg-orange-400'
                    : task.task_type === 'onboarding_j0'
                    ? 'bg-blue-400'
                    : task.task_type === 'onboarding_j3'
                    ? 'bg-indigo-400'
                    : 'bg-purple-400'
                }`} />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{task.clients?.name ?? '—'}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {task.context_json.customer_email}
                  </p>
                </div>
              </div>

              {/* Badges + date */}
              <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                {task.context_json.simulated && (
                  <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground opacity-70">
                    simulé
                  </span>
                )}
                {task.context_json.amount && (
                  <span className="inline-flex items-center rounded-full bg-secondary text-secondary-foreground border border-border/60 px-2 py-0.5 text-xs font-medium">
                    {task.context_json.amount}€
                  </span>
                )}
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    TYPE_BADGE_CLASS[task.task_type] ?? 'border border-border text-foreground bg-muted'
                  }`}
                >
                  {TYPE_LABELS[task.task_type] ?? task.task_type}
                </span>
                <span
                  className="text-xs text-muted-foreground whitespace-nowrap"
                  title={new Date(task.created_at).toLocaleString('fr-FR')}
                >
                  {relativeTime(task.created_at)}
                </span>
                {/* Flèche indiquant la cliquabilité */}
                <svg className="w-3.5 h-3.5 text-muted-foreground/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                </svg>
              </div>
            </div>
          ))}
        </div>
      )}

      <SimulateModal
        open={showSimulate}
        onClose={() => setShowSimulate(false)}
        onCreated={load}
      />
      <TaskDrawer
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onSent={load}
      />
    </div>
  )
}

