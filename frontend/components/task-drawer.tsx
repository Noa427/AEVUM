'use client'
import { useState } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'

interface Task {
  id: string
  task_type: string
  context_json: Record<string, any>
  prompt_template: string | null
  clients: { name: string; email: string } | null
}

interface Props {
  task: Task | null
  onClose: () => void
  onSent: () => void
}

type DrawerState = 'input' | 'preview' | 'sending' | 'done'

export function TaskDrawer({ task, onClose, onSent }: Props) {
  const [aiResponse, setAiResponse] = useState('')
  const [preview, setPreview] = useState<{ subject: string; body_html: string } | null>(null)
  const [state, setState] = useState<DrawerState>('input')
  const [error, setError] = useState('')

  function handleClose() {
    setAiResponse('')
    setPreview(null)
    setState('input')
    setError('')
    onClose()
  }

  async function handlePreview() {
    setError('')
    try {
      const data = await api.post<{ subject: string; body_html: string }>(
        `/api/tasks/${task!.id}/preview`,
        { ai_response: aiResponse }
      )
      setPreview(data)
      setState('preview')
    } catch (err: any) {
      setError(err.message)
    }
  }

  async function handleSend() {
    setState('sending')
    setError('')
    try {
      await api.post(`/api/tasks/${task!.id}/send`, {
        subject: preview!.subject,
        body_html: preview!.body_html,
        ai_response: aiResponse,
      })
      setState('done')
      setTimeout(() => { handleClose(); onSent() }, 1500)
    } catch (err: any) {
      setError(err.message)
      setState('preview')
    }
  }

  function copyPrompt() {
    if (task?.prompt_template) navigator.clipboard.writeText(task.prompt_template)
  }

  return (
    <Dialog open={!!task} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            {task?.task_type === 'failed_payment' ? 'Paiement échoué' : task?.task_type} —{' '}
            {task?.clients?.name}
          </DialogTitle>
        </DialogHeader>

        {task && state !== 'done' && (
          <div className="flex flex-col gap-4 flex-1 overflow-y-auto">
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Montant : <span className="text-foreground font-medium">{task.context_json.amount}€</span></p>
              <p>Email élève : <span className="text-foreground">{task.context_json.customer_email}</span></p>
            </div>

            {state === 'input' && (
              <>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-medium uppercase text-muted-foreground">Prompt</p>
                    <Button variant="ghost" size="sm" onClick={copyPrompt}>Copier</Button>
                  </div>
                  <pre className="text-xs bg-muted rounded-md p-3 whitespace-pre-wrap break-words">
                    {task.prompt_template}
                  </pre>
                </div>
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Réponse Claude</p>
                  <textarea
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[140px] resize-none"
                    placeholder="Coller la réponse Claude ici..."
                    value={aiResponse}
                    onChange={e => setAiResponse(e.target.value)}
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <div className="flex justify-end">
                  <Button onClick={handlePreview} disabled={!aiResponse.trim()}>
                    Aperçu →
                  </Button>
                </div>
              </>
            )}

            {state === 'preview' && preview && (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Objet :</span>
                  <Badge variant="secondary">{preview.subject}</Badge>
                </div>
                <div
                  className="border border-border rounded-md p-4 text-sm overflow-y-auto flex-1"
                  dangerouslySetInnerHTML={{ __html: preview.body_html }}
                />
                {error && <p className="text-sm text-destructive">{error}</p>}
                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setState('input')}>← Modifier</Button>
                  <Button onClick={handleSend}>Envoyer l'email →</Button>
                </div>
              </>
            )}

            {state === 'sending' && (
              <div className="flex items-center justify-center flex-1 text-sm text-muted-foreground">
                Envoi en cours...
              </div>
            )}
          </div>
        )}

        {state === 'done' && (
          <div className="flex items-center justify-center flex-1 text-sm font-medium text-green-500">
            Email envoyé ✓
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
