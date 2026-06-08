'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

interface Props {
  open: boolean
  client: { id: string; name: string; email: string; plan: 'standard' | 'premium' }
  options: { option_checkout: boolean; option_vocal: boolean; option_notaire: boolean }
  onClose: () => void
  onSaved: (next: { plan: 'standard' | 'premium'; option_checkout: boolean; option_vocal: boolean; option_notaire: boolean }) => void
}

export function SubscriptionModal({ open, client, options, onClose, onSaved }: Props) {
  const [plan, setPlan] = useState<'standard' | 'premium'>(client.plan)
  const [checkout, setCheckout] = useState(options.option_checkout)
  const [vocal, setVocal] = useState(options.option_vocal)
  const [notaire, setNotaire] = useState(options.option_notaire)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setPlan(client.plan)
      setCheckout(options.option_checkout)
      setVocal(options.option_vocal)
      setNotaire(options.option_notaire)
      setError('')
    }
  }, [open, client.plan, options.option_checkout, options.option_vocal, options.option_notaire])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await api.put(`/api/clients/${client.id}/plan`, {
        plan,
        option_checkout: checkout,
        option_vocal: vocal,
        option_notaire: notaire,
      })
      toast.success('Abonnement mis à jour')
      onSaved({ plan, option_checkout: checkout, option_vocal: vocal, option_notaire: notaire })
      onClose()
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !loading) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Modifier l&apos;abonnement</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Plan</label>
            <select
              value={plan}
              onChange={e => setPlan(e.target.value as 'standard' | 'premium')}
              disabled={loading}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 transition-shadow"
            >
              <option value="standard">Standard</option>
              <option value="premium">Premium</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={checkout}
                onChange={e => setCheckout(e.target.checked)}
                disabled={loading}
                className="w-4 h-4 accent-primary"
              />
              <span className="text-sm">Abandon checkout <span className="text-xs text-muted-foreground">(+200€/mois)</span></span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={vocal}
                onChange={e => setVocal(e.target.checked)}
                disabled={loading}
                className="w-4 h-4 accent-primary"
              />
              <span className="text-sm">Vocal IA <span className="text-xs text-muted-foreground">(+350€/mois)</span></span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={notaire}
                onChange={e => setNotaire(e.target.checked)}
                disabled={loading}
                className="w-4 h-4 accent-primary"
              />
              <span className="text-sm">Module Notaire <span className="text-xs text-muted-foreground">(+149€/dossier)</span></span>
            </label>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1 border-t border-border/40">
            <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
              Annuler
            </Button>
            <Button type="submit" disabled={loading} className="gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Enregistrer
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
