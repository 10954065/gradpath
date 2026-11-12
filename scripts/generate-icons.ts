/** Generate the PWA icon set in public/icons from a single SVG mark (npm run icons). */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

const OUT = join(process.cwd(), 'public', 'icons')

function mark(size: number, padding: number, rounded: boolean): string {
  const s = 32
  const inner = s - padding * 2
  const scale = inner / s
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${size}" height="${size}">
  <rect width="${s}" height="${s}" rx="${rounded ? 7 : 0}" fill="#0b1530"/>
  <g transform="translate(${padding} ${padding}) scale(${scale})">
    <rect x="2" y="2" width="28" height="28" rx="7" fill="#4350c8"/>
    <path d="M8 22.5 L14 16.5 L18.5 19 L24 10" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="8" cy="22.5" r="2" fill="#ffffff"/>
    <circle cx="14" cy="16.5" r="2" fill="#ffffff"/>
    <circle cx="24" cy="10" r="2.4" fill="#fbbf24"/>
  </g>
</svg>`
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, 'favicon.svg'), mark(32, 0, true))
  const targets: [string, number, number, boolean][] = [
    ['icon-192.png', 192, 0, true],
    ['icon-512.png', 512, 0, true],
    ['icon-maskable-512.png', 512, 5, false],
    ['apple-touch-icon.png', 180, 2, false],
  ]
  for (const [file, size, padding, rounded] of targets) {
    await sharp(Buffer.from(mark(size, padding, rounded))).png().toFile(join(OUT, file))
    console.log(`wrote public/icons/${file}`)
  }
}

main().catch((e: unknown) => {
  console.error(e)
  process.exit(1)
})
