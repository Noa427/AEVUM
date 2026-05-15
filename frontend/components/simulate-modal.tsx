'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'

interface Client { id: string; name: string }

interface Props {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

export function SimulateModal({ open, onClose, onCreated }: Props) {
  const [clients, setClients] = useState<Client[]>([])
  const [clientId, setClientId] = useState('')
  const [eventType, setEventType] = useState<'failed_payment' | 'checkout_completed'>('failed_payment')
  const [amount, setAmount] = useState('197')
  const [studentName, setStudentName] = useState('')
  const [productName, setProductName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) api.get<Client[]>('/api/clients').then(setClients).catch(() => {})
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!clientId) { setError('Sélectionner un client'); return }
    setLoading(true)
    setError('')
    try {
      await api.post('/api/simulate', {
        client_id: clientId,
        event_type: eventType,
        custom_data: {
          amount: Number(amount),
          ...(studentName ? { student_name: studentName } : {}),
          ...(productName ? { product_name: productName } : {}),
        },
      })
      toast.success('Simulation envoyée')
      setClientId('')
      setAmount(eventType === 'failed_payment' ? '197' : '297')
      setStudentName('')
      setProductName('')
      onCreated()
      onClose()
    } catch (err: any) {
      setError(err.message)
      toast.error(err.message || 'Erreur lors de la simulation')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Simuler un événement</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 mt-2">
          <select
            value={clientId}
            onChange={e => setClientId(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Sélectionner un client</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            value={eventType}
            onChange={e => {
              setEventType(e.target.value as typeof eventType)
              setAmount(e.target.value === 'failed_payment' ? '197' : '297')
            }}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="failed_payment">Paiement échoué</option>
            <option value="checkout_completed">Achat complété (onboarding)</option>
          </select>
          <Input
            type="number"
            placeholder="Montant (€)"
            value={amount}
            onChange={e => setAmount(e.target.value)}
          />
          <Input
            placeholder="Prénom élève (optionnel)"
            value={studentName}
            onChange={e => setStudentName(e.target.value)}
          />
          <Input
            placeholder="Nom formation (optionnel)"
            value={productName}
            onChange={e => setProductName(e.target.value)}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Simulation...' : 'Simuler'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
