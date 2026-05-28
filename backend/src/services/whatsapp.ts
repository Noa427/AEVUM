const BASE = 'https://graph.facebook.com/v19.0'

export async function validateWhatsApp(
  phoneNumberId: string,
  accessToken: string
): Promise<{ phone_number: string }> {
  const res = await fetch(`${BASE}/${phoneNumberId}?fields=display_phone_number&access_token=${accessToken}`)
  if (!res.ok) {
    const err = await res.json() as any
    throw new Error(`Meta API validation échouée: ${err?.error?.message ?? res.status}`)
  }
  const data = await res.json() as any
  return { phone_number: data.display_phone_number as string }
}

export async function sendWhatsApp(opts: {
  phoneNumberId: string
  accessToken: string
  to: string
  body: string
}): Promise<void> {
  const res = await fetch(`${BASE}/${opts.phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: opts.to,
      type: 'text',
      text: { body: opts.body },
    }),
  })
  if (!res.ok) {
    const err = await res.json() as any
    throw new Error(`WhatsApp send failed: ${err?.error?.message ?? res.status}`)
  }
}
