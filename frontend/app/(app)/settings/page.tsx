'use client'
import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { api } from '@/lib/api'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface SettingsData {
  auto_mode: boolean
  has_api_key: boolean
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsData>({ auto_mode: false, has_api_key: false })
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    api.get<SettingsData>('/api/settings').then(setSettings)
  }, [])

  async function saveApiKey() {
    if (!apiKey) return
    setSaving(true)
    setMessage(null)
    try {
      await api.put('/api/settings', { anthropic_api_key: apiKey })
      setSettings(s => ({ ...s, has_api_key: true }))
      setApiKey('')
      setMessage({ text: 'Clé sauvegardée ✓', ok: true })
    } catch (err: any) {
      setMessage({ text: err.message, ok: false })
    } finally {
      setSaving(false)
    }
  }

  async function testApiKey() {
    setTesting(true)
    setMessage(null)
    try {
      await api.get('/api/settings/test-anthropic')
      setMessage({ text: 'Clé valide ✓', ok: true })
    } catch (err: any) {
      setMessage({ text: err.message, ok: false })
    } finally {
      setTesting(false)
    }
  }

  async function toggleAutoMode(checked: boolean) {
    try {
      await api.put('/api/settings', { auto_mode: checked })
      setSettings(s => ({ ...s, auto_mode: checked }))
    } catch (err: any) {
      setMessage({ text: err.message, ok: false })
    }
  }

  return (
    <div className="space-y-8 max-w-lg">
      <h1 className="text-2xl font-semibold">Paramètres</h1>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-medium">Clé API Anthropic</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {settings.has_api_key ? 'Une clé est déjà enregistrée.' : 'Nécessaire pour activer le mode automatique.'}
          </p>
        </div>
        <div className="flex gap-2">
          <Input
            type="password"
            placeholder={settings.has_api_key ? '••••••••••••••••' : 'sk-ant-api03-...'}
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            className="font-mono text-xs"
          />
          <Button onClick={saveApiKey} disabled={saving || !apiKey} className="btn-glow">
            {saving ? 'Vérification...' : 'Sauvegarder'}
          </Button>
          {settings.has_api_key && (
            <Button variant="outline" onClick={testApiKey} disabled={testing}>
              {testing ? '...' : 'Tester'}
            </Button>
          )}
        </div>
        {message && (
          <p className={`text-sm ${message.ok ? 'text-green-500' : 'text-destructive'}`}>{message.text}</p>
        )}
      </section>

      <section className="flex items-center justify-between py-4 border-t border-border">
        <div>
          <p className="text-sm font-medium">Mode automatique</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {settings.has_api_key
              ? 'Les webhooks sont traités automatiquement via Claude API.'
              : 'Nécessite une clé API Anthropic valide.'}
          </p>
        </div>
        <Switch
          checked={settings.auto_mode}
          onCheckedChange={toggleAutoMode}
          disabled={!settings.has_api_key}
        />
      </section>

      <section className="py-4 border-t border-border space-y-2">
        <p className="text-sm font-medium">Domaine email</p>
        <p className="text-xs text-muted-foreground">
          En MVP, les emails sont envoyés depuis le domaine configuré dans <code className="font-mono">RESEND_FROM_DOMAIN</code>.
          Si absent, le domaine de test Resend (<code className="font-mono">onboarding@resend.dev</code>) est utilisé.
          Le nom de l'expéditeur est personnalisé par client (champ "Nom expéditeur" dans la fiche client).
        </p>
      </section>

      <section className="py-4 border-t border-border space-y-3">
        <div>
          <p className="text-sm font-medium">Thème</p>
          <p className="text-xs text-muted-foreground mt-0.5">Clair, Sombre, ou selon les préférences système.</p>
        </div>
        <div className="flex gap-2">
          <Button variant={theme === 'light' ? 'default' : 'outline'} size="sm" onClick={() => setTheme('light')}>
            Clair
          </Button>
          <Button variant={theme === 'dark' ? 'default' : 'outline'} size="sm" onClick={() => setTheme('dark')}>
            Sombre
          </Button>
          <Button variant={theme === 'system' ? 'default' : 'outline'} size="sm" onClick={() => setTheme('system')}>
            Automatique
          </Button>
        </div>
      </section>
    </div>
  )
}
