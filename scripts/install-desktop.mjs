#!/usr/bin/env node
// 把 `npm run desktop:build` 产出的 MoneyNote.app 安装到 /Applications。
// 用法：npm run desktop:install
import { cpSync, existsSync, rmSync } from 'node:fs'
import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(root, 'src-tauri/target/release/bundle/macos/MoneyNote.app')
const dest = '/Applications/MoneyNote.app'

if (!existsSync(src)) {
  console.error(`未找到构建产物：${src}`)
  console.error('请先运行 `npm run desktop:build`（首次需 Rust 工具链）')
  process.exit(1)
}

const isRunning = (appPath) => {
  try {
    execSync(`pgrep -f "${appPath}/Contents/MacOS"`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

if (isRunning(dest)) {
  console.error('/Applications/MoneyNote.app 正在运行，请先退出（⌘Q 或关窗）再安装。')
  process.exit(1)
}

try {
  rmSync(dest, { recursive: true, force: true })
  cpSync(src, dest, { recursive: true })
  console.log(`已安装到 ${dest}`)
  console.log('可从「启动台 / 访达-应用程序」打开，双击即用，关窗即退出。')
} catch (err) {
  console.error(`安装失败：${err.message}`)
  console.error('若无写入权限，可手动把 src-tauri/target/release/bundle/macos/MoneyNote.app 拖入「应用程序」。')
  process.exit(1)
}
