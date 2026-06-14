import { supabase } from './supabase'
import { callClaudeAdmin } from './claude'
import { sendEmail } from './resend'
import { getBusinessSnapshot, BusinessSnapshot } from '../utils/businessMetrics'

function buildPrompt(current: BusinessSnapshot, previous: BusinessSnapshot | null): string {
  const fmt = (s: BusinessSnapshot) => JSON.stringify(s, null, 2)
  return `Tu es l'analyste business d'AEVUM, une plateforme SaaS d'automatisation pour formateurs en ligne.
Voici les métriques actuelles (montants en euros) :
${fmt(current)}

${previous ? `Métriques de la semaine précédente :\n${fmt(previous)}` : 'Aucune donnée de la semaine précédente disponible.'}

Rédige un rapport hebdomadaire en français, format markdown, avec :
- Un résumé en 2-3 phrases
- Évolution du MRR et du profit net (avec deltas si disponibles)
- Risques de churn (clients impayés)
- Anomalies détectées (coûts inhabituels, variations fortes)
- 1 à 3 recommandations concrètes

Reste concis (max 300 mots).`
}

export async function generateBusinessReport(userId: string, adminEmail: string): Promise<{ id: string; content: string }> {
  const current = await getBusinessSnapshot(userId)

  const { data: lastReport } = await supabase
    .from('business_reports')
    .select('metrics_json')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const previous = (lastReport?.metrics_json as BusinessSnapshot) ?? null

  const content = await callClaudeAdmin(buildPrompt(current, previous))

  const { data: saved, error } = await supabase
    .from('business_reports')
    .insert({ user_id: userId, content, metrics_json: current })
    .select('id')
    .single()
  if (error || !saved) throw new Error(error?.message ?? 'Échec enregistrement rapport')

  try {
    await sendEmail({
      to: adminEmail,
      subject: 'Rapport hebdomadaire AEVUM',
      html: `<div style="font-family:sans-serif;white-space:pre-wrap">${content}</div>`,
      sender_name: 'AEVUM',
    })
  } catch (err: any) {
    console.error('[businessReport] envoi email échoué:', err.message)
  }

  return { id: saved.id, content }
}
