export function buildPrompt(params: {
  sender_name: string
  amount: number
  payment_link: string
  student_name?: string
  product_name?: string
}): string {
  const lines = [
    'Tu es expert en communication pour formateurs en ligne.',
    'Rédige un email de relance pour un élève dont le paiement a échoué.',
    '',
    `Formateur : ${params.sender_name}`,
  ]
  if (params.student_name) lines.push(`Prénom élève : ${params.student_name}`)
  if (params.product_name) lines.push(`Formation : ${params.product_name}`)
  lines.push(
    `Montant : ${params.amount}€`,
    `Lien de paiement : ${params.payment_link}`,
    '',
    'Format de ta réponse (OBLIGATOIRE) :',
    'Objet: [sujet de l\'email ici]',
    '',
    '<p>...</p>',
    `<p>...<a href="${params.payment_link}">Régulariser mon paiement</a>...</p>`,
    '',
    'Ton empathique et professionnel, 3 paragraphes max.',
    'HTML simple uniquement : <p>, <strong>, <a> autorisés.',
  )
  return lines.join('\n')
}

export function parseClaudeResponse(response: string): { subject: string; body_html: string } {
  const lines = response.trim().split('\n')
  const subject = lines[0].replace(/^Objet:\s*/i, '').trim()
  const body_html = lines.slice(2).join('\n').trim()
  return { subject, body_html }
}

export function wrapEmailHtml(body_html: string, sender_name: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
  ${body_html}
  <hr style="border:none;border-top:1px solid #eee;margin:30px 0">
  <p style="font-size:12px;color:#999">Envoyé via AEVUM pour ${sender_name}</p>
</body>
</html>`
}
