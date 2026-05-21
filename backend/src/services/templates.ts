export type TaskType =
  | 'failed_payment'
  | 'onboarding_j0'
  | 'onboarding_j3'
  | 'onboarding_j7'
  | 'support_manual'
  | 'upsell'

export type SupportCategory = 'accès_formation' | 'remboursement' | 'technique' | 'autre'

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
    case 'upsell':
      return { subject_hint: 'Offre exclusive', prompt: buildPromptUpsell(ctx) }
    case 'support_manual':
      return { subject_hint: 'Support manuel', prompt: '' }
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

export function buildPromptSupportClassify(ctx: { from: string; subject: string; body: string }): string {
  return [
    'Classifie cet email entrant en une seule catégorie parmi : accès_formation, remboursement, technique, autre.',
    '',
    `De : ${ctx.from}`,
    `Objet : ${ctx.subject}`,
    `Message : ${ctx.body.slice(0, 1000)}`,
    '',
    'Réponds UNIQUEMENT avec la catégorie, sans aucune explication ni ponctuation.',
  ].join('\n')
}

export function buildPromptSupportAcces(ctx: Record<string, any>): string {
  return [
    'Tu es expert en support client pour formateurs en ligne.',
    'Un élève n\'arrive pas à accéder à sa formation. Rédige une réponse email professionnelle et rassurante.',
    '',
    `Formateur : ${ctx.sender_name ?? 'Formateur'}`,
    ctx.student_name ? `Prénom élève : ${ctx.student_name}` : '',
    ctx.product_name ? `Formation : ${ctx.product_name}` : '',
    `Email de l'élève : ${ctx.from}`,
    `Objet original : ${ctx.subject}`,
    '',
    'Contenu attendu : reconnaître le problème, donner les étapes pour accéder à la formation (vérifier email de confirmation, espace membres, contacter le support si besoin), rassurer.',
    '',
    'Format de ta réponse (OBLIGATOIRE) :',
    '[SUBJECT]Re: [sujet original abrégé][/SUBJECT]',
    '',
    '<p>...</p>',
    '',
    'Ton professionnel et rassurant, 2-3 paragraphes max.',
    'HTML simple uniquement : <p>, <strong>, <a> autorisés.',
  ].filter(Boolean).join('\n')
}

export function buildPromptSupportRemboursement(ctx: Record<string, any>): string {
  const politique = ctx.politique_remboursement
    ? `Politique de remboursement du formateur : ${ctx.politique_remboursement}`
    : 'Politique de remboursement : à préciser selon les conditions générales.'
  return [
    'Tu es expert en support client pour formateurs en ligne.',
    'Un élève demande un remboursement. Rédige une réponse email empathique et claire.',
    '',
    `Formateur : ${ctx.sender_name ?? 'Formateur'}`,
    ctx.student_name ? `Prénom élève : ${ctx.student_name}` : '',
    `Email de l'élève : ${ctx.from}`,
    `Objet original : ${ctx.subject}`,
    politique,
    '',
    'Contenu attendu : accuser réception de la demande, expliquer la politique de remboursement de manière claire et bienveillante, indiquer les prochaines étapes.',
    '',
    'Format de ta réponse (OBLIGATOIRE) :',
    '[SUBJECT]Re: [sujet original abrégé][/SUBJECT]',
    '',
    '<p>...</p>',
    '',
    'Ton empathique et professionnel, 3 paragraphes max.',
    'HTML simple uniquement : <p>, <strong>, <a> autorisés.',
  ].filter(Boolean).join('\n')
}

export function buildPromptSupportTechnique(ctx: Record<string, any>): string {
  return [
    'Tu es expert en support client pour formateurs en ligne.',
    'Un élève rencontre un problème technique. Rédige une réponse email avec des étapes de diagnostic claires.',
    '',
    `Formateur : ${ctx.sender_name ?? 'Formateur'}`,
    ctx.student_name ? `Prénom élève : ${ctx.student_name}` : '',
    `Email de l'élève : ${ctx.from}`,
    `Objet original : ${ctx.subject}`,
    `Description du problème : ${ctx.body?.slice(0, 500) ?? ''}`,
    '',
    'Contenu attendu : accuser réception, proposer 3-4 étapes de diagnostic (vider le cache, essayer un autre navigateur, désactiver les extensions, vérifier la connexion), proposer un suivi.',
    '',
    'Format de ta réponse (OBLIGATOIRE) :',
    '[SUBJECT]Re: [sujet original abrégé][/SUBJECT]',
    '',
    '<p>...</p>',
    '<ol><li>...</li></ol>',
    '',
    'Ton pédagogique et rassurant, concis.',
    'HTML simple uniquement : <p>, <strong>, <ol>, <li>, <a> autorisés.',
  ].filter(Boolean).join('\n')
}

export function buildPromptUpsell(ctx: Record<string, any>): string {
  return [
    'Tu es expert en email marketing pour formateurs en ligne.',
    'Rédige un email d\'upsell personnalisé pour proposer une offre complémentaire à un ancien élève.',
    '',
    `Formateur : ${ctx.sender_name ?? 'Formateur'}`,
    ctx.student_name ? `Prénom élève : ${ctx.student_name}` : '',
    ctx.product_name ? `Formation suivie : ${ctx.product_name}` : '',
    `Nouvelle offre : ${ctx.upsell_product_name ?? 'Offre premium'}`,
    ctx.upsell_price ? `Prix : ${ctx.upsell_price}` : '',
    ctx.upsell_url ? `Lien : ${ctx.upsell_url}` : '',
    '',
    'Contexte : l\'élève a terminé sa formation il y a environ 30 jours. C\'est le moment idéal pour proposer une montée en gamme.',
    '',
    'Contenu attendu : rappeler les résultats obtenus avec la formation précédente, présenter la nouvelle offre comme l\'étape logique suivante, CTA clair.',
    '',
    'Format de ta réponse (OBLIGATOIRE) :',
    '[SUBJECT]Objet de l\'email[/SUBJECT]',
    '',
    '<p>...</p>',
    ctx.upsell_url ? `<p><a href="${ctx.upsell_url}">Découvrir ${ctx.upsell_product_name ?? 'l\'offre'}</a></p>` : '',
    '',
    'Ton enthousiaste et valorisant, 3-4 paragraphes max.',
    'HTML simple uniquement : <p>, <strong>, <a> autorisés.',
  ].filter(Boolean).join('\n')
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
