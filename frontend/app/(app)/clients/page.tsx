'use client'
import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { ClientForm } from '@/components/client-form'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface ClientRow {
  id: string
  name: string
  email: string
  created_at: string
  pending_tasks: number
  emails_sent: number
  plan: 'standard' | 'premium'
  payment_status: 'active' | 'unpaid'
  addons: string[]
}

const MRR = { standard: 690, premium: 1290, addon_f11: 200, addon_f13: 350, addon_f18: 149 }

function calcMrr(plan: string, addons: string[]): number {
  const base = plan === 'premium' ? MRR.premium : MRR.standard
  return base
    + (addons.includes('addon_f11') ? MRR.addon_f11 : 0)
    + (addons.includes('addon_f13') ? MRR.addon_f13 : 0)
    + (addons.includes('addon_f18') ? MRR.addon_f18 : 0)
}

function fmt(n: number): string {
  return n.toLocaleString('fr-FR')
}

type FilterPlan = 'all' | 'standard' | 'premium'
type FilterPayment = 'all' | 'active' | 'unpaid'
type FilterAddon = 'all' | 'addon_f11' | 'addon_f13' | 'addon_f18' | 'none'
type SortBy = 'name_asc' | 'name_desc' | 'mrr_desc' | 'mrr_asc' | 'plan' | 'date_desc'

const ADDON_META = [
  { key: 'addon_f11', label: 'F11', price: '+200€', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  { key: 'addon_f13', label: 'F13', price: '+350€', color: 'bg-violet-500/10 text-violet-400 border-violet-500/30' },
  { key: 'addon_f18', label: 'F18', price: '+149€', color: 'bg-rose-500/10 text-rose-400 border-rose-500/30' },
]

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientRow[]>([])
  const [search, setSearch] = useState('')
  const [filterPlan, setFilterPlan] = useState<FilterPlan>('all')
  const [filterPayment, setFilterPayment] = useState<FilterPayment>('all')
  const [filterAddon, setFilterAddon] = useState<FilterAddon>('all')
  const [sortBy, setSortBy] = useState<SortBy>('date_desc')
  const [showForm, setShowForm] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)

  async function load() {
    try {
      const data = await api.get<ClientRow[]>('/api/clients')
      setClients(data)
    } catch (err: any) {
      console.error(err.message)
    }
  }

  useEffect(() => { load() }, [])

  async function updatePlan(client: ClientRow, plan: 'standard' | 'premium') {
    setSavingId(client.id + ':plan')
    try {
      await api.put(`/api/clients/${client.id}`, { name: client.name, email: client.email, plan })
      setClients(cs => cs.map(c => c.id === client.id ? { ...c, plan } : c))
    } catch (err: any) {
      toast.error(err.message || 'Erreur')
    } finally {
      setSavingId(null)
    }
  }

  async function toggleAddon(client: ClientRow, addonKey: string) {
    setSavingId(client.id + ':' + addonKey)
    const isActive = client.addons.includes(addonKey)
    const newValue = isActive ? 'false' : 'true'
    try {
      await api.put(`/api/clients/${client.id}/configs`, { [addonKey]: newValue })
      setClients(cs => cs.map(c => {
        if (c.id !== client.id) return c
        const addons = isActive
          ? c.addons.filter(a => a !== addonKey)
          : [...c.addons, addonKey]
        return { ...c, addons }
      }))
    } catch (err: any) {
      toast.error(err.message || 'Erreur')
    } finally {
      setSavingId(null)
    }
  }

  async function togglePayment(client: ClientRow) {
    setSavingId(client.id + ':payment')
    const payment_status = client.payment_status === 'active' ? 'unpaid' : 'active'
    try {
      await api.put(`/api/clients/${client.id}`, { name: client.name, email: client.email, payment_status })
      setClients(cs => cs.map(c => c.id === client.id ? { ...c, payment_status } : c))
    } catch (err: any) {
      toast.error(err.message || 'Erreur')
    } finally {
      setSavingId(null)
    }
  }

  const activeFilters: string[] = []
  if (filterPlan !== 'all') activeFilters.push(`Plan: ${filterPlan === 'standard' ? 'Standard' : 'Premium'}`)
  if (filterPayment !== 'all') activeFilters.push(`Paiement: ${filterPayment === 'active' ? 'Actif' : 'Impayé'}`)
  if (filterAddon !== 'all') activeFilters.push(filterAddon === 'none' ? 'Sans option' : `Avec ${filterAddon.replace('addon_', '').toUpperCase()}`)
  const sortLabel: Record<SortBy, string> = {
    name_asc: 'Nom A→Z', name_desc: 'Nom Z→A',
    mrr_desc: 'MRR ↓', mrr_asc: 'MRR ↑',
    plan: 'Plan', date_desc: 'Date création',
  }
  if (sortBy !== 'date_desc') activeFilters.push(`Tri: ${sortLabel[sortBy]}`)

  function resetFilters() {
    setSearch('')
    setFilterPlan('all')
    setFilterPayment('all')
    setFilterAddon('all')
    setSortBy('date_desc')
  }

  const filtered = useMemo(() => {
    let result = [...clients]
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(c => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q))
    }
    if (filterPlan !== 'all') result = result.filter(c => c.plan === filterPlan)
    if (filterPayment !== 'all') result = result.filter(c => c.payment_status === filterPayment)
    if (filterAddon === 'none') result = result.filter(c => c.addons.length === 0)
    else if (filterAddon !== 'all') result = result.filter(c => c.addons.includes(filterAddon))
    result.sort((a, b) => {
      if (sortBy === 'name_asc') return a.name.localeCompare(b.name, 'fr')
      if (sortBy === 'name_desc') return b.name.localeCompare(a.name, 'fr')
      if (sortBy === 'mrr_desc') return calcMrr(b.plan, b.addons) - calcMrr(a.plan, a.addons)
      if (sortBy === 'mrr_asc') return calcMrr(a.plan, a.addons) - calcMrr(b.plan, b.addons)
      if (sortBy === 'plan') return b.plan.localeCompare(a.plan)
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
    return result
  }, [clients, search, filterPlan, filterPayment, filterAddon, sortBy])

  const totalMrr = clients.reduce((a, c) => a + calcMrr(c.plan, c.addons), 0)
  const selectCls = "rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 transition-shadow"

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {clients.length > 0
              ? `${clients.length} client${clients.length > 1 ? 's' : ''} · MRR ${fmt(totalMrr)}€`
              : 'Gérez vos clients et leurs plans'}
          </p>
        </div>
        <Button onClick={() => setShowForm(true)} className="btn-glow gap-2">
          <span className="text-base leading-none">+</span> Nouveau client
        </Button>
      </div>

      {/* Barre de contrôle */}
      {clients.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-card/40 p-4 space-y-3">
          <input
            type="text"
            placeholder="Rechercher par nom ou email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={`${selectCls} w-full`}
          />
          <div className="flex gap-2 flex-wrap items-center">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Filtrer</span>
            <select value={filterPlan} onChange={e => setFilterPlan(e.target.value as FilterPlan)} className={selectCls}>
              <option value="all">Tous les plans</option>
              <option value="standard">Standard</option>
              <option value="premium">Premium</option>
            </select>
            <select value={filterPayment} onChange={e => setFilterPayment(e.target.value as FilterPayment)} className={selectCls}>
              <option value="all">Tous statuts</option>
              <option value="active">✓ Actif</option>
              <option value="unpaid">✗ Impayé</option>
            </select>
            <select value={filterAddon} onChange={e => setFilterAddon(e.target.value as FilterAddon)} className={selectCls}>
              <option value="all">Toutes options</option>
              <option value="addon_f11">Avec F11</option>
              <option value="addon_f13">Avec F13</option>
              <option value="addon_f18">Avec F18</option>
              <option value="none">Sans option</option>
            </select>
            <div className="w-px h-5 bg-border mx-1" />
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Trier</span>
            <select value={sortBy} onChange={e => setSortBy(e.target.value as SortBy)} className={selectCls}>
              <option value="date_desc">Date création</option>
              <option value="name_asc">Nom A→Z</option>
              <option value="name_desc">Nom Z→A</option>
              <option value="mrr_desc">MRR ↓</option>
              <option value="mrr_asc">MRR ↑</option>
              <option value="plan">Plan</option>
            </select>
            {activeFilters.length > 0 && (
              <button onClick={resetFilters} className="text-xs text-muted-foreground hover:text-foreground transition-colors ml-1">
                ✕ Réinit.
              </button>
            )}
          </div>
          {activeFilters.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Actifs :</span>
              {activeFilters.map(f => (
                <span key={f} className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">{f}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tableau ou empty state */}
      {clients.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border border-border/60 rounded-xl bg-card/40">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
            </svg>
          </div>
          <p className="text-sm font-semibold mb-1">Aucun client pour l&apos;instant</p>
          <p className="text-xs text-muted-foreground mb-5 max-w-xs">Ajoutez votre premier client pour commencer.</p>
          <Button onClick={() => setShowForm(true)} className="btn-glow gap-2">
            <span className="text-base leading-none">+</span> Ajouter votre premier client
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 border border-border/60 rounded-xl bg-card/40">
          <p className="text-sm text-muted-foreground">Aucun résultat pour ces filtres.</p>
          <button onClick={resetFilters} className="text-xs text-primary hover:underline mt-2">Réinitialiser</button>
        </div>
      ) : (
        <div className="border border-border/60 rounded-xl overflow-hidden bg-card/30">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-card/60 text-xs text-muted-foreground">
                  <th className="text-left px-4 py-3 font-medium">Client</th>
                  <th className="text-center px-3 py-3 font-medium">Plan</th>
                  <th className="text-center px-3 py-3 font-medium">Options</th>
                  <th className="text-right px-3 py-3 font-medium">MRR</th>
                  <th className="text-center px-3 py-3 font-medium">Paiement</th>
                  <th className="text-center px-3 py-3 font-medium">Tâches</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filtered.map(client => {
                  const initials = client.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
                  const mrr = calcMrr(client.plan, client.addons)
                  const mrrColor = client.payment_status === 'unpaid' ? 'text-red-400' : client.plan === 'premium' ? 'text-emerald-400' : 'text-indigo-400'
                  return (
                    <tr key={client.id} className="hover:bg-accent/30 transition-colors">
                      {/* Client */}
                      <td className="px-4 py-3">
                        <Link href={`/clients/${client.id}`} className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-semibold text-primary">{initials}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium truncate hover:text-primary transition-colors">{client.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{client.email}</p>
                          </div>
                        </Link>
                      </td>
                      {/* Plan dropdown */}
                      <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                        <select
                          value={client.plan}
                          onChange={e => updatePlan(client, e.target.value as 'standard' | 'premium')}
                          disabled={savingId === client.id + ':plan'}
                          className={`rounded-md border px-2 py-1 text-xs font-semibold cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring/50 disabled:opacity-50 ${
                            client.plan === 'premium'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
                          }`}
                        >
                          <option value="standard">Standard</option>
                          <option value="premium">Premium</option>
                        </select>
                      </td>
                      {/* Options badges */}
                      <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex gap-1.5 justify-center flex-wrap">
                          {ADDON_META.map(({ key, label, price, color }) => {
                            const active = client.addons.includes(key)
                            const saving = savingId === client.id + ':' + key
                            return (
                              <button
                                key={key}
                                onClick={() => toggleAddon(client, key)}
                                disabled={saving}
                                title={price}
                                className={`rounded-full border px-2 py-0.5 text-[10px] font-bold transition-all disabled:opacity-50 ${
                                  active ? color : 'bg-transparent text-muted-foreground/40 border-border/40 hover:border-border'
                                }`}
                              >
                                {saving ? '…' : active ? `${label} ✓` : label}
                              </button>
                            )
                          })}
                        </div>
                      </td>
                      {/* MRR */}
                      <td className={`px-3 py-3 text-right font-bold tabular-nums ${mrrColor}`}>
                        {fmt(mrr)}€
                      </td>
                      {/* Paiement toggle */}
                      <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => togglePayment(client)}
                          disabled={savingId === client.id + ':payment'}
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold border transition-all disabled:opacity-50 ${
                            client.payment_status === 'active'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                              : 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${client.payment_status === 'active' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                          {savingId === client.id + ':payment' ? '…' : client.payment_status === 'active' ? 'actif' : 'impayé'}
                        </button>
                      </td>
                      {/* Tâches */}
                      <td className="px-3 py-3 text-center">
                        {client.pending_tasks > 0 ? (
                          <Link href={`/clients/${client.id}`} className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/15 text-amber-400 text-xs font-bold hover:bg-amber-500/25 transition-colors">
                            {client.pending_tasks}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground/30 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {filtered.length < clients.length && (
            <div className="px-4 py-2.5 border-t border-border/60 text-xs text-muted-foreground text-right">
              {filtered.length} / {clients.length} client{clients.length > 1 ? 's' : ''} affichés
            </div>
          )}
        </div>
      )}

      <ClientForm open={showForm} onClose={() => setShowForm(false)} onCreated={load} />
    </div>
  )
}
