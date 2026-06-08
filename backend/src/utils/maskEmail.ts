// Masque un email pour les logs : conserve les 3 premiers caractères + domaine (ex: noa***@gmail.com)
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return '***'
  return `${local.slice(0, 3)}***@${domain}`
}
