import { supabase } from '../services/supabase'
import { decrypt } from '../services/encryption'

export type EmailTemplateType =
  | 'template_onboarding_j0'
  | 'template_onboarding_j3'
  | 'template_onboarding_j7'
  | 'template_failed_payment'

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
}

function inject(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`)
}

export async function getEmailTemplate(
  clientId: string,
  configType: EmailTemplateType,
  variables: Record<string, string> = {}
): Promise<EmailTemplate> {
  const { data } = await supabase
    .from('client_configs')
    .select('encrypted_value')
    .eq('client_id', clientId)
    .eq('config_type', configType)
    .single()

  if (data?.encrypted_value) {
    try {
      const raw = decrypt(data.encrypted_value)
      const parsed = JSON.parse(raw) as EmailTemplate
      if (parsed.subject && parsed.body) {
        return { subject: inject(parsed.subject, variables), body: inject(parsed.body, variables) }
      }
    } catch { /* fallback */ }
  }

  const def = DEFAULTS[configType]
  return { subject: inject(def.subject, variables), body: inject(def.body, variables) }
}

export function templateToAiResponse(tpl: EmailTemplate): string {
  return `[SUBJECT]${tpl.subject}[/SUBJECT]\n\n${tpl.body}`
}
