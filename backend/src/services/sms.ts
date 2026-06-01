import twilio from 'twilio'

function getClient() {
  return twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
}

export async function sendSms(to: string, body: string): Promise<void> {
  const client = getClient()
  await client.messages.create({
    from: process.env.TWILIO_FROM_NUMBER!,
    to,
    body: body.slice(0, 160),
  })
}
