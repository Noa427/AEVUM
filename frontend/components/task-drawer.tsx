'use client'
import { useState } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

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

const TYPE_LABELS: Record<string, string> = {
  failed_payment: 'Impayé',
  onboarding_j0: 'Onboarding J0',
  onboarding_j3: 'Onboarding J+3',
  onboarding_j7: 'Onboarding J+7',
  support_manual: 'Support IA',
  upsell: 'Upsell',
}

const TYPE_BADGE_CLASS: Record<string, string> = {
  failed_payment: 'badge-failed-payment',
  onboarding_j0: 'badge-onboarding-j0',
  onboarding_j3: 'badge-onboarding-j3',
  onboarding_j7: 'badge-onboarding-j7',
  support_manual: 'badge-support',
  upsell: 'badge-upsell',
}

export function TaskDrawer({ task, onClose, onSent }: Props) {
  const [aiResponse, setAiResponse] = useState('')
  const [preview, setPreview] = useState<{ subject: string; body_html: string } | null>(null)
  const [state, setState] = useState<DrawerState>('input')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  function handleClose() {
    setAiResponse('')
    setPreview(null)
    setState('input')
    setError('')
    setCopied(false)
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
      toast.success('Email envoyé avec succès')
      setState('done')
      setTimeout(() => { handleClose(); onSent() }, 1500)
    } catch (err: any) {
      setError(err.message)
      toast.error(err.message || "Erreur lors de l'envoi")
      setState('preview')
    }
  }

  function copyPrompt() {
    if (task?.prompt_template) {
      navigator.clipboard.writeText(task.prompt_template)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const taskLabel = TYPE_LABELS[task?.task_type ?? ''] ?? task?.task_type ?? ''
  const taskBadgeClass = TYPE_BADGE_CLASS[task?.task_type ?? ''] ?? ''

  return (
    <Dialog open={!!task} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl h-[90vh] flex flex-col overflow-hidden p-0">

        {/* Header sticky */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-border/60 bg-card/60 flex-shrink-0">
          <div className="space-y-1">
            <DialogTitle className="text-base font-semibold leading-tight">
              {task?.clients?.name ?? '—'}
            </DialogTitle>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${taskBadgeClass}`}>
                {taskLabel}
              </span>
              {task?.clients?.email && (
                <span className="text-xs text-muted-foreground">{task.clients.email}</span>
              )}
            </div>
          </div>
        </div>

        {/* Contenu scrollable */}
        {task && state !== 'done' && (
          <div className="flex flex-col gap-5 flex-1 overflow-y-auto px-6 py-5">

            {/* Section Contexte */}
            <div>
              <p className="section-label mb-3">Contexte</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 bg-muted/40 rounded-lg p-4 border border-border/40">
                {task.context_json.amount !== undefined && (
                  <>
                    <span className="text-xs text-muted-foreground">Montant</span>
                    <span className="text-xs font-medium">{task.context_json.amount}€</span>
                  </>
                )}
                {task.context_json.customer_email && (
                  <>
                    <span className="text-xs text-muted-foreground">Email élève</span>
                    <span className="text-xs font-medium truncate">{task.context_json.customer_email}</span>
                  </>
                )}
                {task.context_json.student_name && (
                  <>
                    <span className="text-xs text-muted-foreground">Prénom élève</span>
                    <span className="text-xs font-medium">{task.context_json.student_name}</span>
                  </>
                )}
                {task.context_json.product_name && (
                  <>
                    <span className="text-xs text-muted-foreground">Formation</span>
                    <span className="text-xs font-medium">{task.context_json.product_name}</span>
                  </>
                )}
                {task.context_json.from && (
                  <>
                    <span className="text-xs text-muted-foreground">De</span>
                    <span className="text-xs font-medium truncate">{task.context_json.from}</span>
                  </>
                )}
                {task.context_json.subject && (
                  <>
                    <span className="text-xs text-muted-foreground">Objet</span>
                    <span className="text-xs font-medium truncate">{task.context_json.subject}</span>
                  </>
                )}
                {task.context_json.category && (
                  <>
                    <span className="text-xs text-muted-foreground">Catégorie IA</span>
                    <span className="text-xs font-medium">{task.context_json.category}</span>
                  </>
                )}
                {task.context_json.body && (
                  <>
                    <span className="text-xs text-muted-foreground col-span-2 mt-1">Message reçu</span>
                    <span className="text-xs text-muted-foreground col-span-2 bg-muted/40 rounded p-2 line-clamp-4">
                      {task.context_json.body}
                    </span>
                  </>
                )}
                {task.context_json.upsell_product_name && (
                  <>
                    <span className="text-xs text-muted-foreground">Offre upsell</span>
                    <span className="text-xs font-medium">{task.context_json.upsell_product_name}</span>
                  </>
                )}
                {task.context_json.upsell_price && (
                  <>
                    <span className="text-xs text-muted-foreground">Prix</span>
                    <span className="text-xs font-medium">{task.context_json.upsell_price}</span>
                  </>
                )}
                {task.context_json.simulated && (
                  <>
                    <span className="text-xs text-muted-foreground">Source</span>
                    <span className="text-xs text-muted-foreground italic">simulé</span>
                  </>
                )}
              </div>
            </div>

            {state === 'input' && (
              <>
                {/* Section Prompt */}
                {task.prompt_template && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="section-label">Prompt à copier</p>
                      <button
                        onClick={copyPrompt}
                        className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border transition-all duration-150 ${
                          copied
                            ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent/60'
                        }`}
                      >
                        {copied ? (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                            </svg>
                            Copié ✓
                          </>
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                            </svg>
                            Copier
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="text-xs bg-muted/60 border border-border/60 rounded-lg p-4 whitespace-pre-wrap break-words font-mono leading-relaxed max-h-48 overflow-y-auto">
                      {task.prompt_template}
                    </pre>
                  </div>
                )}

                {/* Section Réponse Claude */}
                <div>
                  <p className="section-label mb-2">Réponse Claude</p>
                  <textarea
                    className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm min-h-[200px] resize-y focus:outline-none focus:ring-2 focus:ring-ring/50 transition-shadow placeholder:text-muted-foreground/60 font-mono leading-relaxed"
                    placeholder="Collez ici la réponse générée par Claude..."
                    value={aiResponse}
                    onChange={e => setAiResponse(e.target.value)}
                  />
                </div>

                {error && (
                  <p className="text-sm text-destructive flex items-center gap-1.5">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    {error}
                  </p>
                )}

                {/* Footer */}
                <div className="flex justify-end pt-2 border-t border-border/40">
                  <Button onClick={handlePreview} disabled={!aiResponse.trim()} className="btn-glow gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                    </svg>
                    Aperçu →
                  </Button>
                </div>
              </>
            )}

            {state === 'preview' && preview && (
              <>
                {/* Objet email */}
                <div>
                  <p className="section-label mb-2">Objet de l&apos;email</p>
                  <div className="bg-muted/60 border border-border/60 rounded-lg px-4 py-2.5">
                    <span className="text-sm font-medium">{preview.subject}</span>
                  </div>
                </div>

                {/* Aperçu HTML */}
                <div>
                  <p className="section-label mb-2">Aperçu de l&apos;email</p>
                  <div
                    className="border border-border/60 rounded-lg p-4 text-sm overflow-y-auto bg-white dark:bg-zinc-900"
                    style={{ minHeight: '200px', maxHeight: '320px' }}
                    dangerouslySetInnerHTML={{ __html: preview.body_html }}
                  />
                </div>

                {error && (
                  <p className="text-sm text-destructive flex items-center gap-1.5">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    {error}
                  </p>
                )}

                {/* Footer */}
                <div className="flex justify-between pt-2 border-t border-border/40">
                  <Button variant="outline" onClick={() => setState('input')} className="gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
                    </svg>
                    Modifier
                  </Button>
                  <Button onClick={handleSend} className="btn-glow gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
                    </svg>
                    Envoyer l&apos;email
                  </Button>
                </div>
              </>
            )}

            {state === 'sending' && (
              <div className="flex flex-col items-center justify-center flex-1 py-12 text-sm text-muted-foreground gap-3">
                <span className="spinner text-xl" />
                <span>Envoi en cours...</span>
              </div>
            )}
          </div>
        )}

        {state === 'done' && (
          <div className="flex flex-col items-center justify-center flex-1 py-12 gap-3">
            <div className="w-12 h-12 rounded-full bg-emerald-500/15 flex items-center justify-center">
              <svg className="w-6 h-6 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
              </svg>
            </div>
            <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">Email envoyé ✓</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

