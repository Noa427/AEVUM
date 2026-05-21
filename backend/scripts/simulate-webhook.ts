import 'dotenv/config'
import { supabase } from '../src/services/supabase'

// Si la contrainte valid_task_type bloque l'insert 'upsell', appliquer d'abord dans Supabase SQL Editor :
// ALTER TABLE pending_tasks DROP CONSTRAINT valid_task_type;
// ALTER TABLE pending_tasks ADD CONSTRAINT valid_task_type CHECK (
//   task_type IN ('failed_payment','onboarding_j0','onboarding_j3','onboarding_j7','upsell','recouvrement')
// );

const TEST_USER_ID = '00000000-0000-0000-0000-000000000000'

async function main() {
  // Récupération du client test
  const { data: client, error: clientErr } = await supabase
    .from('clients')
    .select('id, name, email')
    .eq('user_id', TEST_USER_ID)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (clientErr || !client) {
    console.error('Client test introuvable. Lancer d\'abord : npm run seed:test')
    process.exit(1)
  }

  console.log(`Client test trouvé : ${client.name} (${client.id})`)

  // ─── 3 pending_tasks ─────────────────────────────────────────────────────

  const tasks = [
    {
      client_id: client.id,
      task_type: 'onboarding_j0',
      status: 'pending',
      context_json: {
        customer_name: 'Marie Dupont',
        customer_email: 'marie.dupont@example.com',
        formation_name: 'Masterclass Copywriting 2025',
        sender_name: 'Thomas Martin',
        purchase_date: new Date().toISOString(),
      },
      prompt_template: 'Email de bienvenue pour Marie Dupont suite à son achat de Masterclass Copywriting 2025.',
    },
    {
      client_id: client.id,
      task_type: 'failed_payment',
      status: 'pending',
      context_json: {
        customer_name: 'Lucas Bernard',
        customer_email: 'lucas.bernard@example.com',
        formation_name: 'Formation SEO Avancé',
        sender_name: 'Thomas Martin',
        amount: 297,
        currency: 'EUR',
        invoice_url: 'https://stripe.com/invoice/test_inv_123',
      },
      prompt_template: 'Email de relance paiement échoué pour Lucas Bernard — 297 € — Formation SEO Avancé.',
    },
    {
      client_id: client.id,
      task_type: 'upsell',
      status: 'pending',
      context_json: {
        customer_name: 'Sophie Legrand',
        customer_email: 'sophie.legrand@example.com',
        formation_name: 'Bootcamp Réseaux Sociaux',
        sender_name: 'Thomas Martin',
        upsell_product_name: 'Pack Mentoring 1:1',
        upsell_price: '497',
        upsell_url: 'https://example.com/mentoring',
      },
      prompt_template: 'Email upsell Pack Mentoring 1:1 à 497€ pour Sophie Legrand.',
    },
  ]

  const { data: insertedTasks, error: tasksErr } = await supabase
    .from('pending_tasks')
    .insert(tasks)
    .select('id, task_type')

  if (tasksErr) {
    console.error('Erreur pending_tasks :', tasksErr.message)
    console.error('→ Si "invalid input value for enum", appliquer le fix SQL mentionné en haut du script.')
    process.exit(1)
  }

  console.log('\npending_tasks insérées :')
  for (const t of insertedTasks ?? []) console.log(`  ✓ ${t.task_type} → ${t.id}`)

  // ─── 5 activity_logs sur 7 derniers jours ───────────────────────────────

  const now = Date.now()
  const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString()

  const logs = [
    {
      client_id: client.id,
      action_type: 'onboarding_email',
      status: 'sent',
      payload_json: { subject: 'Bienvenue dans la formation !', to: 'camille.roux@example.com' },
      created_at: daysAgo(6),
    },
    {
      client_id: client.id,
      action_type: 'failed_payment_email',
      status: 'sent',
      payload_json: { subject: 'Problème avec votre paiement', to: 'jean.morel@example.com', amount: 197 },
      created_at: daysAgo(4),
    },
    {
      client_id: client.id,
      action_type: 'onboarding_email',
      status: 'sent',
      payload_json: { subject: 'Bienvenue dans la formation !', to: 'elise.petit@example.com' },
      created_at: daysAgo(3),
    },
    {
      client_id: client.id,
      action_type: 'upsell_email',
      status: 'sent',
      payload_json: { subject: 'Une offre exclusive pour vous', to: 'marc.durand@example.com', product: 'Pack Mentoring 1:1' },
      created_at: daysAgo(2),
    },
    {
      client_id: client.id,
      action_type: 'failed_payment_email',
      status: 'failed',
      payload_json: { error: 'Invalid email address', to: 'invalid@@broken.com' },
      created_at: daysAgo(1),
    },
  ]

  const { data: insertedLogs, error: logsErr } = await supabase
    .from('activity_logs')
    .insert(logs)
    .select('id, action_type, status')

  if (logsErr) {
    console.error('Erreur activity_logs :', logsErr.message)
    process.exit(1)
  }

  console.log('\nactivity_logs insérés :')
  for (const l of insertedLogs ?? []) console.log(`  ✓ ${l.action_type} [${l.status}] → ${l.id}`)

  // ─── 1 scheduled_job onboarding_j3 dans 2 jours ─────────────────────────

  const in2Days = new Date(now + 2 * 86_400_000).toISOString()

  const { data: insertedJob, error: jobErr } = await supabase
    .from('scheduled_jobs')
    .insert({
      client_id: client.id,
      job_type: 'onboarding_j3',
      scheduled_for: in2Days,
      status: 'pending',
      payload_json: {
        customer_name: 'Marie Dupont',
        customer_email: 'marie.dupont@example.com',
        formation_name: 'Masterclass Copywriting 2025',
        sender_name: 'Thomas Martin',
      },
    })
    .select('id, job_type, scheduled_for')
    .single()

  if (jobErr) {
    console.error('Erreur scheduled_jobs :', jobErr.message)
    process.exit(1)
  }

  console.log('\nscheduled_job inséré :')
  console.log(`  ✓ ${insertedJob.job_type} → ${insertedJob.id} (planifié le ${new Date(insertedJob.scheduled_for).toLocaleDateString('fr-FR')})`)

  console.log('\nDashboard prêt. Ouvrir le frontend admin pour vérifier.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
