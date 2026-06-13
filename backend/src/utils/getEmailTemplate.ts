import { supabase } from '../services/supabase'
import { decrypt } from '../services/encryption'

export type EmailTemplateType =
  | 'template_onboarding_j0'
  | 'template_onboarding_j3'
  | 'template_onboarding_j7'
  | 'template_failed_payment'
  | 'template_failed_payment_j1'
  | 'template_failed_payment_j3'
  | 'template_failed_payment_j7'
  | 'template_checkout_abandon'
  | 'template_testimonial_j30'
  | 'template_testimonial_j60'

export interface EmailTemplate {
  subject: string
  body: string
}

const DEFAULTS: Record<EmailTemplateType, EmailTemplate> = {
  template_onboarding_j0: {
    subject: 'Bienvenue {{nom}}, voici vos accès',
    body: 'Bonjour {{nom}},\n\nVotre achat est confirmé. Voici vos identifiants de connexion :\n\nEmail : {{email}}\nMot de passe : {{mot_de_passe}}\n\nAccédez à votre formation ici : {{lien_acces}}\n\nÀ très vite,',
  },
  template_onboarding_j3: {
    subject: '{{nom}}, comment se passe votre début ?',
    body: "Bonjour {{nom}},\n\nCela fait 3 jours que vous avez rejoint {{nom_formation}}. Avez-vous pu commencer ?\n\nN'hésitez pas à répondre à cet email si vous avez la moindre question.\n\nÀ bientôt,",
  },
  template_onboarding_j7: {
    subject: '{{nom}} — votre première semaine',
    body: "Bonjour {{nom}},\n\nUne semaine déjà ! Vous avez maintenant accès à l'intégralité de {{nom_formation}}.\n\nN'hésitez pas à répondre si vous avez besoin d'aide.\n\nÀ bientôt,",
  },
  template_failed_payment: {
    subject: 'Action requise — problème de paiement',
    body: "Bonjour {{nom}},\n\nNous avons rencontré un problème avec votre paiement. Merci de mettre à jour vos informations de paiement pour conserver votre accès.\n\nÀ bientôt,",
  },
  template_failed_payment_j1: {
    subject: 'Action requise — problème de paiement',
    body: "Bonjour {{nom}},\n\nNous avons rencontré un problème avec votre paiement pour {{nom_formation}}. Merci de mettre à jour vos informations de paiement pour conserver votre accès.\n\nÀ bientôt,",
  },
  template_failed_payment_j3: {
    subject: '{{nom}}, votre accès est toujours en attente',
    body: "Bonjour {{nom}},\n\nIl y a 3 jours, nous vous avons informé d'un problème avec votre paiement pour {{nom_formation}}. Votre accès est suspendu jusqu'à régularisation.\n\nMerci de mettre à jour vos informations de paiement dès que possible.\n\nÀ bientôt,",
  },
  template_failed_payment_j7: {
    subject: '{{nom}} — dernier rappel avant suspension définitive',
    body: "Bonjour {{nom}},\n\nCeci est notre dernier rappel concernant le problème de paiement pour {{nom_formation}}. Sans régularisation de votre part, votre accès sera définitivement suspendu.\n\nMerci d'agir rapidement.\n\nCordialement,",
  },
  template_checkout_abandon: {
    subject: '{{nom}}, vous avez oublié quelque chose…',
    body: "Bonjour {{nom}},\n\nVous avez commencé à vous inscrire à {{nom_formation}} mais n'avez pas finalisé votre commande.\n\nVotre place est encore disponible : {{lien_checkout}}\n\nÀ bientôt,",
  },
  template_testimonial_j30: {
    subject: '{{nom}}, votre avis nous tient à cœur',
    body: "Bonjour {{nom}},\n\nVoilà un mois que vous avez rejoint {{nom_formation}} — félicitations !\n\nSi vous avez quelques minutes, votre témoignage nous aiderait énormément :\n{{lien_temoignage}}\n\nMerci d'avance,",
  },
  template_testimonial_j60: {
    subject: '{{nom}}, partagez votre parcours',
    body: "Bonjour {{nom}},\n\nDeux mois après avoir commencé {{nom_formation}}, nous aimerions connaître votre progression.\n\nPartagez votre témoignage ici : {{lien_temoignage}}\n\nMerci beaucoup,",
  },
}

function inject(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`)
}

export async function getEmailTemplate(
  clientId: string,
  configType: EmailTemplateType,
  variables: Record<string, string> = {},
  formationId?: string | null
): Promise<EmailTemplate> {
  let query = supabase
    .from('client_configs')
    .select('encrypted_value')
    .eq('client_id', clientId)
    .eq('config_type', configType)

  query = formationId ? query.eq('formation_id', formationId) : query.is('formation_id', null)
  let { data } = await query.maybeSingle()

  if (!data && formationId) {
    ;({ data } = await supabase
      .from('client_configs')
      .select('encrypted_value')
      .eq('client_id', clientId)
      .eq('config_type', configType)
      .is('formation_id', null)
      .maybeSingle())
  }

  if (data?.encrypted_value) {
    try {
      const raw = decrypt(data.encrypted_value)
      const parsed = JSON.parse(raw) as EmailTemplate
      if (parsed.subject && parsed.body) {
        return { subject: inject(parsed.subject, variables), body: inject(parsed.body, variables) }
      }
    } catch { /* fallback to default */ }
  }

  const def = DEFAULTS[configType]
  return { subject: inject(def.subject, variables), body: inject(def.body, variables) }
}

export function templateToAiResponse(tpl: EmailTemplate): string {
  return `[SUBJECT]${tpl.subject}[/SUBJECT]\n\n${tpl.body}`
}
