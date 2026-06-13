# Password Reset + Show/Hide Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ajouter le reset de mot de passe par email (JWT fingerprint, sans migration DB) et le toggle show/hide sur les champs password du Vitrine.

**Architecture:** Backend génère un JWT signé contenant clientId + fingerprint des 8 derniers chars du hash courant (auto-invalide après reset). Vitrine : 2 nouvelles pages SSR + modifications login.astro.

**Tech Stack:** Express/TS, jsonwebtoken, argon2, Resend, Astro 6 SSR, jose

---

### Task 1 : Backend — Schémas + Rate limiter

**Files:**
- Modify: `backend/src/schemas/client.ts`
- Modify: `backend/src/middleware/rate-limit.ts`

- [ ] Ajouter dans `schemas/client.ts` après `EmailSchema` :

```ts
export const ForgotPasswordSchema = z.object({
  email: z.string().email().max(254),
})

export const ResetPasswordSchema = z.object({
  token: z.string().min(1).max(2048),
  newPassword: z.string().min(8).max(128),
})
```

- [ ] Ajouter dans `middleware/rate-limit.ts` après `loginLimiter` :

```ts
export const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: msg('Trop de tentatives, réessayez dans 15 minutes.'),
})
```

- [ ] Commit : `feat(auth): forgot/reset password schemas + rate limiter`

---

### Task 2 : Backend — Endpoints forgot-password + reset-password

**Files:**
- Modify: `backend/src/routes/clientAuth.ts`

- [ ] Ajouter l'import dans `clientAuth.ts` :

```ts
import { forgotPasswordLimiter } from '../middleware/rate-limit'
import { sendEmail } from '../services/resend'
import {
  LoginSchema, PasswordSchema, EmailSchema, ConfigSchema,
  AutomationSchema, AutomationUpdateSchema, AiGenerateSchema, AiImproveSchema,
  ForgotPasswordSchema, ResetPasswordSchema,
  ALLOWED_CONFIG_TYPES,
} from '../schemas/client'
```

- [ ] Ajouter après le bloc `POST /client/login` :

```ts
// POST /client/forgot-password
clientAuthRouter.post('/forgot-password', forgotPasswordLimiter, validate(ForgotPasswordSchema), async (req, res) => {
  const { email } = req.body

  const { data: client } = await supabase
    .from('clients')
    .select('id, password_hash')
    .eq('client_email', email.toLowerCase())
    .single()

  // Toujours 200 — pas d'énumération d'emails
  if (!client?.password_hash) {
    await randomDelay()
    return res.json({ ok: true })
  }

  const token = jwt.sign(
    {
      purpose: 'password_reset',
      clientId: client.id,
      pwdFingerprint: client.password_hash.slice(-8),
    },
    process.env.JWT_SECRET!,
    { expiresIn: '1h' }
  )

  const resetUrl = `${process.env.VITRINE_URL}/client/reset-password?token=${token}`

  await sendEmail({
    to: email,
    subject: 'Réinitialisation de votre mot de passe AEVUM',
    html: `
      <p>Bonjour,</p>
      <p>Vous avez demandé la réinitialisation de votre mot de passe.</p>
      <p><a href="${resetUrl}">Réinitialiser mon mot de passe</a></p>
      <p>Ce lien expire dans 1 heure. Si vous n'avez pas fait cette demande, ignorez cet email.</p>
    `,
  })

  res.json({ ok: true })
})

// POST /client/reset-password
clientAuthRouter.post('/reset-password', validate(ResetPasswordSchema), async (req, res) => {
  const { token, newPassword } = req.body

  let payload: any
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET!)
  } catch {
    return res.status(400).json({ error: 'Lien invalide ou expiré' })
  }

  if (payload.purpose !== 'password_reset') {
    return res.status(400).json({ error: 'Lien invalide ou expiré' })
  }

  const { data: client } = await supabase
    .from('clients')
    .select('id, password_hash')
    .eq('id', payload.clientId)
    .single()

  if (!client?.password_hash) {
    return res.status(400).json({ error: 'Lien invalide ou expiré' })
  }

  // Fingerprint check — invalide si mdp déjà changé
  if (client.password_hash.slice(-8) !== payload.pwdFingerprint) {
    return res.status(400).json({ error: 'Lien invalide ou expiré' })
  }

  const newHash = await argon2.hash(newPassword, ARGON2_OPTIONS)

  const { error: updateError } = await supabase
    .from('clients')
    .update({ password_hash: newHash, must_change_password: false })
    .eq('id', client.id)

  if (updateError) return res.status(500).json({ error: updateError.message })

  res.json({ ok: true })
})
```

- [ ] Commit : `feat(auth): forgot-password + reset-password endpoints`

---

### Task 3 : Vitrine — login.astro (show/hide + lien forgot)

**Files:**
- Modify: `Vitrine/src/pages/login.astro`

- [ ] Remplacer le bloc `<div class="form-group">` du mot de passe par :

```astro
<div class="form-group">
  <label for="password" class="form-label">Mot de passe</label>
  <div class="input-wrapper">
    <input
      type="password"
      id="password"
      name="password"
      class="form-input"
      placeholder="••••••••"
      required
      autocomplete="current-password"
    />
    <button type="button" class="toggle-pw" aria-label="Afficher le mot de passe" onclick="
      const inp = this.previousElementSibling;
      const shown = inp.type === 'text';
      inp.type = shown ? 'password' : 'text';
      this.setAttribute('aria-label', shown ? 'Afficher le mot de passe' : 'Masquer le mot de passe');
      this.querySelector('.eye-on').style.display = shown ? 'block' : 'none';
      this.querySelector('.eye-off').style.display = shown ? 'none' : 'block';
    ">
      <svg class="eye-on" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
      <svg class="eye-off" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" style="display:none"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
    </button>
  </div>
</div>
<div style="text-align:right;margin-top:-0.5rem">
  <a href="/client/forgot-password" class="forgot-link">Mot de passe oublié ?</a>
</div>
```

- [ ] Ajouter dans `<style>` :

```css
.input-wrapper { position: relative; }
.input-wrapper .form-input { padding-right: 2.75rem; }
.toggle-pw {
  position: absolute; right: 0.75rem; top: 50%; transform: translateY(-50%);
  background: none; border: none; cursor: pointer; color: var(--gray-light);
  display: flex; align-items: center; padding: 0;
}
.toggle-pw:hover { color: var(--accent); }
.forgot-link { font-size: 0.875rem; color: var(--gray-light); text-decoration: none; }
.forgot-link:hover { color: var(--accent); }
```

- [ ] Commit : `feat(vitrine): show/hide password + lien forgot sur login`

---

### Task 4 : Vitrine — forgot-password.astro

**Files:**
- Create: `Vitrine/src/pages/client/forgot-password.astro`

- [ ] Créer la page (voir contenu complet dans l'implémentation)
- [ ] Commit : `feat(vitrine): page forgot-password`

---

### Task 5 : Vitrine — reset-password.astro

**Files:**
- Create: `Vitrine/src/pages/client/reset-password.astro`

- [ ] Créer la page avec champ nouveau mdp + confirmation + show/hide toggle
- [ ] Commit : `feat(vitrine): page reset-password`
