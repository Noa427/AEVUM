'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'

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
  const [form, setForm] = useState({ name: '', email: '', stripe_webhook_secret: '', sender_name: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open && initialData) {
      setForm(f => ({ ...f, name: initialData.name, email: initialData.email, stripe_webhook_secret: '', sender_name: '' }))
    } else if (!open) {
      setForm({ name: '', email: '', stripe_webhook_secret: '', sender_name: '' })
      setError('')
    }
  }, [open, initialData])

  function set(field: string, value: string) {
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
        toast.success('Client créé avec succès')
      }
      onCreated()
      onClose()
    } catch (err: any) {
      setError(err.message)
      toast.error(err.message || 'Une erreur est survenue')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Modifier le client' : 'Nouveau client'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 mt-2">
          <Input placeholder="Nom du client" value={form.name} onChange={e => set('name', e.target.value)} required />
          <Input type="email" placeholder="Email de contact" value={form.email} onChange={e => set('email', e.target.value)} required />
          <Input
            placeholder={isEdit ? 'Nom expéditeur (laisser vide = inchangé)' : 'Nom expéditeur (ex: Formation Dupont)'}
            value={form.sender_name}
            onChange={e => set('sender_name', e.target.value)}
            required={!isEdit}
          />
          <Input
            placeholder={isEdit ? 'Webhook Secret (laisser vide = inchangé)' : 'Stripe Webhook Secret (whsec_...)'}
            value={form.stripe_webhook_secret}
            onChange={e => set('stripe_webhook_secret', e.target.value)}
            required={!isEdit}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={loading}>
              {loading ? (isEdit ? 'Mise à jour...' : 'Création...') : (isEdit ? 'Enregistrer' : 'Créer')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
