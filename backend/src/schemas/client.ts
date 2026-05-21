import { z } from 'zod'

export const ALLOWED_CONFIG_TYPES = [
  'sender_name',
  'template_onboarding_j0',
  'template_onboarding_j3',
  'template_onboarding_j7',
  'template_failed_payment',
  'upsell_enabled',
  'upsell_product_name',
  'upsell_url',
  'upsell_price',
  'support_email_enabled',
  'support_auto_reply',
  'politique_remboursement',
] as const

export const VALID_TRIGGER_TYPES = ['delay_after_purchase', 'specific_date', 'payment_failed', 'manual'] as const
export const VALID_EMAIL_TYPES = ['onboarding_j0', 'onboarding_j3', 'onboarding_j7', 'failed_payment'] as const

export const LoginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
})

export const PasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
})

export const EmailSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newEmail: z.string().email().max(254),
})

export const ConfigSchema = z.object({
  config_type: z.enum(ALLOWED_CONFIG_TYPES),
  value: z.string().max(50000),
})

export const AutomationSchema = z.object({
  name: z.string().min(1).max(100),
  trigger_type: z.enum(VALID_TRIGGER_TYPES),
  trigger_delay_days: z.number().int().min(0).max(365).optional(),
  trigger_date: z.string().max(100).optional(),
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(10000),
})

export const AutomationUpdateSchema = AutomationSchema.partial().extend({
  active: z.boolean().optional(),
})

export const AiGenerateSchema = z.object({
  emailType: z.enum(VALID_EMAIL_TYPES),
  formationName: z.string().min(1).max(200),
  tone: z.string().max(50).optional(),
  objective: z.string().max(500).optional(),
})

export const AiImproveSchema = z.object({
  content: z.string().min(1).max(10000),
  emailType: z.enum(VALID_EMAIL_TYPES).optional(),
})
