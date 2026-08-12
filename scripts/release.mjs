#!/usr/bin/env node
/**
 * 发布自动化脚本（ROADMAP A4）：
 *   node scripts/release.mjs [patch|minor|major|<x.y.z>] [--dry-run]   # 全流程（无保护分支场景）
 *   node scripts/release.mjs --publish [--dry-run]                      # 仅发布（main 受保护场景）
 *
 * 全流程：1. 校验 git 干净 + 位于 main → 2. 计算新版本（SemVer 递增或 <x.y.z>）
 *         → 3. 同步版本号（package.json + APP_VERSION）→ 4. 校验 CHANGELOG 段
 *         → 5. commit（chore: version bump）→ 6. tag + push → 7. gh release（notes 取自 CHANGELOG）
 *
 * --publish 模式：main 有分支保护（required_status_checks）时，版本 bump 无法直接 push，
 *         需先走「分支 + PR」把 bump 提交合入 main；合并后在本模式发布：
 *         直接以当前 package.json 版本打 tag + push tag + gh release（不做任何 bump/commit）。
 *
 * 前置：gh CLI 已认证（gh auth status）；CHANGELOG 版本段已写好并合入 main。
 * 干跑：--dry-run 只打印将执行步骤，不做任何变更。
 */
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const dryRun = process.argv.includes('--dry-run')
const publishOnly = process.argv.includes('--publish')
const arg = process.argv.slice(2).find((a) => !a.startsWith('--'))

function run(cmd) {
  if (dryRun) {
    console.log(`  ⤷ ${cmd}`)
    return ''
  }
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim()
}

function readJSON(rel) {
  return JSON.parse(readFileSync(join(ROOT, rel), 'utf8'))
}

function nextVersion(current, bump) {
  const [major, minor, patch] = current.split('.').map(Number)
  switch (bump) {
    case 'patch': return `${major}.${minor}.${patch + 1}`
    case 'minor': return `${major}.${minor + 1}.0`
    case 'major': return `${major + 1}.0.0`
    default: {
      if (/^\d+\.\d+\.\d+$/.test(bump)) return bump
      throw new Error(`无法识别的版本参数: ${bump}（支持 patch | minor | major | <x.y.z>）`)
    }
  }
}

// ── 1. 前置校验 ──

const branch = run('git branch --show-current')
if (branch && branch !== 'main') {
  throw new Error(`必须在 main 分支发布（当前: ${branch}）`)
}
const dirty = run('git status --porcelain')
if (dirty) {
  throw new Error(`工作树不干净，请先提交或暂存:\n${dirty}`)
}

// ── 2. 版本：全流程计算新版本；--publish 直接用当前版本 ──

const pkg = readJSON('package.json')
const current = pkg.version
const target = publishOnly ? current : nextVersion(current, arg ?? 'patch')
console.log(
  publishOnly
    ? `发布当前版本 v${target}（--publish：bump 已通过 PR 合入 main）${dryRun ? '（dry-run）' : ''}`
    : `发布 v${current} → v${target}${dryRun ? '（dry-run）' : ''}`,
)

// ── 3. 同步版本号（仅全流程模式；--publish 假定 bump 已合入）──

const constantsPath = join(ROOT, 'src/utils/constants.ts')
const constants = readFileSync(constantsPath, 'utf8')
if (!publishOnly) {
  const updatedConstants = constants.replace(
    /(APP_VERSION = ')\d+\.\d+\.\d+(')/,
    `$1${target}$2`,
  )
  if (updatedConstants === constants) {
    throw new Error('src/utils/constants.ts 未找到 APP_VERSION，请检查格式')
  }
  if (!dryRun) {
    pkg.version = target
    writeFileSync(join(ROOT, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`)
    writeFileSync(constantsPath, updatedConstants)
    console.log('✓ 已同步版本号 package.json + constants.ts')
  }
} else if (!new RegExp(`APP_VERSION = '${target}'`).test(constants)) {
  throw new Error(`src/utils/constants.ts 的 APP_VERSION 与 package.json（${target}）不一致，请先合入 bump 提交`)
}

// ── 4. CHANGELOG 校验（版本段必须已存在）──

const changelog = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8')
const today = new Date().toISOString().slice(0, 10)
if (!new RegExp(`## \\[${target}\\] - \\d{4}-\\d{2}-\\d{2}`).test(changelog)) {
  throw new Error(
    `CHANGELOG.md 缺少 [${target}] 版本段，请先按 Keep a Changelog 格式补充:\n` +
    `## [${target}] - ${today}\n\n### Added / Changed / Fixed ...`,
  )
}

// 提取版本段正文作为 release notes（到下一个版本段为止）
const notes = (changelog.match(
  new RegExp(`## \\[${target}\\] - [^\\n]+\\n([\\s\\S]*?)(?=\\n## \\[|$)`),
)?.[1] ?? '').trim()
if (!notes) {
  throw new Error(`CHANGELOG [${target}] 段为空，无法生成 release notes`)
}

// ── 5–7. commit（仅全流程）→ tag → push → release ──

// tag 防重：已存在则中止（避免重复打 tag 或覆盖旧 tag）
if (run(`git rev-parse -q --verify refs/tags/v${target}`)) {
  throw new Error(`tag v${target} 已存在（指向 ${run(`git rev-parse --short refs/tags/v${target}`)}），如需重发请先删除远端 tag`)
}

if (!publishOnly) {
  run('git add package.json src/utils/constants.ts')
  run(`git commit -m "chore: version bump ${current}→${target}"`)
  // 注：main 有分支保护时此 push 会被拒绝——此时改用「分支+PR」合入 bump，然后以 --publish 模式发布
  run('git push origin main')
}

run(`git tag -a v${target} -m "v${target}"`)
run(`git push origin v${target}`)

// notes 写入临时文件（避免引号/换行转义问题）
const notesFile = join(mkdtempSync(join(tmpdir(), 'moneynote-release-')), 'notes.md')
if (!dryRun) {
  writeFileSync(notesFile, notes)
}
run(`gh release create v${target} --title "v${target}" --notes-file "${notesFile}"`)

console.log(`\n✅ 发布完成: https://github.com/Justin-Ju-0413/moneynote/releases/tag/v${target}`)
