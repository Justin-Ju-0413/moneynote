// 生成 PWA 图标。从 public/favicon.svg 光栅化为 192/512/apple-touch-icon。
// 运行:node scripts/generate-icons.mjs
import sharp from 'sharp'
import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const svgPath = resolve(root, 'public/favicon.svg')

const targets = [
  { file: 'icon-192x192.png', size: 192 },
  { file: 'icon-512x512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
]

const svg = await readFile(svgPath)
for (const { file, size } of targets) {
  await sharp(svg, { density: 384 })
    .resize(size, size)
    .png()
    .toFile(resolve(root, 'public', file))
  console.log(`✓ ${file} (${size}x${size})`)
}
console.log('done')
