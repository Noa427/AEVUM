import { createCanvas } from '@napi-rs/canvas'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegPath from 'ffmpeg-static'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { randomUUID } from 'crypto'
import { supabase } from './supabase'

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath)

const ELEVENLABS_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL' // Sarah — voix française
const SLIDE_DURATION = 7 // secondes par slide

export interface WeeklyStats {
  clientName: string
  newStudents: number
  emailsSent: number
  recovered: number
  recoveredAmount: number
  weekLabel: string
}

export async function generateWeeklyVideo(
  clientId: string,
  stats: WeeklyStats
): Promise<string> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-'))
  const audioPath  = path.join(tmpDir, 'voice.mp3')
  const outputPath = path.join(tmpDir, 'report.mp4')
  const storagePath = `${clientId}/rapport-${randomUUID()}.mp4`

  try {
    const script = buildScript(stats)
    await generateAudio(script, audioPath)
    const slidePaths = await generateSlides(stats, tmpDir)
    await assembleMp4(slidePaths, audioPath, outputPath)

    const fileBuffer = fs.readFileSync(outputPath)
    const { error: uploadError } = await supabase.storage
      .from('rapports-video')
      .upload(storagePath, fileBuffer, { contentType: 'video/mp4', upsert: true })

    if (uploadError) throw new Error(`Upload échoué: ${uploadError.message}`)

    const { data: signedData } = await supabase.storage
      .from('rapports-video')
      .createSignedUrl(storagePath, 7 * 24 * 3600)

    return signedData?.signedUrl ?? ''
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

function buildScript(stats: WeeklyStats): string {
  const studStr = `${stats.newStudents} nouvel${stats.newStudents > 1 ? 's' : ''} élève${stats.newStudents > 1 ? 's' : ''}`
  const recStr = stats.recovered > 0
    ? ` Vous avez récupéré ${stats.recovered} paiement${stats.recovered > 1 ? 's' : ''} pour un total de ${stats.recoveredAmount.toFixed(2)} euros.`
    : ''
  return (
    `Bonjour ${stats.clientName}. Voici votre rapport de la semaine. ` +
    `Cette semaine, vous avez accueilli ${studStr}. ` +
    `${stats.emailsSent} emails ont été envoyés automatiquement.` +
    recStr +
    ` Continuez sur cette lancée. À la semaine prochaine !`
  )
}

async function generateAudio(text: string, outputPath: string): Promise<void> {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY manquant')

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`ElevenLabs erreur ${res.status}: ${err}`)
  }

  const buffer = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(outputPath, buffer)
}

async function generateSlides(stats: WeeklyStats, tmpDir: string): Promise<string[]> {
  const W = 1280, H = 720
  const slides: Array<{ title: string; subtitle: string; color: string }> = [
    { title: stats.weekLabel, subtitle: stats.clientName, color: '#1a1a2e' },
    { title: String(stats.newStudents), subtitle: 'Nouveaux élèves', color: '#16213e' },
    { title: String(stats.emailsSent), subtitle: 'Emails envoyés', color: '#0f3460' },
    {
      title: stats.recovered > 0 ? `${stats.recoveredAmount.toFixed(2)} €` : '—',
      subtitle: stats.recovered > 0 ? `${stats.recovered} paiement(s) récupéré(s)` : 'Aucun impayé récupéré',
      color: '#533483',
    },
  ]

  const paths: string[] = []

  for (let i = 0; i < slides.length; i++) {
    const { title, subtitle, color } = slides[i]
    const canvas = createCanvas(W, H)
    const ctx    = canvas.getContext('2d')

    ctx.fillStyle = color
    ctx.fillRect(0, 0, W, H)

    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 80px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(title, W / 2, H / 2 - 20)

    ctx.font = '36px sans-serif'
    ctx.fillStyle = '#cccccc'
    ctx.fillText(subtitle, W / 2, H / 2 + 60)

    ctx.font = '24px sans-serif'
    ctx.fillStyle = '#888888'
    ctx.fillText('AutomatePro', W / 2, H - 40)

    const slidePath = path.join(tmpDir, `slide_${i}.png`)
    fs.writeFileSync(slidePath, canvas.toBuffer('image/png'))
    paths.push(slidePath)
  }

  return paths
}

function assembleMp4(
  slidePaths: string[],
  audioPath: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const listPath = outputPath.replace('.mp4', '.txt')
    const listContent =
      slidePaths.map(p => `file '${p}'\nduration ${SLIDE_DURATION}`).join('\n') +
      `\nfile '${slidePaths[slidePaths.length - 1]}'`
    fs.writeFileSync(listPath, listContent)

    ffmpeg()
      .input(listPath)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .input(audioPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions(['-pix_fmt', 'yuv420p', '-shortest'])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err: Error) => reject(err))
      .run()
  })
}
