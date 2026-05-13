// backend/src/services/claude.ts
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from './supabase'
import { decrypt } from './encryption'

export async function callClaude(prompt: string, model: string = 'claude-haiku-4-5-20251001'): Promise<string> {
  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'anthropic_api_key')
    .single()
  if (!data?.value) throw new Error('Clé API Anthropic non configurée')

  const apiKey = decrypt(data.value)
  const client = new Anthropic({ apiKey })
  const message = await client.messages.create({
    model,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })
  const block = message.content[0]
  if (!block || block.type !== 'text') throw new Error('Réponse Claude inattendue')
  return block.text
}
