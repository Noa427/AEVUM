import Anthropic from '@anthropic-ai/sdk'
import { supabase } from './supabase'
import { decrypt } from './encryption'

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 529])

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: any
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err: any) {
      lastErr = err
      const isTransient = RETRYABLE_STATUSES.has(err?.status) || err?.code === 'ECONNRESET' || err?.code === 'ETIMEDOUT'
      if (!isTransient || i === attempts - 1) throw err
      const delay = 1000 * Math.pow(2, i)
      console.warn(`[claude] tentative ${i + 1}/${attempts} échouée (${err?.status ?? err?.code}), retry dans ${delay}ms`)
      await new Promise(r => setTimeout(r, delay))
    }
  }
  throw lastErr
}

async function getApiKey(): Promise<string> {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY
  const { data } = await supabase.from('settings').select('value').eq('key', 'anthropic_api_key').single()
  if (!data?.value) throw new Error('Clé API Anthropic non configurée')
  return decrypt(data.value)
}

async function callAnthropicMessage(userMessage: string, model: string, system?: string): Promise<string> {
  const apiKey = await getApiKey()
  const anthropic = new Anthropic({ apiKey })
  return withRetry(async () => {
    const message = await anthropic.messages.create({
      model,
      max_tokens: 1024,
      ...(system ? { system } : {}),
      messages: [{ role: 'user', content: userMessage }],
    })
    const block = message.content[0]
    if (!block || block.type !== 'text') throw new Error('Réponse Claude inattendue')
    return block.text
  })
}

export async function callClaude(prompt: string, model = 'claude-haiku-4-5-20251001'): Promise<string> {
  return callAnthropicMessage(prompt, model)
}

export async function callClaudeChat(userMessage: string, system: string, model = 'claude-haiku-4-5-20251001'): Promise<string> {
  return callAnthropicMessage(userMessage, model, system)
}
