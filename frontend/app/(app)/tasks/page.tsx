'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { TaskDrawer } from '@/components/task-drawer'

interface Task {
  id: string
  task_type: string
  context_json: Record<string, any>
  prompt_template: string | null
  created_at: string
  client_id: string
  clients: { name: string; email: string } | null
}

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

function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `il y a ${minutes}min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `il y a ${hours}h`
  return `il y a ${Math.floor(hours / 24)}j`
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ data: Task[] }>('/api/tasks?status=pending&limit=100')
      setTasks(res.data ?? [])
    } catch {} finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tâches en attente</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {tasks.length > 0 ? `${tasks.length} tâche${tasks.length > 1 ? 's' : ''} à valider` : 'Aucune tâche en attente'}
        </p>
      </div>

      {loading ? (
        <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-14 bg-muted rounded-xl animate-pulse" />)}</div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-border/60 rounded-xl bg-card/40">
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
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold flex-shrink-0 ${TYPE_BADGE_CLASS[task.task_type] ?? 'badge-pending'}`}>
                  {TYPE_LABELS[task.task_type] ?? task.task_type}
                </span>
                <div className="min-w-0">
                  <Link href={`/clients/${task.client_id}`} onClick={e => e.stopPropagation()} className="text-sm font-medium hover:text-primary transition-colors">
                    {task.clients?.name ?? 'Client'}
                  </Link>
                  <div className="flex items-center gap-2">
                    {task.context_json.customer_name && (
                      <p className="text-xs text-muted-foreground truncate">{task.context_json.customer_name}</p>
                    )}
                    {task.context_json.amount !== undefined && (
                      <span className="text-xs text-muted-foreground flex-shrink-0">{task.context_json.amount}€</span>
                    )}
                  </div>
                </div>
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0 ml-3">{relativeTime(task.created_at)}</span>
            </div>
          ))}
        </div>
      )}

      <TaskDrawer
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onSent={() => { setSelectedTask(null); load() }}
      />
    </div>
  )
}
