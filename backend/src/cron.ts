import { supabase } from './services/supabase'
import { getTemplate, TaskType } from './services/templates'

export async function runScheduledJobs(): Promise<void> {
  const { data: jobs } = await supabase
    .from('scheduled_jobs')
    .select('*')
    .lte('scheduled_for', new Date().toISOString())
    .eq('status', 'pending')

  if (!jobs || jobs.length === 0) return
  console.log(`[cron] ${jobs.length} job(s) à traiter`)

  for (const job of jobs) {
    try {
      const ctx = job.context_json as Record<string, any>
      const task_type = job.job_type as TaskType
      const prompt_template = getTemplate(task_type, ctx).prompt

      await supabase.from('pending_tasks').insert({
        client_id: job.client_id,
        task_type,
        context_json: ctx,
        prompt_template,
        status: 'pending',
      })

      await supabase
        .from('scheduled_jobs')
        .update({ status: 'processed' })
        .eq('id', job.id)

      console.log(`[cron] job ${job.id} (${task_type}) → pending_task créée`)
    } catch (err: any) {
      console.error(`[cron] job ${job.id} échoué:`, err.message)
      await supabase
        .from('scheduled_jobs')
        .update({ status: 'failed' })
        .eq('id', job.id)
    }
  }
}
