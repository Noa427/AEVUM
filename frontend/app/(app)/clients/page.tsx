'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { ClientForm } from '@/components/client-form'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface ClientRow {
  id: string
  name: string
  email: string
  created_at: string
  pending_tasks: number
  emails_sent: number
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientRow[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingClient, setEditingClient] = useState<ClientRow | null>(null)
  const [webhookClient, setWebhookClient] = useState<ClientRow | null>(null)

  async function load() {
    const data = await api.get<ClientRow[]>('/api/clients')
    setClients(data)
  }

  useEffect(() => { load() }, [])

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ce client ?')) return
    await api.delete(`/api/clients/${id}`)
    await load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Clients</h1>
        <Button onClick={() => setShowForm(true)} className="btn-glow">+ Nouveau client</Button>
      </div>

      {clients.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun client pour l'instant.</p>
      ) : (
        <div className="border border-border rounded-lg divide-y divide-border">
          {clients.map(client => (
            <div key={client.id} className="flex items-center justify-between px-4 py-3 list-row">
              <div>
                <p className="text-sm font-medium">{client.name}</p>
                <p className="text-xs text-muted-foreground">{client.email}</p>
                <div className="flex gap-3 mt-1">
                  {client.pending_tasks > 0 && (
                    <span className="text-xs text-amber-500">{client.pending_tasks} tâche{client.pending_tasks > 1 ? 's' : ''} en attente</span>
                  )}
                  <span className="text-xs text-muted-foreground">{client.emails_sent} email{client.emails_sent > 1 ? 's' : ''} envoyé{client.emails_sent > 1 ? 's' : ''}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">actif</Badge>
                <Button variant="ghost" size="sm" onClick={() => setWebhookClient(client)}>
                  Webhook
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setEditingClient(client)}>
                  Modifier
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(client.id)}>
                  Supprimer
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ClientForm
        open={showForm}
        onClose={() => setShowForm(false)}
        onCreated={load}
      />

      <ClientForm
        open={!!editingClient}
        initialData={editingClient ?? undefined}
        onClose={() => setEditingClient(null)}
        onCreated={() => { setEditingClient(null); load() }}
      />

      <Dialog open={!!webhookClient} onOpenChange={() => setWebhookClient(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>URL Webhook Stripe — {webhookClient?.name}</DialogTitle>
          </DialogHeader>
          {webhookClient && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Collez cette URL dans votre tableau de bord Stripe → Webhooks → Ajouter un endpoint.
              </p>
              <div className="bg-muted rounded-md p-3 text-sm font-mono break-all select-all">
                {API_URL}/api/webhooks/stripe/{webhookClient.id}
              </div>
              <p className="text-xs text-muted-foreground">
                Événements à écouter : <code>invoice.payment_failed</code>, <code>checkout.session.completed</code>
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => navigator.clipboard.writeText(`${API_URL}/api/webhooks/stripe/${webhookClient.id}`)}
              >
                Copier l'URL
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
