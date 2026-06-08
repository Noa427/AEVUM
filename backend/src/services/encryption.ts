import crypto from 'crypto'

const ALGO = 'aes-256-gcm'
const VERSION_PREFIX = 'v1:'

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY!
  if (!hex || hex.length !== 64) throw new Error('ENCRYPTION_KEY doit être 32 bytes en hex (64 chars)')
  return Buffer.from(hex, 'hex')
}

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return VERSION_PREFIX + [iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':')
}

export function decrypt(data: string): string {
  // v0 (legacy, sans préfixe) et v1 utilisent le même format iv:tag:data — le préfixe
  // permet de distinguer les versions de clé lors de futures rotations
  const raw = data.startsWith(VERSION_PREFIX) ? data.slice(VERSION_PREFIX.length) : data
  const [ivHex, tagHex, encHex] = raw.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const encrypted = Buffer.from(encHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}
