export interface Client {
  id: string
  user_id: string
  name: string
  email: string
  created_at: string
}

export interface ClientConfig {
  id: string
  client_id: string
  config_type: 'stripe_webhook_secret' | 'sender_name'
  encrypted_value: string
}

export interface PendingTask {
  id: string
  client_id: string
  task_type: 'failed_payment' | 'onboarding_j0' | 'onboarding_j3' | 'onboarding_j7'
  context_json: Record<string, unknown>
  prompt_template: string | null
  ai_response: string | null
  status: 'pending' | 'processing' | 'sent' | 'failed'
  created_at: string
  processed_at: string | null
}

export interface ActivityLog {
  id: string
  client_id: string
  action_type: string
  payload_json: Record<string, unknown>
  status: string
  created_at: string
}

export interface Settings {
  auto_mode: boolean
  has_api_key: boolean
}
