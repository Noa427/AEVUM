'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { ClientForm } from '@/components/client-form'
import { Button } from '@/components/ui/button'

interface ClientRow {
  id: string
  name: string
  email: string
  created_at: string
  pending_tasks: number
  emails_sent: number
}

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientRow[]>([])
  const [showForm, setShowForm] = useState(false)

  async function load() {
    try {
      const data = await api.get<ClientRow[]>('/api/clients')
      setClients(data)
    } catch (err: any) {
      console.error(err.message)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {clients.length > 0
              ? `${clients.length} client${clients.length > 1 ? 's' : ''} enregistré${clients.length > 1 ? 's' : ''}`
              : 'Gérez vos clients et leurs automations'}
          </p>
        </div>
        <Button onClick={() => setShowForm(true)} className="btn-glow gap-2">
          <span className="text-base leading-none">+</span> Nouveau client
        </Button>
      </div>

      {clients.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border border-border/60 rounded-xl bg-card/40">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-foreground mb-1">Aucun client pour l&apos;instant</p>
          <p className="text-xs text-muted-foreground mb-5 max-w-xs">
            Ajoutez votre premier client pour commencer à automatiser vos emails.
          </p>
          <Button onClick={() => setShowForm(true)} className="btn-glow gap-2">
            <span className="text-base leading-none">+</span> Ajouter votre premier client
          </Button>
        </div>
      ) : (
        <div className="border border-border/60 rounded-xl overflow-hidden divide-y divide-border/60 bg-card/30">
          {clients.map(client => {
            const initials = client.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
            return (
              <Link
                key={client.id}
                href={`/clients/${client.id}`}
                className="flex items-center justify-between px-4 py-3.5 list-row hover:bg-accent/40 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-semibold text-primary">{initials}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{client.name}</p>
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold badge-sent flex-shrink-0">
                        actif
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{client.email}</p>
                    <div className="flex items-center gap-3 mt-1">
                      {client.pending_tasks > 0 && (
                        <span className="inline-flex items-center gap-1 text-[11px] badge-pending rounded-full px-1.5 py-0.5">
                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
                          </svg>
                          {client.pending_tasks} tâche{client.pending_tasks > 1 ? 's' : ''} en attente
                        </span>
                      )}
                      <span className="text-[11px] text-muted-foreground">
                        {client.emails_sent} email{client.emails_sent > 1 ? 's' : ''} envoyé{client.emails_sent > 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                </div>
                <svg className="w-4 h-4 text-muted-foreground flex-shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                </svg>
              </Link>
            )
          })}
        </div>
      )}

      <ClientForm open={showForm} onClose={() => setShowForm(false)} onCreated={load} />
    </div>
  )
}
