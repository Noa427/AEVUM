// Injection de données factices réalistes (dashboard admin + portail client) — DB dev uniquement.
import 'dotenv/config'
import { randomUUID } from 'crypto'
import argon2 from 'argon2'
import { supabase } from '../src/services/supabase'
import { encrypt } from '../src/services/encryption'

const ADMIN_USER_ID = 'd037913d-3fda-49ab-9d85-e881d5f07abe' // noa.pardal1@gmail.com
const DEMO_PASSWORD = 'Demo1234!'

const FIRST_NAMES = ['Camille', 'Lucas', 'Manon', 'Hugo', 'Léa', 'Nathan', 'Chloé', 'Enzo', 'Emma', 'Louis', 'Sarah', 'Jules', 'Inès', 'Adam', 'Zoé', 'Théo', 'Julia', 'Maxime', 'Alice', 'Noah']
const LAST_NAMES = ['Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Petit', 'Durand', 'Leroy', 'Moreau', 'Simon', 'Laurent', 'Michel', 'Garcia', 'Roux', 'Fournier']

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}
function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(randInt(8, 21), randInt(0, 59), randInt(0, 59))
  return d.toISOString()
}

interface ClientDef {
  id: string
  name: string
  email: string
  plan: 'standard' | 'premium'
  payment_status: 'active' | 'unpaid'
  whatsapp_active: boolean
  addons: { f11: boolean; f13: boolean; f18: boolean }
  formations: string[]
  studentCount: number
  isDemo?: boolean
}

const CLIENTS: ClientDef[] = [
  {
    id: randomUUID(),
    name: 'Académie Digitale Pro',
    email: 'contact@academie-digitale.fr',
    plan: 'premium',
    payment_status: 'active',
    whatsapp_active: true,
    addons: { f11: true, f13: true, f18: false },
    formations: ['Bootcamp Growth Marketing', 'Copywriting Avancé'],
    studentCount: 22,
    isDemo: true,
  },
  {
    id: randomUUID(),
    name: 'École du Trading Serein',
    email: 'hello@trading-serein.com',
    plan: 'premium',
    payment_status: 'active',
    whatsapp_active: false,
    addons: { f11: false, f13: false, f18: true },
    formations: ['Trading pour Débutants'],
    studentCount: 14,
  },
  {
    id: randomUUID(),
    name: 'Business Boost Formation',
    email: 'team@businessboost.fr',
    plan: 'standard',
    payment_status: 'active',
    whatsapp_active: false,
    addons: { f11: true, f13: false, f18: false },
    formations: ['Vente B2B Express'],
    studentCount: 11,
  },
  {
    id: randomUUID(),
    name: 'Fit & Forme Coaching',
    email: 'contact@fitforme.coach',
    plan: 'standard',
    payment_status: 'unpaid',
    whatsapp_active: false,
    addons: { f11: false, f13: false, f18: false },
    formations: ['Programme Remise en Forme 12 Semaines'],
    studentCount: 9,
  },
  {
    id: randomUUID(),
    name: 'Langues Express Academy',
    email: 'info@languesexpress.fr',
    plan: 'standard',
    payment_status: 'active',
    whatsapp_active: false,
    addons: { f11: false, f13: false, f18: false },
    formations: ['Anglais Professionnel Intensif'],
    studentCount: 8,
  },
]

const TEMPLATE_FAILED_PAYMENT_J1 = {
  subject: 'Action requise — problème de paiement',
  body: "Bonjour {{nom}},\n\nNous avons rencontré un problème avec votre paiement pour {{nom_formation}}. Merci de mettre à jour vos informations de paiement pour conserver votre accès.\n\nÀ bientôt,",
}

async function main() {
  console.log('1/10 — Clients')
  const { error: clientsErr } = await supabase.from('clients').insert(
    CLIENTS.map(c => ({
      id: c.id,
      user_id: ADMIN_USER_ID,
      name: c.name,
      email: c.email,
      plan: c.plan,
      payment_status: c.payment_status,
      whatsapp_active: c.whatsapp_active,
      auto_mode: true,
      created_at: daysAgo(randInt(30, 180)),
    }))
  )
  if (clientsErr) throw new Error('clients: ' + clientsErr.message)

  const demo = CLIENTS.find(c => c.isDemo)!
  const passwordHash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 })
  const { error: demoErr } = await supabase
    .from('clients')
    .update({ client_email: 'demo@aevum-preview.dev', password_hash: passwordHash, must_change_password: false })
    .eq('id', demo.id)
  if (demoErr) throw new Error('demo client: ' + demoErr.message)

  console.log('2/10 — Settings (infra_monthly_cost)')
  await supabase.from('settings').upsert({ key: 'infra_monthly_cost', value: '92.50' }, { onConflict: 'key' })

  console.log('3/10 — Formations')
  const formationsByClient = new Map<string, { id: string; name: string }[]>()
  for (const c of CLIENTS) {
    const rows = c.formations.map(name => ({ id: randomUUID(), client_id: c.id, name, created_at: daysAgo(randInt(60, 150)) }))
    const { error } = await supabase.from('formations').insert(rows)
    if (error) throw new Error('formations: ' + error.message)
    formationsByClient.set(c.id, rows)
  }

  console.log('4/10 — Client configs (piliers, addons, options premium)')
  for (const c of CLIENTS) {
    const rows: { client_id: string; config_type: string; encrypted_value: string; formation_id: string | null }[] = []
    rows.push({ client_id: c.id, config_type: 'sender_name', encrypted_value: encrypt(c.name.split(' ')[0]), formation_id: null })
    rows.push({ client_id: c.id, config_type: 'template_failed_payment_j1', encrypted_value: encrypt(JSON.stringify(TEMPLATE_FAILED_PAYMENT_J1)), formation_id: null })
    rows.push({ client_id: c.id, config_type: 'support_email_enabled', encrypted_value: encrypt('true'), formation_id: null })
    if (c.addons.f11) rows.push({ client_id: c.id, config_type: 'addon_f11', encrypted_value: encrypt('true'), formation_id: null })
    if (c.addons.f13) rows.push({ client_id: c.id, config_type: 'addon_f13', encrypted_value: encrypt('true'), formation_id: null })
    if (c.addons.f18) rows.push({ client_id: c.id, config_type: 'addon_f18', encrypted_value: encrypt('true'), formation_id: null })
    if (c.plan === 'standard' || c.isDemo) {
      rows.push({ client_id: c.id, config_type: 'upsell_enabled', encrypted_value: encrypt('true'), formation_id: null })
      rows.push({ client_id: c.id, config_type: 'upsell_product_name', encrypted_value: encrypt('Coaching individuel premium'), formation_id: null })
      rows.push({ client_id: c.id, config_type: 'upsell_url', encrypted_value: encrypt('https://buy.stripe.com/test_upsell'), formation_id: null })
      rows.push({ client_id: c.id, config_type: 'upsell_price', encrypted_value: encrypt('297'), formation_id: null })
    }
    if (c.plan === 'premium') {
      rows.push({ client_id: c.id, config_type: 'template_predunning', encrypted_value: encrypt('true'), formation_id: null })
      rows.push({ client_id: c.id, config_type: 'template_churn_reengagement', encrypted_value: encrypt('true'), formation_id: null })
      rows.push({ client_id: c.id, config_type: 'rapport_video_active', encrypted_value: encrypt('true'), formation_id: null })
      rows.push({ client_id: c.id, config_type: 'template_coaching_j14', encrypted_value: encrypt('true'), formation_id: null })
      rows.push({ client_id: c.id, config_type: 'coaching_ia_ton', encrypted_value: encrypt('empathique'), formation_id: null })
      rows.push({ client_id: c.id, config_type: 'coaching_ia_objectif', encrypted_value: encrypt('encourager à reprendre la formation'), formation_id: null })
    }
    const { error } = await supabase.from('client_configs').insert(rows)
    if (error) throw new Error('client_configs (' + c.name + '): ' + error.message)
  }

  console.log('5/10 — Élèves (pending_tasks)')
  interface Student { email: string; name: string; first: string; formation: string; formationId: string; amount: number }
  const studentsByClient = new Map<string, Student[]>()

  for (const c of CLIENTS) {
    const formations = formationsByClient.get(c.id)!
    const students: Student[] = []
    for (let i = 0; i < c.studentCount; i++) {
      const first = pick(FIRST_NAMES)
      const last = pick(LAST_NAMES)
      const formation = pick(formations)
      students.push({
        email: `${first.toLowerCase()}.${last.toLowerCase()}${randInt(1, 999)}@gmail.com`,
        name: `${first} ${last}`,
        first,
        formation: formation.name,
        formationId: formation.id,
        amount: pick([297, 497, 697, 997, 1497, 1997]),
      })
    }
    studentsByClient.set(c.id, students)

    const taskRows: Record<string, unknown>[] = []
    students.forEach((s, idx) => {
      const createdDaysAgo = randInt(1, 55)
      const contextBase = {
        customer_email: s.email,
        customer_name: s.name,
        student_name: s.first,
        product_name: s.formation,
        amount: s.amount,
        sender_name: c.name.split(' ')[0],
        payment_link: 'https://buy.stripe.com/test_link',
      }
      taskRows.push({
        id: randomUUID(),
        client_id: c.id,
        formation_id: s.formationId,
        task_type: 'onboarding_j0',
        context_json: { ...contextBase, lien_acces: 'https://membre.aevum-preview.dev' },
        status: 'sent',
        created_at: daysAgo(createdDaysAgo),
        processed_at: daysAgo(createdDaysAgo),
      })
      if (createdDaysAgo > 3) {
        taskRows.push({
          id: randomUUID(),
          client_id: c.id,
          formation_id: s.formationId,
          task_type: 'onboarding_j3',
          context_json: contextBase,
          status: idx % 9 === 0 ? 'pending' : 'sent',
          created_at: daysAgo(createdDaysAgo - 3),
          processed_at: idx % 9 === 0 ? null : daysAgo(createdDaysAgo - 3),
        })
      }
      if (createdDaysAgo > 7) {
        taskRows.push({
          id: randomUUID(),
          client_id: c.id,
          formation_id: s.formationId,
          task_type: 'onboarding_j7',
          context_json: contextBase,
          status: 'sent',
          created_at: daysAgo(createdDaysAgo - 7),
          processed_at: daysAgo(createdDaysAgo - 7),
        })
      }
      if (idx % 6 === 0) {
        taskRows.push({
          id: randomUUID(),
          client_id: c.id,
          formation_id: s.formationId,
          task_type: 'upsell',
          context_json: contextBase,
          status: 'sent',
          created_at: daysAgo(Math.max(1, createdDaysAgo - 14)),
          processed_at: daysAgo(Math.max(1, createdDaysAgo - 14)),
        })
      }
    })
    const { error } = await supabase.from('pending_tasks').insert(taskRows)
    if (error) throw new Error('pending_tasks (' + c.name + '): ' + error.message)
  }

  console.log('6/10 — Impayés en cours (scheduled_jobs) + recouvrements')
  for (const c of CLIENTS) {
    const students = studentsByClient.get(c.id)!
    const dunning = students.slice(0, Math.max(1, Math.floor(students.length * 0.15)))
    const jobRows = dunning.map((s, i) => ({
      id: randomUUID(),
      client_id: c.id,
      job_type: i === 0 ? 'failed_payment_j7' : 'failed_payment_j3',
      status: i === 0 ? 'done' : 'pending',
      scheduled_for: i === 0 ? daysAgo(2) : daysAgo(-randInt(1, 5)),
      payload_json: { customer_email: s.email, customer_name: s.name, product_name: s.formation, amount: s.amount },
    }))
    if (jobRows.length) {
      const { error } = await supabase.from('scheduled_jobs').insert(jobRows)
      if (error) throw new Error('scheduled_jobs (' + c.name + '): ' + error.message)
    }
  }

  console.log('7/10 — Blacklist')
  for (const c of CLIENTS.filter((_, i) => i % 2 === 0)) {
    const s = studentsByClient.get(c.id)![studentsByClient.get(c.id)!.length - 1]
    await supabase.from('client_blacklist').insert({ client_id: c.id, email: s.email, reason: 'Demande de désinscription' })
  }

  console.log('8/10 — Historique (activity_logs)')
  const ACTION_TYPES_SENT = ['onboarding_j0_sent', 'onboarding_j3_sent', 'onboarding_j7_sent', 'failed_payment_j1_sent', 'upsell_sent', 'support_reply_sent']
  for (const c of CLIENTS) {
    const students = studentsByClient.get(c.id)!
    const rows: Record<string, unknown>[] = []
    const total = randInt(35, 60)
    for (let i = 0; i < total; i++) {
      const s = pick(students)
      const withinMonth = i < total * 0.6
      const created = withinMonth ? daysAgo(randInt(0, 16)) : daysAgo(randInt(17, 50))
      const actionType = pick(ACTION_TYPES_SENT)
      rows.push({
        id: randomUUID(),
        client_id: c.id,
        action_type: actionType,
        payload_json: { to: s.email, subject: 'Email automatique AEVUM', ...(actionType === 'failed_payment_j1_sent' ? { amount: s.amount } : {}) },
        status: Math.random() < 0.05 ? 'failed' : 'sent',
        created_at: created,
      })
    }
    // recouvrements réussis ce mois-ci
    const recovered = students.slice(-Math.max(1, Math.floor(students.length * 0.1)))
    for (const s of recovered) {
      rows.push({
        id: randomUUID(),
        client_id: c.id,
        action_type: 'payment_recovered',
        payload_json: { to: s.email, amount: s.amount },
        status: 'sent',
        created_at: daysAgo(randInt(0, 12)),
      })
    }
    const { error } = await supabase.from('activity_logs').insert(rows)
    if (error) throw new Error('activity_logs (' + c.name + '): ' + error.message)
  }

  console.log('9/10 — Tracking emails (ouvertures/clics) + coûts IA')
  const TEMPLATE_TYPES = ['template_onboarding_j0', 'template_onboarding_j3', 'template_onboarding_j7', 'template_failed_payment_j1']
  for (const c of CLIENTS) {
    const students = studentsByClient.get(c.id)!
    const trackingRows = []
    for (let i = 0; i < randInt(20, 35); i++) {
      const s = pick(students)
      const sentAt = daysAgo(randInt(0, 29))
      const opened = Math.random() < 0.55
      const clicked = opened && Math.random() < 0.4
      trackingRows.push({
        id: randomUUID(),
        client_id: c.id,
        student_email: s.email,
        config_type: pick(TEMPLATE_TYPES),
        sent_at: sentAt,
        opened_at: opened ? sentAt : null,
        clicked_at: clicked ? sentAt : null,
        click_url: clicked ? 'https://membre.aevum-preview.dev' : null,
        channel: c.whatsapp_active && Math.random() < 0.2 ? 'whatsapp' : 'email',
      })
    }
    const { error: trErr } = await supabase.from('email_tracking').insert(trackingRows)
    if (trErr) throw new Error('email_tracking (' + c.name + '): ' + trErr.message)

    const aiRows = Array.from({ length: randInt(5, 12) }, () => {
      const inputTokens = randInt(400, 1800)
      const outputTokens = randInt(150, 600)
      const costUsd = Number((inputTokens * 0.0000008 + outputTokens * 0.000004).toFixed(6))
      return {
        id: randomUUID(),
        client_id: c.id,
        model: 'claude-haiku-4-5-20251001',
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_usd: costUsd,
        created_at: daysAgo(randInt(0, 16)),
      }
    })
    const { error: aiErr } = await supabase.from('ai_usage_logs').insert(aiRows)
    if (aiErr) throw new Error('ai_usage_logs (' + c.name + '): ' + aiErr.message)
  }

  console.log('10/10 — Rapports business IA')
  await supabase.from('business_reports').insert([
    {
      id: randomUUID(),
      user_id: ADMIN_USER_ID,
      content: "Cette semaine, le MRR global progresse porté par l'ajout de l'option F13 chez Académie Digitale Pro. Le taux d'ouverture moyen reste solide (>50%) et le recouvrement des impayés continue de convertir environ 1 client sur 10 relancés. Point de vigilance : Fit & Forme Coaching est en statut impayé, à relancer en priorité.",
      metrics_json: { mrr_total: 4360, cost_total_eur: 145.2, profit_net_eur: 4214.8, clients_actifs: 4, clients_impayes: 1 },
      created_at: daysAgo(7),
    },
    {
      id: randomUUID(),
      user_id: ADMIN_USER_ID,
      content: "Semaine stable : pas de churn détecté, les emails de coaching J+14 generés par IA obtiennent un bon taux de clic sur Académie Digitale Pro et École du Trading Serein. Les coûts IA restent maîtrisés sous les 2% du MRR.",
      metrics_json: { mrr_total: 4360, cost_total_eur: 138.9, profit_net_eur: 4221.1, clients_actifs: 4, clients_impayes: 1 },
      created_at: daysAgo(0),
    },
  ])

  console.log('\n✓ Seed terminé.')
  console.log(`\nConnexion portail client démo :\n  URL     : ${process.env.VITRINE_URL || 'http://localhost:4321'}/login\n  Email   : demo@aevum-preview.dev\n  Mot de passe : ${DEMO_PASSWORD}\n  (client : ${demo.name})`)
}

main().catch(err => {
  console.error('Échec du seed :', err.message)
  process.exit(1)
})
