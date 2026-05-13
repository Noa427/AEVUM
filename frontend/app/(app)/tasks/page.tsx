'use client'
import { useEffect, useState } from 'react'
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

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [showSimulate, setShowSimulate] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)

  async function load() {
    const data = await api.get<Task[]>('/api/tasks').catch(() => [])
    setTasks(data)
  }

  useEffect(() => { load() }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Tâches en attente</h1>
        <Button variant="outline" onClick={() => setShowSimulate(true)}>
          Simuler un événement
        </Button>
      </div>

      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune tâche en attente.</p>
      ) : (
        <div className="border border-border rounded-lg divide-y divide-border">
          {tasks.map(task => (
            <div
              key={task.id}
              className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-accent/30 transition-colors"
              onClick={() => setSelectedTask(task)}
            >
              <div>
                <p className="text-sm font-medium">{task.clients?.name ?? '—'}</p>
                <p className="text-xs text-muted-foreground">
                  {task.context_json.amount}€ · {new Date(task.created_at).toLocaleString('fr-FR')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {task.context_json.simulated && (
                  <Badge variant="outline">simulé</Badge>
                )}
                <Badge variant="secondary">en attente</Badge>
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
