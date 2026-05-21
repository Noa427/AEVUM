import argon2 from 'argon2'
import { randomBytes } from 'crypto'
import { supabase } from '../services/supabase'
import { sendEmail } from '../services/resend'

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
}

function generatePassword(): string {
  // 12 chars base64url, then inject guaranteed uppercase + digit
  let pass = randomBytes(9).toString('base64url').slice(0, 12)

  const hasUpper = /[A-Z]/.test(pass)
  const hasDigit = /[0-9]/.test(pass)

  if (!hasUpper) {
    const pos = randomBytes(1)[0] % 12
    pass = pass.slice(0, pos) + pass[pos].toUpperCase() + pass.slice(pos + 1)
  }
  if (!hasDigit) {
    const pos = randomBytes(1)[0] % 12
    const digit = String(randomBytes(1)[0] % 10)
    pass = pass.slice(0, pos) + digit + pass.slice(pos + 1)
  }

  return pass
}

export async function generateClientCredentials(clientId: string, clientEmail: string): Promise<void> {
  const password = generatePassword()
  const passwordHash = await argon2.hash(password, ARGON2_OPTIONS)

  const { error } = await supabase
    .from('clients')
    .update({
      client_email: clientEmail.toLowerCase(),
      password_hash: passwordHash,
      must_change_password: true,
    })
    .eq('id', clientId)

  if (error) throw new Error(error.message)

  const loginUrl = (process.env.VITRINE_URL || '') + '/login'

  await sendEmail({
    to: clientEmail,
    subject: 'Vos accès au portail AEVUM',
    html: `
      <p>Bonjour,</p>
      <p>Voici vos identifiants pour accéder à votre portail :</p>
      <p><strong>Email :</strong> ${clientEmail}</p>
      <p><strong>Mot de passe :</strong> ${password}</p>
      <p><a href="${loginUrl}">Se connecter au portail</a></p>
      <p>Modifiez votre mot de passe dès la première connexion dans Paramètres.</p>
    `,
  })
}
