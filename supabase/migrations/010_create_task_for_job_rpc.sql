-- RPC atomique : insère une pending_task ET marque le scheduled_job comme 'done'
-- dans la même transaction, éliminant le risque de double exécution en cas de crash.
CREATE OR REPLACE FUNCTION create_task_for_job(
  p_job_id          uuid,
  p_client_id       uuid,
  p_task_type       text,
  p_context_json    jsonb,
  p_prompt_template text,
  p_status          text,
  p_ai_response     text DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_task_id uuid;
BEGIN
  INSERT INTO pending_tasks (client_id, task_type, context_json, prompt_template, ai_response, status)
  VALUES (p_client_id, p_task_type, p_context_json, p_prompt_template, p_ai_response, p_status)
  RETURNING id INTO v_task_id;

  UPDATE scheduled_jobs SET status = 'done' WHERE id = p_job_id;

  RETURN v_task_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
