'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

interface ClientData {
  id: string
  name: string
  email: string
}

interface Props {
  open: boolean
  initialData?: ClientData
  onClose: () => void
  onCreated: () => void
}

export function ClientForm({ open, initialData, onClose, onCreated }: Props) {
  const isEdit = !!initialData
  const [form, setForm] = useState({
    name: '', email: '', stripe_webhook_secret: '', sender_name: '',
    plan: 'standard' as 'standard' | 'premium',
    option_checkout: false, option_vocal: false, option_notaire: false,
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open && initialData) {
      setForm(f => ({ ...f, name: initialData.name, email: initialData.email, stripe_webhook_secret: '', sender_name: '' }))
    } else if (!open) {
      setForm({
        name: '', email: '', stripe_webhook_secret: '', sender_name: '',
        plan: 'standard', option_checkout: false, option_vocal: false, option_notaire: false,
      })
      setError('')
    }
  }, [open, initialData])

  function set<K extends keyof typeof form>(field: K, value: typeof form[K]) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      if (isEdit) {
        const payload: Record<string, string> = { name: form.name, email: form.email }
        if (form.stripe_webhook_secret) payload.stripe_webhook_secret = form.stripe_webhook_secret
        if (form.sender_name) payload.sender_name = form.sender_name
        await api.put(`/api/clients/${initialData!.id}`, payload)
        toast.success('Client mis à jour')
      } else {
        await api.post('/api/clients', form)
        toast.success('Client créé — identifiants envoyés par email')
      }
      onCreated()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !loading) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Modifier le client' : 'Nouveau client'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-2">
          {/* Section 1 — Informations client */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-3">Informations client</p>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Nom de l&apos;infopreneur</label>
                <Input
                  placeholder="Marie Dupont"
                  name="name"
                  value={form.name}
                  onChange={e => set('name', e.target.value)}
                  disabled={loading}
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Email de contact</label>
                <Input
                  type="email"
                  placeholder="marie@formation.fr"
                  name="email"
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                  disabled={loading}
                  required
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  Les identifiants du portail client seront envoyés à cet email
                </p>
              </div>
            </div>
          </div>

          {/* Separator */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border/60" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-background px-3 text-xs uppercase tracking-wide text-muted-foreground">
                Configuration email
              </span>
            </div>
          </div>

          {/* Section 2 — Config email */}
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Nom expéditeur</label>
              <Input
                placeholder="Formation Dupont"
                name="sender_name"
                value={form.sender_name}
                onChange={e => set('sender_name', e.target.value)}
                disabled={loading}
                required={!isEdit}
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                Nom affiché dans les emails reçus par les élèves
              </p>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Stripe Webhook Secret</label>
              <Input
                placeholder="whsec_..."
                name="stripe_webhook_secret"
                value={form.stripe_webhook_secret}
                onChange={e => set('stripe_webhook_secret', e.target.value)}
                disabled={loading}
                required={!isEdit}
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                <a
                  href="https://dashboard.stripe.com/webhooks"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-foreground transition-colors"
                >
                  Où trouver ce secret ↗
                </a>
              </p>
            </div>
          </div>

          {/* Section 3 — Abonnement (création uniquement) */}
          {!isEdit && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground">Abonnement</p>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Plan</label>
                <select
                  value={form.plan}
                  onChange={e => set('plan', e.target.value as 'standard' | 'premium')}
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
                    checked={form.option_checkout}
                    onChange={e => set('option_checkout', e.target.checked)}
                    disabled={loading}
                    className="w-4 h-4 accent-primary"
                  />
                  <span className="text-sm">Abandon checkout <span className="text-xs text-muted-foreground">(+200€/mois)</span></span>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.option_vocal}
                    onChange={e => set('option_vocal', e.target.checked)}
                    disabled={loading}
                    className="w-4 h-4 accent-primary"
                  />
                  <span className="text-sm">Vocal IA <span className="text-xs text-muted-foreground">(+350€/mois)</span></span>
                </label>
                <label className="flex items-center gap-2.5 cursor-not-allowed opacity-50">
                  <input type="checkbox" checked={false} disabled className="w-4 h-4" />
                  <span className="text-sm">Module Notaire <span className="text-xs text-muted-foreground">(Bientôt disponible)</span></span>
                </label>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              {error}
            </div>
          )}

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-1 border-t border-border/40">
            <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
              Annuler
            </Button>
            <Button type="submit" disabled={loading} className="gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {isEdit ? 'Enregistrer' : 'Créer le client'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
