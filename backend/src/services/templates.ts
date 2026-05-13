export type TaskType = 'failed_payment' | 'onboarding_j0' | 'onboarding_j3' | 'onboarding_j7'

export function getTemplate(
  task_type: TaskType,
  ctx: Record<string, any>
): { subject_hint: string; prompt: string } {
  switch (task_type) {
    case 'failed_payment':
      return { subject_hint: 'Relance paiement', prompt: buildPromptFailedPayment(ctx) }
    case 'onboarding_j0':
      return { subject_hint: 'Bienvenue', prompt: buildPromptOnboardingJ0(ctx) }
    case 'onboarding_j3':
      return { subject_hint: 'Suivi J+3', prompt: buildPromptOnboardingJ3(ctx) }
    case 'onboarding_j7':
      return { subject_hint: 'Engagement J+7', prompt: buildPromptOnboardingJ7(ctx) }
  }
}

export function buildPromptFailedPayment(ctx: Record<string, any>): string {
  const lines = [
    'Tu es expert en communication pour formateurs en ligne.',
    'Rédige un email de relance pour un élève dont le paiement a échoué.',
    '',
    `Formateur : ${ctx.sender_name ?? 'Formateur'}`,
  ]
  if (ctx.student_name) lines.push(`Prénom élève : ${ctx.student_name}`)
  if (ctx.product_name) lines.push(`Formation : ${ctx.product_name}`)
  const link = ctx.payment_link ?? ctx.hosted_invoice_url ?? ''
  lines.push(
    `Montant : ${ctx.amount}€`,
    `Lien de paiement : ${link}`,
    '',
    'Format de ta réponse (OBLIGATOIRE) :',
    '[SUBJECT]Objet de l\'email[/SUBJECT]',
    '',
    '<p>...</p>',
    `<p>...<a href="${link}">Régulariser mon paiement</a>...</p>`,
    '',
    'Ton empathique et professionnel, 3 paragraphes max.',
    'HTML simple uniquement : <p>, <strong>, <a> autorisés.',
  )
  return lines.join('\n')
}

function buildPromptOnboardingJ0(ctx: Record<string, any>): string {
  return [
    'Tu es expert en communication pour formateurs en ligne.',
    'Rédige un email de bienvenue chaleureux pour un nouvel élève qui vient d\'acheter une formation.',
    '',
    `Formateur : ${ctx.sender_name ?? 'Formateur'}`,
    ctx.student_name ? `Prénom élève : ${ctx.student_name}` : '',
    ctx.product_name ? `Formation : ${ctx.product_name}` : '',
    '',
    'Contenu attendu : accueillir chaleureusement, expliquer les prochaines étapes (accès à l\'espace formation), encourager à commencer.',
    '',
    'Format de ta réponse (OBLIGATOIRE) :',
    '[SUBJECT]Objet de l\'email[/SUBJECT]',
    '',
    '<p>...</p>',
    '',
    'Ton enthousiaste et professionnel, 3 paragraphes max.',
    'HTML simple uniquement : <p>, <strong>, <a> autorisés.',
  ].filter(Boolean).join('\n')
}

function buildPromptOnboardingJ3(ctx: Record<string, any>): string {
  return [
    'Tu es expert en communication pour formateurs en ligne.',
    'Rédige un email de suivi pour un élève qui a commencé une formation il y a 3 jours.',
    '',
    `Formateur : ${ctx.sender_name ?? 'Formateur'}`,
    ctx.student_name ? `Prénom élève : ${ctx.student_name}` : '',
    ctx.product_name ? `Formation : ${ctx.product_name}` : '',
    '',
    'Contenu attendu : demander comment se passe la formation, s\'il a des questions, l\'encourager à continuer.',
    '',
    'Format de ta réponse (OBLIGATOIRE) :',
    '[SUBJECT]Objet de l\'email[/SUBJECT]',
    '',
    '<p>...</p>',
    '',
    'Ton bienveillant et accessible, 2-3 paragraphes max.',
    'HTML simple uniquement : <p>, <strong>, <a> autorisés.',
  ].filter(Boolean).join('\n')
}

function buildPromptOnboardingJ7(ctx: Record<string, any>): string {
  return [
    'Tu es expert en communication pour formateurs en ligne.',
    'Rédige un email d\'engagement pour un élève qui a commencé une formation il y a 7 jours.',
    '',
    `Formateur : ${ctx.sender_name ?? 'Formateur'}`,
    ctx.student_name ? `Prénom élève : ${ctx.student_name}` : '',
    ctx.product_name ? `Formation : ${ctx.product_name}` : '',
    '',
    'Contenu attendu : célébrer la première semaine, proposer un appel stratégique ou un contenu bonus, renforcer la motivation.',
    '',
    'Format de ta réponse (OBLIGATOIRE) :',
    '[SUBJECT]Objet de l\'email[/SUBJECT]',
    '',
    '<p>...</p>',
    '',
    'Ton motivant et généreux, 3 paragraphes max.',
    'HTML simple uniquement : <p>, <strong>, <a> autorisés.',
  ].filter(Boolean).join('\n')
}

// Alias pour compatibilité avec code existant qui importe buildPrompt
export function buildPrompt(params: {
  sender_name: string
  amount: number
  payment_link: string
  student_name?: string
  product_name?: string
}): string {
  return buildPromptFailedPayment({ ...params, hosted_invoice_url: params.payment_link })
}

export function parseClaudeResponse(response: string): { subject: string; body_html: string } {
  const trimmed = response.trim()

  // Format 1 : [SUBJECT]...[/SUBJECT]
  const subjectMatch = trimmed.match(/\[SUBJECT\]([\s\S]*?)\[\/SUBJECT\]/)
  if (subjectMatch) {
    const subject = subjectMatch[1].trim()
    const body_html = trimmed
      .replace(/\[SUBJECT\][\s\S]*?\[\/SUBJECT\]/, '')
      .trim()
    return { subject, body_html }
  }

  // Format 2 : "Objet: ..." (legacy)
  const lines = trimmed.split('\n')
  const subjectIdx = lines.findIndex(l => /^Objet:\s*/i.test(l))
  if (subjectIdx !== -1) {
    const subject = lines[subjectIdx].replace(/^Objet:\s*/i, '').trim()
    let bodyStart = subjectIdx + 1
    while (bodyStart < lines.length && lines[bodyStart].trim() === '') bodyStart++
    const body_html = lines.slice(bodyStart).join('\n').trim()
    return { subject, body_html }
  }

  throw new Error('Format Claude invalide : [SUBJECT][/SUBJECT] ou "Objet:" manquant')
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function wrapEmailHtml(body_html: string, sender_name: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
  ${body_html}
  <hr style="border:none;border-top:1px solid #eee;margin:30px 0">
  <p style="font-size:12px;color:#999">Envoyé via AEVUM pour ${escapeHtml(sender_name)}</p>
</body>
</html>`
}
