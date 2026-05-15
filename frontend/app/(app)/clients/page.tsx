'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { ClientForm } from '@/components/client-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'

interface ClientRow {
  id: string
  name: string
  email: string
  created_at: string
  pending_tasks: number
  emails_sent: number
}

interface PilierConfigs {
  support_email_enabled: string
  support_auto_reply: string
  politique_remboursement: string
  upsell_enabled: string
  upsell_product_name: string
  upsell_url: string
  upsell_price: string
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientRow[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingClient, setEditingClient] = useState<ClientRow | null>(null)
  const [webhookClient, setWebhookClient] = useState<ClientRow | null>(null)
  const [pilierClient, setPilierClient] = useState<ClientRow | null>(null)
  const [pilierConfigs, setPilierConfigs] = useState<Partial<PilierConfigs>>({})
  const [pilierLoading, setPilierLoading] = useState(false)

  async function load() {
    const data = await api.get<ClientRow[]>('/api/clients')
    setClients(data)
  }

  useEffect(() => { load() }, [])

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ce client ?')) return
    try {
      await api.delete(`/api/clients/${id}`)
      toast.success('Client supprimé avec succès')
      await load()
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de la suppression')
    }
  }

  async function openPilierModal(client: ClientRow) {
    setPilierClient(client)
    setPilierConfigs({})
    try {
      const data = await api.get<Partial<PilierConfigs>>(`/api/clients/${client.id}/configs`)
      setPilierConfigs(data)
    } catch { /* configs vides */ }
  }

  function setPilier(key: keyof PilierConfigs, value: string) {
    setPilierConfigs(c => ({ ...c, [key]: value }))
  }

  async function savePilierConfigs() {
    if (!pilierClient) return
    setPilierLoading(true)
    try {
      await api.put(`/api/clients/${pilierClient.id}/configs`, pilierConfigs)
      toast.success('Configuration enregistrée')
      setPilierClient(null)
    } catch (err: any) {
      toast.error(err.message || 'Erreur')
    } finally {
      setPilierLoading(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* En-tête */}
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

      {/* Liste ou empty state */}
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
            Ajoutez votre premier client pour commencer à automatiser vos emails de relance et d&apos;onboarding.
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
              <div key={client.id} className="flex items-center justify-between px-4 py-3.5 list-row">
                {/* Avatar + infos */}
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

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setWebhookClient(client)}
                    className="text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
                    </svg>
                    Webhook
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openPilierModal(client)}
                    className="text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"/>
                    </svg>
                    Piliers
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingClient(client)}
                    className="text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                    </svg>
                    Modifier
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(client.id)}
                    className="text-xs gap-1.5 text-muted-foreground hover:text-destructive"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                    Supprimer
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Formulaire création */}
      <ClientForm
        open={showForm}
        onClose={() => setShowForm(false)}
        onCreated={load}
      />

      {/* Formulaire édition */}
      <ClientForm
        open={!!editingClient}
        initialData={editingClient ?? undefined}
        onClose={() => setEditingClient(null)}
        onCreated={() => { setEditingClient(null); load() }}
      />

      {/* Modal webhook */}
      <Dialog open={!!webhookClient} onOpenChange={() => setWebhookClient(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>URL Webhook Stripe — {webhookClient?.name}</DialogTitle>
          </DialogHeader>
          {webhookClient && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Collez cette URL dans votre tableau de bord Stripe → Webhooks → Ajouter un endpoint.
              </p>
              <div className="relative">
                <div className="bg-muted rounded-lg p-3 pr-10 text-sm font-mono break-all select-all border border-border/60">
                  {API_URL}/api/webhooks/stripe/{webhookClient.id}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Événements à écouter :{' '}
                <code className="bg-muted px-1 py-0.5 rounded text-xs">invoice.payment_failed</code>
                {', '}
                <code className="bg-muted px-1 py-0.5 rounded text-xs">checkout.session.completed</code>
              </p>
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => navigator.clipboard.writeText(`${API_URL}/api/webhooks/stripe/${webhookClient.id}`)}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                </svg>
                Copier l&apos;URL
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal piliers 3 & 4 */}
      <Dialog open={!!pilierClient} onOpenChange={() => setPilierClient(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Piliers IA — {pilierClient?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 mt-2">

            {/* Pilier 3 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                <p className="text-sm font-semibold">Pilier 3 — Support client IA</p>
              </div>
              <div className="space-y-2 pl-3.5 border-l border-border/60">
                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <span className="text-sm text-muted-foreground">Activer le support email</span>
                  <input
                    type="checkbox"
                    checked={pilierConfigs.support_email_enabled === 'true'}
                    onChange={e => setPilier('support_email_enabled', e.target.checked ? 'true' : 'false')}
                    className="w-4 h-4 accent-primary"
                  />
                </label>
                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <span className="text-sm text-muted-foreground">Réponse automatique (sauf &apos;autre&apos;)</span>
                  <input
                    type="checkbox"
                    checked={pilierConfigs.support_auto_reply !== 'false'}
                    onChange={e => setPilier('support_auto_reply', e.target.checked ? 'true' : 'false')}
                    className="w-4 h-4 accent-primary"
                  />
                </label>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Politique de remboursement (utilisée dans les réponses IA)</p>
                  <textarea
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-y focus:outline-none focus:ring-2 focus:ring-ring/50"
                    placeholder="Ex: Remboursement possible sous 30 jours sur demande par email..."
                    value={pilierConfigs.politique_remboursement ?? ''}
                    onChange={e => setPilier('politique_remboursement', e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Pilier 4 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <p className="text-sm font-semibold">Pilier 4 — Upsell automatique J+30</p>
              </div>
              <div className="space-y-2 pl-3.5 border-l border-border/60">
                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <span className="text-sm text-muted-foreground">Activer l&apos;upsell automatique</span>
                  <input
                    type="checkbox"
                    checked={pilierConfigs.upsell_enabled === 'true'}
                    onChange={e => setPilier('upsell_enabled', e.target.checked ? 'true' : 'false')}
                    className="w-4 h-4 accent-primary"
                  />
                </label>
                <Input
                  placeholder="Nom de l'offre upsell (ex: Masterclass avancée)"
                  value={pilierConfigs.upsell_product_name ?? ''}
                  onChange={e => setPilier('upsell_product_name', e.target.value)}
                />
                <Input
                  placeholder="URL de la page de vente"
                  value={pilierConfigs.upsell_url ?? ''}
                  onChange={e => setPilier('upsell_url', e.target.value)}
                />
                <Input
                  placeholder="Prix affiché (ex: 297€)"
                  value={pilierConfigs.upsell_price ?? ''}
                  onChange={e => setPilier('upsell_price', e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
              <Button variant="outline" onClick={() => setPilierClient(null)}>Annuler</Button>
              <Button onClick={savePilierConfigs} disabled={pilierLoading}>
                {pilierLoading ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
