// ⚠️ SCRIPT DE TEST UNIQUEMENT — vérifie le coaching J+14 généré par IA (cron.ts → runStudentCoaching)
// Phase A : appelle directement buildPromptCoachingJ14 + callClaude pour 3 élèves fictifs
//           → vérifie le parsing [SUBJECT] et la variété des emails générés (pas de quota/envoi réel)
// Phase B : seed 1 candidat réel (email = compte test) + exécution complète de runStudentCoaching
//           → vérifie blacklist/déjà-envoyé/tracking/activity_logs/envoi Resend de bout en bout
import 'dotenv/config'
import { supabase } from '../src/services/supabase'
import { encrypt, decrypt } from '../src/services/encryption'
import { callClaude } from '../src/services/claude'
import { buildPromptCoachingJ14, parseClaudeResponse } from '../src/services/templates'
import { runStudentCoaching } from '../src/cron'

const TEST_USER_ID = '00000000-0000-0000-0000-000000000000'
const TEST_EMAIL = 'noa.pardal1@gmail.com'

async function getTestClient() {
  const { data, error } = await supabase
    .from('clients')
    .select('id, name, email, paused_until')
    .eq('user_id', TEST_USER_ID)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  if (error || !data) {
    console.error('Client test introuvable. Lancer d\'abord : npm run seed:test')
    process.exit(1)
  }
  return data
}

async function phaseA() {
  console.log('\n=== Phase A — variété du prompt IA (3 élèves fictifs, pas d\'envoi) ===\n')
  const eleves = [
    { student_name: 'Léa', product_name: 'Masterclass Copywriting', jours_inactivite: 9 },
    { student_name: 'Karim', product_name: 'Bootcamp Réseaux Sociaux', jours_inactivite: 14 },
    { student_name: 'Sophie', product_name: 'Formation SEO Avancé', jours_inactivite: 21 },
  ]
  for (const e of eleves) {
    const prompt = buildPromptCoachingJ14({
      sender_name: 'Thomas Martin',
      ...e,
      ton: 'motivant',
      objectif: 'encourager à reprendre la formation là où il s\'est arrêté',
    })
    const raw = await callClaude(prompt, 'claude-sonnet-4-6', undefined)
    const { subject, body_html } = parseClaudeResponse(raw)
    console.log(`--- ${e.student_name} (${e.jours_inactivite}j inactif) ---`)
    console.log(`Sujet : ${subject}`)
    console.log(`Corps : ${body_html}\n`)
  }
}

async function phaseB() {
  console.log('=== Phase B — exécution réelle de runStudentCoaching (1 candidat) ===\n')

  const client = await getTestClient()
  console.log(`Client test : ${client.name} (${client.id})`)

  if (client.paused_until) {
    await supabase.from('clients').update({ paused_until: null }).eq('id', client.id)
  }

  // Nettoyage des traces d'un run précédent pour ce client (sinon "déjà envoyé" bloque le test)
  await supabase.from('email_tracking').delete().eq('client_id', client.id).eq('student_email', TEST_EMAIL)
  await supabase.from('pending_tasks').delete().eq('client_id', client.id).eq('context_json->>customer_email', TEST_EMAIL)
  await supabase.from('client_blacklist').delete().eq('client_id', client.id).eq('email', TEST_EMAIL)

  await supabase.from('client_configs').upsert(
    { client_id: client.id, config_type: 'template_coaching_j14', encrypted_value: encrypt(JSON.stringify({ active: true })), formation_id: null },
    { onConflict: 'client_id,config_type,formation_key' }
  )
  await supabase.from('client_configs').upsert(
    { client_id: client.id, config_type: 'coaching_ia_ton', encrypted_value: encrypt('motivant'), formation_id: null },
    { onConflict: 'client_id,config_type,formation_key' }
  )
  await supabase.from('client_configs').upsert(
    { client_id: client.id, config_type: 'coaching_ia_objectif', encrypted_value: encrypt('encourager à reprendre la formation là où il s\'est arrêté'), formation_id: null },
    { onConflict: 'client_id,config_type,formation_key' }
  )

  const elevenDaysAgo = new Date(Date.now() - 11 * 24 * 60 * 60 * 1000).toISOString()
  const { error: taskErr } = await supabase.from('pending_tasks').insert({
    client_id: client.id,
    task_type: 'onboarding_j0',
    status: 'done',
    created_at: elevenDaysAgo,
    context_json: {
      customer_name: 'Test Coaching',
      customer_email: TEST_EMAIL,
      student_name: 'Test Coaching',
      product_name: 'Formation Test',
    },
  })
  if (taskErr) { console.error('Erreur pending_tasks :', taskErr.message); process.exit(1) }
  console.log(`pending_tasks seedée (créée il y a 11 jours, ${TEST_EMAIL})`)

  // Forcer l'heure cron (gate UTC 8h) sans toucher à cron.ts
  const RealDate = Date
  class FakeDate extends RealDate {
    getUTCHours() { return 8 }
  }
  // @ts-expect-error override volontaire pour le test
  global.Date = FakeDate

  console.log('\nExécution de runStudentCoaching()...\n')
  await runStudentCoaching()

  // @ts-expect-error restauration
  global.Date = RealDate

  const { data: tracking } = await supabase
    .from('email_tracking')
    .select('config_type, sent_at, opened_at')
    .eq('client_id', client.id)
    .eq('student_email', TEST_EMAIL)
    .eq('config_type', 'template_coaching_j14')
    .order('sent_at', { ascending: false })
    .limit(1)

  const { data: logs } = await supabase
    .from('activity_logs')
    .select('action_type, status, payload_json, created_at')
    .eq('client_id', client.id)
    .eq('action_type', 'coaching_sent')
    .order('created_at', { ascending: false })
    .limit(1)

  console.log('email_tracking :', tracking?.[0] ?? '(aucune ligne — voir activity_logs ci-dessous)')
  console.log('activity_logs  :', logs?.[0] ?? '(aucune ligne)')

  const { data: aiLogs } = await supabase
    .from('ai_usage_logs')
    .select('model, input_tokens, output_tokens, cost_usd, created_at')
    .eq('client_id', client.id)
    .order('created_at', { ascending: false })
    .limit(1)
  console.log('ai_usage_logs  :', aiLogs?.[0] ?? '(aucune ligne)')
}

async function main() {
  await phaseA()
  await phaseB()
  console.log('\nTerminé. Vérifie la boîte mail', TEST_EMAIL, 'pour le rendu final.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
