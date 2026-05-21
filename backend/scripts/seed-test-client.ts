// ⚠️ SCRIPT DE TEST UNIQUEMENT — supprimer le client via Supabase dashboard après usage
import 'dotenv/config'
import { randomUUID } from 'crypto'
import { supabase } from '../src/services/supabase'
import { generateClientCredentials } from '../src/utils/generateClientCredentials'

async function main() {
  const id = randomUUID()

  const { error } = await supabase.from('clients').insert({
    id,
    user_id: '00000000-0000-0000-0000-000000000000', // user_id fictif pour test
    name: 'Client Test',
    email: 'noa.pardal1@gmail.com',
    created_at: new Date().toISOString(),
  })

  if (error) {
    console.error('Erreur insertion client :', error.message)
    process.exit(1)
  }

  console.log(`Client inséré : ${id}`)

  await generateClientCredentials(id, 'noa.pardal1@gmail.com')

  console.log('Credentials générés et email envoyé à noa.pardal1@gmail.com')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
