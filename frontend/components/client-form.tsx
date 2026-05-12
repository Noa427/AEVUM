'use client'
import { useState } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface Props {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

export function ClientForm({ open, onClose, onCreated }: Props) {
  const [form, setForm] = useState({ name: '', email: '', stripe_webhook_secret: '', sender_name: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await api.post('/api/clients', form)
      setForm({ name: '', email: '', stripe_webhook_secret: '', sender_name: '' })
      onCreated()
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nouveau client</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 mt-2">
          <Input placeholder="Nom du client" value={form.name} onChange={e => set('name', e.target.value)} required />
          <Input type="email" placeholder="Email de contact" value={form.email} onChange={e => set('email', e.target.value)} required />
          <Input placeholder="Nom expéditeur (ex: Formation Dupont)" value={form.sender_name} onChange={e => set('sender_name', e.target.value)} required />
          <Input
            placeholder="Stripe Webhook Secret (whsec_...)"
            value={form.stripe_webhook_secret}
            onChange={e => set('stripe_webhook_secret', e.target.value)}
            required
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Création...' : 'Créer'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
