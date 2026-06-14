import { supabase } from './supabase'
import { decrypt } from './encryption'

export async function sendSlackNotification(text: string): Promise<void> {
  const { data } = await supabase.from('settings').select('value').eq('key', 'slack_webhook_url').maybeSingle()
  if (!data?.value) return

  let url: string
  try { url = decrypt(data.value) } catch { return }
  if (!url) return

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
  } catch { /* notification best-effort */ }
}
