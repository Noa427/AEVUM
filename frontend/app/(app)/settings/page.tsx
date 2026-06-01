'use client'
import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { api } from '@/lib/api'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface SettingsData {
  auto_mode: boolean
  has_api_key: boolean
  infra_monthly_cost: number
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsData>({ auto_mode: false, has_api_key: false, infra_monthly_cost: 0 })
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const [showKey, setShowKey] = useState(false)
  const [infraCost, setInfraCost] = useState('')
  const [savingInfra, setSavingInfra] = useState(false)
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    api.get<SettingsData>('/api/settings').then(s => {
      setSettings(s)
      setInfraCost(s.infra_monthly_cost > 0 ? String(s.infra_monthly_cost) : '')
    })
  }, [])

  async function saveApiKey() {
    if (!apiKey) return
    setSaving(true)
    setMessage(null)
    try {
      await api.put('/api/settings', { anthropic_api_key: apiKey })
      setSettings(s => ({ ...s, has_api_key: true }))
      setApiKey('')
      toast.success('Clé API Anthropic sauvegardée')
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  async function testApiKey() {
    setTesting(true)
    setMessage(null)
    try {
      await api.get('/api/settings/test-anthropic')
      toast.success('Clé API valide')
    } catch (err: any) {
      toast.error(err.message || 'Clé API invalide')
    } finally {
      setTesting(false)
    }
  }

  async function saveInfraCost() {
    const val = parseFloat(infraCost)
    if (isNaN(val) || val < 0) return
    setSavingInfra(true)
    try {
      await api.put('/api/settings', { infra_monthly_cost: val })
      setSettings(s => ({ ...s, infra_monthly_cost: val }))
      toast.success('Coût infra enregistré')
    } catch (err: any) {
      toast.error(err.message || 'Erreur')
    } finally {
      setSavingInfra(false)
    }
  }

  async function toggleAutoMode(checked: boolean) {
    try {
      await api.put('/api/settings', { auto_mode: checked })
      setSettings(s => ({ ...s, auto_mode: checked }))
      toast.success(checked ? 'Mode automatique activé' : 'Mode automatique désactivé')
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors du changement de mode')
    }
  }

  const sectionClass = "rounded-xl border border-border/60 bg-card/40 p-5 space-y-4"

  return (
    <div className="space-y-6 max-w-lg animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Paramètres</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Configurez votre instance AEVUM APP.</p>
      </div>

      {/* ── Clé API Anthropic ─────────────────────────────────── */}
      <div className={sectionClass}>
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg className="w-4 h-4 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">Clé API Anthropic</h2>
              {settings.has_api_key && (
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold badge-sent">
                  ✓ configurée
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {settings.has_api_key
                ? 'Une clé est déjà enregistrée. Saisissez-en une nouvelle pour la remplacer.'
                : 'Nécessaire pour activer le mode automatique.'}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              type={showKey ? 'text' : 'password'}
              placeholder={settings.has_api_key ? '••••••••••••••••' : 'sk-ant-api03-...'}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              className="font-mono text-xs pr-9"
            />
            <button
              type="button"
              onClick={() => setShowKey(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={showKey ? 'Masquer' : 'Afficher'}
            >
              {showKey ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                </svg>
              )}
            </button>
          </div>
          <Button onClick={saveApiKey} disabled={saving || !apiKey} className="btn-glow gap-1.5 flex-shrink-0">
            {saving ? <><span className="spinner" /> Enregistrement…</> : 'Sauvegarder'}
          </Button>
          {settings.has_api_key && (
            <Button variant="outline" onClick={testApiKey} disabled={testing} className="gap-1.5 flex-shrink-0">
              {testing ? <><span className="spinner" /> Test…</> : 'Tester'}
            </Button>
          )}
        </div>

        {message && (
          <p className={`text-sm flex items-center gap-1.5 ${message.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
            {message.ok ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            )}
            {message.text}
          </p>
        )}
      </div>

      {/* ── Mode automatique ──────────────────────────────────── */}
      <div className={sectionClass}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
              settings.auto_mode ? 'bg-emerald-500/10' : 'bg-muted'
            }`}>
              <svg className={`w-4 h-4 ${settings.auto_mode ? 'text-emerald-500' : 'text-muted-foreground'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/>
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold">Mode automatique</p>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  settings.auto_mode ? 'badge-sent' : 'badge-pending'
                }`}>
                  {settings.auto_mode ? '● Actif' : '○ Inactif'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {settings.has_api_key
                  ? 'Les webhooks sont traités automatiquement via Claude API.'
                  : 'Nécessite une clé API Anthropic valide.'}
              </p>
            </div>
          </div>
          <Switch
            checked={settings.auto_mode}
            onCheckedChange={toggleAutoMode}
            disabled={!settings.has_api_key}
          />
        </div>
      </div>

      {/* ── Domaine email ─────────────────────────────────────── */}
      <div className={sectionClass}>
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold">Domaine email</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Les emails sont envoyés depuis le domaine configuré dans{' '}
              <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">RESEND_FROM_EMAIL</code>.
              {' '}Si absent, le domaine de test Resend{' '}
              <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">onboarding@resend.dev</code>{' '}
              est utilisé. Le nom de l&apos;expéditeur est personnalisé par client.
            </p>
          </div>
        </div>
      </div>

      {/* ── Thème ─────────────────────────────────────────────── */}
      <div className={sectionClass}>
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z"/>
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold">Thème de l&apos;interface</p>
            <p className="text-xs text-muted-foreground mt-0.5">Clair, Sombre, ou selon les préférences système.</p>
            <div className="flex gap-2 mt-3">
              <Button variant={theme === 'light' ? 'default' : 'outline'} size="sm" onClick={() => setTheme('light')} className="gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z"/>
                </svg>
                Clair
              </Button>
              <Button variant={theme === 'dark' ? 'default' : 'outline'} size="sm" onClick={() => setTheme('dark')} className="gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>
                </svg>
                Sombre
              </Button>
              <Button variant={theme === 'system' ? 'default' : 'outline'} size="sm" onClick={() => setTheme('system')} className="gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                </svg>
                Système
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Coût infrastructure ──────────────────────────────── */}
      <div className={sectionClass}>
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold">Coût infrastructure mensuel</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Render + Vercel + Supabase — utilisé pour calculer le profit net par client.
            </p>
            <div className="flex gap-2 mt-3">
              <div className="relative flex-1">
                <Input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="ex: 140"
                  value={infraCost}
                  onChange={e => setInfraCost(e.target.value)}
                  className="pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
              </div>
              <Button onClick={saveInfraCost} disabled={savingInfra || !infraCost} variant="outline" className="flex-shrink-0">
                {savingInfra ? 'Enregistrement…' : 'Sauvegarder'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ── À propos ──────────────────────────────────────────── */}
      <div className={`${sectionClass} !space-y-2`}>
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold">À propos</p>
            <div className="mt-1 space-y-1">
              <p className="text-xs text-muted-foreground">
                <span className="text-foreground font-medium">AEVUM APP</span> — v1.0.0
              </p>
              <p className="text-xs text-muted-foreground">
                Automatisation d&apos;emails Stripe → Claude → Resend.
              </p>
              <a
                href="mailto:support@automatepro.app"
                className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-1"
              >
                Contacter le support
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

