'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { ClientForm } from '@/components/client-form'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface ClientRow {
  id: string
  name: string
  email: string
  created_at: string
}

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientRow[]>([])
  const [showForm, setShowForm] = useState(false)

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
        <Button onClick={() => setShowForm(true)}>+ Nouveau client</Button>
      </div>

      {clients.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun client pour l'instant.</p>
      ) : (
        <div className="border border-border rounded-lg divide-y divide-border">
          {clients.map(client => (
            <div key={client.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium">{client.name}</p>
                <p className="text-xs text-muted-foreground">{client.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">actif</Badge>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(client.id)}>
                  Supprimer
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ClientForm open={showForm} onClose={() => setShowForm(false)} onCreated={load} />
    </div>
  )
}
