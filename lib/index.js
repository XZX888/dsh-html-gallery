// @local/dsh-html-gallery — host half
//
// HTML 作品廊的宿主端：
//   1. 扫描工作区（或配置的多个目录）里的 .html / .htm 文件；
//   2. 按「根目录 + 一级文件夹」分组，附带 <title>、大小、修改时间；
//   3. 注册同源 HTTP 路由：
//        GET /api/dsh-html-gallery/snapshot      作品清单
//        GET /api/dsh-html-gallery/site/<root>/<rel>  原样提供 HTML 及其相对资源
//
// 零 @deepseek-ai 依赖：只用 node 内置模块 + Cordis 的 ctx 服务。

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'

export const name = 'html-gallery'
export const inject = ['webServer']

const ROUTE_PREFIX = '/api/dsh-html-gallery'
const SITE_PREFIX = `${ROUTE_PREFIX}/site`
const SNAPSHOT_TTL_MS = 4000
const ROOTS_TTL_MS = 5000
const MAX_HTML_ITEMS = 2000
const MAX_HTML_ITEMS_PER_ROOT = 500
const MAX_WALK_ENTRIES = 30000
const MAX_DEPTH = 9
const MAX_TITLE_BYTES = 96 * 1024
const ROOT_LEVEL_LABEL = '根目录'
const REGISTRY_DIR = '.dsh-html-gallery'
const REGISTRY_FILE = 'categories.json'
const TRASH_DIR = 'trash'
const EXTRA_ROOTS_DIR = 'html-gallery'
const EXTRA_ROOTS_FILE = 'roots.json'
const WORKSPACE_STORE = path.join('storages', 'workspace.json')
const MAX_BODY_BYTES = 64 * 1024
const INVALID_NAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/

const DEFAULT_EXCLUDED_DIRS = [
  'node_modules', '.git', '.svn', '.hg', '.dsh', '.dsh-tmp', '.tools',
  '.cache', '.npm', '.pnpm-store', '.venv', 'venv', '__pycache__',
  '.idea', '.vscode', '.next', '.nuxt', '.turbo', '.yarn',
  'windows', 'program files', 'program files (x86)', 'programdata',
  '$recycle.bin', 'system volume information', '.ssh', '.aws', '.gnupg', 'appdata',
]

const MIME_BY_EXT = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.wasm': 'application/wasm',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

function isHtmlName(name) {
  const lower = String(name || '').toLowerCase()
  return lower.endsWith('.html') || lower.endsWith('.htm')
}

function extOf(name) {
  const base = String(name || '').toLowerCase()
  const dot = base.lastIndexOf('.')
  return dot <= 0 ? '' : base.slice(dot)
}

function mimeOf(name) {
  return MIME_BY_EXT[extOf(name)] || 'application/octet-stream'
}

function isLoopback(req) {
  const addr = req.socket && req.socket.remoteAddress
  if (!addr) return true
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1' || addr === 'localhost'
}

function isInside(rootDir, absPath) {
  const rel = path.relative(rootDir, absPath)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

function decodeEntities(text) {
  return String(text).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code) => {
    if (code[0] === '#') {
      const hex = code[1] && code[1].toLowerCase() === 'x'
      const value = Number.parseInt(hex ? code.slice(2) : code.slice(1), hex ? 16 : 10)
      if (!Number.isFinite(value)) return match
      try {
        return String.fromCodePoint(value)
      } catch {
        return match
      }
    }
    const key = code.toLowerCase()
    return Object.prototype.hasOwnProperty.call(ENTITIES, key) ? ENTITIES[key] : match
  })
}

function sendJson(res, status, body, headOnly) {
  const payload = JSON.stringify(body)
  try {
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': String(Buffer.byteLength(payload)),
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    })
    res.end(headOnly ? undefined : payload)
  } catch {
    /* 客户端已断开 */
  }
}

function sendText(res, status, text) {
  try {
    res.writeHead(status, {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    })
    res.end(text)
  } catch {
    /* 客户端已断开 */
  }
}

function formatBytes(bytes) {
  const n = Number(bytes) || 0
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`
}

async function readHtmlTitle(absPath, size) {
  if (!size || size <= 0) return ''
  try {
    const handle = await fsp.open(absPath, 'r')
    try {
      const length = Math.min(size, MAX_TITLE_BYTES)
      const buffer = Buffer.alloc(length)
      const { bytesRead } = await handle.read(buffer, 0, length, 0)
      const head = buffer.subarray(0, bytesRead).toString('utf8')
      const match = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
      if (!match) return ''
      return decodeEntities(match[1].replace(/\s+/g, ' ').trim()).slice(0, 140)
    } finally {
      await handle.close()
    }
  } catch {
    return ''
  }
}

function stripHtmlExt(name) {
  return String(name || '').replace(/\.html?$/i, '')
}

function asStringArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean)
  if (typeof value === 'string' && value.trim()) return [value]
  return []
}

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function normalizeCategoryName(raw) {
  const name = String(raw == null ? '' : raw).trim()
  if (!name) throw new HttpError(400, '分类名不能为空')
  if (name === ROOT_LEVEL_LABEL) throw new HttpError(400, '「根目录」是内置分组，不能改名或删除')
  if (name.length > 48) throw new HttpError(400, '分类名最多 48 个字')
  if (name.startsWith('.')) throw new HttpError(400, '分类名不能以点开头')
  if (INVALID_NAME_CHARS.test(name)) throw new HttpError(400, '分类名不能包含 < > : " / \\ | ? * 这些字符')
  if (/[. ]$/.test(name)) throw new HttpError(400, '分类名不能以空格或点结尾')
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(name)) {
    throw new HttpError(400, '这个名称是 Windows 保留名，换一个吧')
  }
  return name
}

function categoryRegistryPath(root) {
  return path.join(root.dir, REGISTRY_DIR, REGISTRY_FILE)
}

async function readCategoryRegistry(root) {
  try {
    const raw = await fsp.readFile(categoryRegistryPath(root), 'utf8')
    const data = JSON.parse(raw)
    if (!data || !Array.isArray(data.categories)) return []
    return data.categories
      .map((name) => (typeof name === 'string' ? name.trim() : ''))
      .filter(Boolean)
  } catch {
    return []
  }
}

async function writeCategoryRegistry(root, names) {
  const unique = [...new Set(names.map((name) => String(name || '').trim()).filter(Boolean))]
  const payload = JSON.stringify({ version: 1, categories: unique.slice(0, 200) }, null, 2)
  await fsp.mkdir(path.join(root.dir, REGISTRY_DIR), { recursive: true })
  await fsp.writeFile(categoryRegistryPath(root), payload, 'utf8')
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, '请求内容太大'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (size === 0) {
        resolve({})
        return
      }
      try {
        const data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        resolve(data && typeof data === 'object' ? data : {})
      } catch {
        reject(new HttpError(400, '请求不是合法的 JSON'))
      }
    })
    req.on('error', reject)
  })
}

function findCategoryRoot(roots, rootsById, body) {
  const rootId = body && body.rootId ? String(body.rootId) : (roots[0] && roots[0].id)
  const root = rootId ? rootsById.get(rootId) : null
  if (!root) throw new HttpError(400, '找不到要操作的扫描目录')
  return root
}

function directChildPath(root, name) {
  const target = path.resolve(root.dir, name)
  if (path.dirname(target) !== path.resolve(root.dir)) {
    throw new HttpError(400, '分类名不合法')
  }
  return target
}

// ---------------------------------------------------------------------------
// 根目录解析与扫描
// ---------------------------------------------------------------------------

function samePath(a, b) {
  if (!a || !b) return false
  return process.platform === 'win32'
    ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()
    : path.resolve(a) === path.resolve(b)
}

function rootIdForPath(absPath) {
  const key = process.platform === 'win32' ? path.resolve(absPath).toLowerCase() : path.resolve(absPath)
  return 'r' + createHash('sha1').update(key).digest('hex').slice(0, 10)
}

function normalizeRootPath(input, defaultDirectory) {
  let value = String(input == null ? '' : input).trim()
  if (!value) return ''
  if (value === '~') value = os.homedir()
  else if (value.startsWith('~/') || value.startsWith('~\\')) value = path.join(os.homedir(), value.slice(2))
  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(defaultDirectory, value)
}

function readWorkspaceEntries() {
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  if (!home) return []
  try {
    const file = path.join(home, WORKSPACE_STORE)
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    const table = data && data.tables && data.tables.workspaces
    if (!table || typeof table !== 'object') return []
    return Object.values(table)
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null
        const dir = typeof entry.path === 'string' ? entry.path.trim() : ''
        if (!dir) return null
        const title = typeof entry.title === 'string' ? entry.title.trim() : ''
        return { dir, title }
      })
      .filter(Boolean)
  } catch {
    return []
  }
}

function extraRootsFilePath(config, defaultDirectory) {
  if (config && config.extraRootsFile) {
    const file = String(config.extraRootsFile)
    return path.isAbsolute(file) ? path.resolve(file) : path.resolve(defaultDirectory, file)
  }
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  return path.join(home, EXTRA_ROOTS_DIR, EXTRA_ROOTS_FILE)
}

function readExtraRoots(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!data || !Array.isArray(data.roots)) return []
    return data.roots
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean)
  } catch {
    return []
  }
}

async function writeExtraRoots(file, list) {
  const unique = []
  for (const item of list) {
    const value = String(item || '').trim()
    if (!value) continue
    if (unique.some((existing) => samePath(existing, value))) continue
    unique.push(path.resolve(value))
  }
  await fsp.mkdir(path.dirname(file), { recursive: true })
  await fsp.writeFile(file, JSON.stringify({ version: 1, roots: unique }, null, 2), 'utf8')
}

function createRootManager(config, defaultDirectory) {
  const cfg = config && typeof config === 'object' ? config : {}
  const explicitRoots = asStringArray(cfg.roots)
  const autoWorkspaces = cfg.autoWorkspaces !== false
  const extraFile = extraRootsFilePath(cfg, defaultDirectory)
  let roots = []
  let rootsById = new Map()
  let lastAt = 0
  let pending = null

  function collect() {
    const used = new Set()
    const labels = new Set()
    const out = []

    function add(input, kind, title) {
      const dir = normalizeRootPath(input, defaultDirectory)
      if (!dir) return
      const key = process.platform === 'win32' ? dir.toLowerCase() : dir
      if (used.has(key)) return
      used.add(key)

      let exists = false
      try {
        exists = fs.statSync(dir).isDirectory()
      } catch {
        exists = false
      }
      if (!exists && kind !== 'config' && kind !== 'default') return

      const fallback = path.basename(dir) || path.parse(dir).root || dir
      const baseLabel = String(title || '').trim() || fallback
      let label = baseLabel
      if (labels.has(label.toLowerCase())) {
        const parent = path.basename(path.dirname(dir)) || ''
        label = parent ? `${parent} / ${baseLabel}` : baseLabel
      }
      let suffix = 2
      const stem = label
      while (labels.has(label.toLowerCase())) {
        label = `${stem} (${suffix})`
        suffix += 1
      }
      labels.add(label.toLowerCase())
      out.push({ id: rootIdForPath(dir), label, dir, kind, exists })
    }

    const base = explicitRoots.length > 0 ? explicitRoots : [defaultDirectory]
    for (const item of base) add(item, 'config')
    if (autoWorkspaces) {
      for (const item of readWorkspaceEntries()) add(item.dir, 'workspace', item.title)
    }
    for (const item of readExtraRoots(extraFile)) add(item, 'extra')
    return out
  }

  async function refresh(force) {
    if (!force && roots.length > 0 && Date.now() - lastAt < ROOTS_TTL_MS) return roots
    if (pending) return pending
    pending = Promise.resolve()
      .then(() => {
        roots = collect()
        rootsById = new Map(roots.map((root) => [root.id, root]))
        lastAt = Date.now()
        return roots
      })
      .finally(() => {
        pending = null
      })
    return pending
  }

  return {
    refresh,
    current: () => roots,
    byId: (id) => rootsById.get(id) || null,
    extraFile,
    async addExtra(input) {
      await refresh()
      const raw = typeof input === 'string' ? input.trim().replace(/^"(.*)"$/, '$1').trim() : ''
      const dir = normalizeRootPath(raw, defaultDirectory)
      if (!dir) throw new HttpError(400, '目录路径不能为空')
      let stat
      try {
        stat = await fsp.stat(dir)
      } catch {
        throw new HttpError(400, '目录不存在或打不开')
      }
      if (!stat.isDirectory()) throw new HttpError(400, '这个路径不是文件夹')
      const existing = roots.find((root) => samePath(root.dir, dir))
      if (existing) return { root: existing, added: false }

      const list = readExtraRoots(extraFile)
      if (!list.some((item) => samePath(item, dir))) {
        list.push(dir)
        await writeExtraRoots(extraFile, list)
      }
      await refresh(true)
      const root = roots.find((item) => samePath(item.dir, dir))
      return { root, added: true }
    },
    async removeExtra(rootId) {
      await refresh()
      const target = rootsById.get(rootId)
      if (!target) throw new HttpError(404, '找不到这个扫描目录')
      if (target.kind !== 'extra') throw new HttpError(400, '这个目录是自动发现的，不能在这里移除')
      const next = readExtraRoots(extraFile).filter((item) => !samePath(item, target.dir))
      await writeExtraRoots(extraFile, next)
      await refresh(true)
      return { removed: true, path: target.dir }
    },
  }
}

async function scanHtmlFiles(root, options) {
  const items = []
  const { excludedDirs, maxItems, maxEntries, maxDepth } = options
  let entriesSeen = 0
  let truncated = false
  let error = ''

  async function walk(dir, parts, depth) {
    if (items.length >= maxItems || entriesSeen >= maxEntries) {
      truncated = true
      return
    }
    if (depth > maxDepth) return

    let entries
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true })
    } catch (err) {
      if (depth === 0) error = String((err && err.message) || err)
      return
    }

    for (const entry of entries) {
      if (items.length >= maxItems || entriesSeen >= maxEntries) {
        truncated = true
        break
      }
      if (entry.isSymbolicLink()) continue
      entriesSeen += 1
      const name = entry.name

      if (entry.isDirectory()) {
        if (name.startsWith('.')) continue
        if (excludedDirs.has(name.toLowerCase())) continue
        await walk(path.join(dir, name), parts.concat(name), depth + 1)
        continue
      }

      if (!entry.isFile() || !isHtmlName(name)) continue

      const absPath = path.join(dir, name)
      let stat
      try {
        stat = await fsp.stat(absPath)
      } catch {
        continue
      }
      const title = await readHtmlTitle(absPath, stat.size)
      items.push({
        name,
        title: title || stripHtmlExt(name),
        parts,
        absPath,
        size: stat.size,
        mtime: stat.mtime.toISOString(),
      })
    }
  }

  await walk(root.dir, [], 0)
  return { items, truncated, error }
}

// ---------------------------------------------------------------------------
// HTTP 路由
// ---------------------------------------------------------------------------

function parseRange(header, size) {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim())
  if (!match) return { invalid: true }
  let start = match[1] === '' ? null : Number(match[1])
  let end = match[2] === '' ? null : Number(match[2])
  if (start === null && end === null) return { invalid: true }
  if (start === null) {
    const suffix = end
    if (!Number.isFinite(suffix) || suffix <= 0) return { invalid: true }
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    if (!Number.isFinite(start) || start < 0 || start >= size) return { invalid: true }
    if (end === null || !Number.isFinite(end) || end >= size) end = size - 1
  }
  if (start > end) return { invalid: true }
  return { start, end }
}

function serveFile(req, res, absPath, { logger } = {}) {
  return fsp.stat(absPath).then((stat) => {
    if (!stat.isFile()) {
      sendText(res, 404, 'not found')
      return
    }
    const filename = path.basename(absPath)
    const ext = extOf(filename)
    if (filename.startsWith('.') || !MIME_BY_EXT[ext]) {
      sendText(res, 404, 'not found')
      return
    }
    const range = parseRange(req.headers.range, stat.size)
    const isHead = (req.method || 'GET') === 'HEAD'

    if (range && range.invalid) {
      res.writeHead(416, {
        'content-range': `bytes */${stat.size}`,
        'cache-control': 'no-store',
      })
      res.end()
      return
    }

    const headers = {
      'content-type': mimeOf(filename),
      'cache-control': isHtmlName(filename) ? 'no-store' : 'no-cache',
      'last-modified': stat.mtime.toUTCString(),
      'accept-ranges': 'bytes',
      'content-disposition': 'inline',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    }

    let start = 0
    let end = stat.size - 1
    let status = 200
    if (range && !range.invalid) {
      start = range.start
      end = range.end
      status = 206
      headers['content-range'] = `bytes ${start}-${end}/${stat.size}`
    }
    headers['content-length'] = String(Math.max(0, end - start + 1))

    res.writeHead(status, headers)
    if (isHead || stat.size === 0) {
      res.end()
      return
    }

    const stream = fs.createReadStream(absPath, { start, end })
    stream.on('error', (error) => {
      if (logger) logger.warn(`[html-gallery] 读取文件失败：${absPath} — ${(error && error.message) || error}`)
      try {
        res.destroy()
      } catch {
        /* ignore */
      }
    })
    res.on('close', () => stream.destroy())
    stream.pipe(res)
  })
}

function createHttpHandler({ rootManager, excludedDirs, logger }) {
  let cache = { at: 0, snapshot: null, pending: null }

  async function buildSnapshot(forceRoots = false) {
    const roots = await rootManager.refresh(forceRoots)
    const categories = new Map()
    const rootSummaries = []
    let total = 0
    let truncated = false

    for (const root of roots) {
      const result = await scanHtmlFiles(root, {
        excludedDirs,
        maxItems: Math.min(MAX_HTML_ITEMS_PER_ROOT, MAX_HTML_ITEMS - total),
        maxEntries: MAX_WALK_ENTRIES,
        maxDepth: MAX_DEPTH,
      })
      if (result.truncated) truncated = true
      rootSummaries.push({
        id: root.id,
        label: root.label,
        path: root.dir,
        kind: root.kind,
        exists: root.exists !== false,
        error: result.error || '',
        count: result.items.length,
      })

      for (const item of result.items) {
        const topFolder = item.parts.length > 0 ? item.parts[0] : ''
        const groupName = topFolder || ROOT_LEVEL_LABEL
        const groupId = `${root.id}:${topFolder}`
        let group = categories.get(groupId)
        if (!group) {
          group = {
            id: groupId,
            name: groupName,
            rootId: root.id,
            rootLabel: root.label,
            topFolder,
            items: [],
          }
          categories.set(groupId, group)
        }

        const relativePath = item.parts.concat(item.name).join('/')
        const encodedPath = relativePath.split('/').map((segment) => encodeURIComponent(segment)).join('/')
        const categoryName = group.name
        group.items.push({
          key: `${root.id}:${relativePath}`,
          rootId: root.id,
          rootLabel: root.label,
          path: relativePath,
          name: item.name,
          title: item.title || stripHtmlExt(item.name),
          categoryId: groupId,
          category: categoryName,
          absPath: item.absPath,
          size: item.size,
          sizeLabel: formatBytes(item.size),
          mtime: item.mtime,
          url: `${SITE_PREFIX.slice(1)}/${root.id}/${encodedPath}`,
        })
        total += 1
      }

      // 新建的空分类也保留在列表里，等 HTML 放进来就有内容了。
      const registered = await readCategoryRegistry(root)
      for (const folder of registered) {
        if (folder.startsWith('.') || excludedDirs.has(folder.toLowerCase())) continue
        let stat
        try {
          stat = await fsp.stat(path.join(root.dir, folder))
        } catch {
          continue
        }
        if (!stat.isDirectory()) continue
        const groupId = `${root.id}:${folder}`
        if (categories.has(groupId)) continue
        categories.set(groupId, {
          id: groupId,
          name: folder,
          rootId: root.id,
          rootLabel: root.label,
          topFolder: folder,
          items: [],
        })
      }
    }

    const ordered = [...categories.values()].sort((a, b) => {
      if (a.rootId !== b.rootId) {
        return roots.findIndex((r) => r.id === a.rootId) - roots.findIndex((r) => r.id === b.rootId)
      }
      if (a.topFolder === '' && b.topFolder !== '') return -1
      if (b.topFolder === '' && a.topFolder !== '') return 1
      return a.topFolder.localeCompare(b.topFolder, 'zh-Hans-CN')
    })

    for (const group of ordered) {
      group.items.sort((a, b) => {
        const delta = new Date(b.mtime).getTime() - new Date(a.mtime).getTime()
        return delta !== 0 ? delta : a.name.localeCompare(b.name, 'zh-Hans-CN')
      })
      group.count = group.items.length
    }

    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      roots: rootSummaries,
      categories: ordered,
      total,
      truncated,
      limits: { maxItems: MAX_HTML_ITEMS, maxItemsPerRoot: MAX_HTML_ITEMS_PER_ROOT, maxDepth: MAX_DEPTH },
    }
  }

  async function getSnapshot(force) {
    const fresh = cache.snapshot && Date.now() - cache.at < SNAPSHOT_TTL_MS
    if (!force && fresh) return cache.snapshot
    if (!force && cache.pending) return cache.pending
    const pending = buildSnapshot(force).then((snapshot) => {
      cache = { at: Date.now(), snapshot, pending: null }
      return snapshot
    }).catch((error) => {
      cache.pending = null
      throw error
    })
    cache.pending = pending
    return pending
  }

  async function createCategory(body) {
    const roots = await rootManager.refresh()
    const root = findCategoryRoot(roots, new Map(roots.map((item) => [item.id, item])), body)
    const name = normalizeCategoryName(body.name)
    if (excludedDirs.has(name.toLowerCase())) {
      throw new HttpError(400, '这个名字会被扫描排除，换一个吧')
    }
    const target = directChildPath(root, name)
    if (fs.existsSync(target)) {
      throw new HttpError(409, '已经有同名文件或文件夹了')
    }
    try {
      await fsp.mkdir(target)
    } catch (error) {
      if (error && error.code === 'EEXIST') throw new HttpError(409, '已经有同名文件或文件夹了')
      throw new HttpError(400, '建文件夹失败：' + String((error && error.message) || error))
    }
    try {
      const registered = await readCategoryRegistry(root)
      if (!registered.some((item) => item.toLowerCase() === name.toLowerCase())) {
        await writeCategoryRegistry(root, registered.concat(name))
      }
    } catch (error) {
      try {
        await fsp.rmdir(target)
      } catch {
        /* ignore */
      }
      throw new HttpError(500, '分类登记失败，文件夹已回滚：' + String((error && error.message) || error))
    }

    const snapshot = await getSnapshot(true)
    return { ok: true, rootId: root.id, name, categoryId: `${root.id}:${name}`, snapshot }
  }

  async function renameCategory(body) {
    const roots = await rootManager.refresh()
    const root = findCategoryRoot(roots, new Map(roots.map((item) => [item.id, item])), body)
    const from = normalizeCategoryName(body.from)
    const to = normalizeCategoryName(body.to)
    if (excludedDirs.has(to.toLowerCase())) {
      throw new HttpError(400, '这个名字会被扫描排除，换一个吧')
    }
    if (from === to) throw new HttpError(400, '名字没有变化')
    const source = directChildPath(root, from)
    const target = directChildPath(root, to)

    let stat
    try {
      stat = await fsp.stat(source)
    } catch {
      throw new HttpError(404, '找不到这个分类文件夹')
    }
    if (!stat.isDirectory()) throw new HttpError(404, '这个分类不是文件夹')

    const key = (value) => (process.platform === 'win32' ? value.toLowerCase() : value)
    const caseOnly = key(source) === key(target)
    if (!caseOnly && fs.existsSync(target)) {
      throw new HttpError(409, '已经有同名文件或文件夹了')
    }

    try {
      await fsp.rename(source, target)
    } catch (error) {
      if (caseOnly) {
        // Windows 上仅改大小写时偶尔会 EPERM，绕一圈再改。
        const temp = source + '.rename-' + Date.now()
        try {
          await fsp.rename(source, temp)
          await fsp.rename(temp, target)
        } catch (retryError) {
          throw new HttpError(400, '重命名失败：' + String((retryError && retryError.message) || retryError))
        }
      } else {
        throw new HttpError(400, '重命名失败：' + String((error && error.message) || error))
      }
    }

    try {
      const registered = await readCategoryRegistry(root)
      const index = registered.findIndex((item) => item.toLowerCase() === from.toLowerCase())
      const next = registered.slice()
      if (index >= 0) next[index] = to
      else next.push(to)
      await writeCategoryRegistry(root, next)
    } catch (error) {
      if (logger) logger.warn(`[html-gallery] 分类已重命名，但登记文件更新失败：${(error && error.message) || error}`)
    }

    const snapshot = await getSnapshot(true)
    return { ok: true, rootId: root.id, from, to, categoryId: `${root.id}:${to}`, snapshot }
  }

  function safeTrashName(name) {
    return String(name || 'item')
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
      .slice(0, 72) || 'item'
  }

  async function moveToTrash(root, source, displayName, kind) {
    const trashDir = path.join(root.dir, REGISTRY_DIR, TRASH_DIR)
    await fsp.mkdir(trashDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
    const base = `${stamp}-${safeTrashName(displayName)}`
    let target = path.join(trashDir, base)
    let index = 1
    while (fs.existsSync(target)) {
      target = path.join(trashDir, `${base}-${index}`)
      index += 1
    }
    try {
      await fsp.rename(source, target)
    } catch (error) {
      const code = error && error.code
      if (code === 'ENOENT') throw new HttpError(404, '文件已经不在原处了')
      if (code === 'EPERM' || code === 'EBUSY' || code === 'EACCES') {
        throw new HttpError(409, '文件可能正在被占用，关掉相关页面后再试')
      }
      throw new HttpError(400, '移到回收站失败：' + String((error && error.message) || error))
    }
    return {
      trashPath: path.relative(root.dir, target).split(path.sep).join('/'),
      trashAbsPath: target,
      kind,
    }
  }

  async function deleteFile(body) {
    const roots = await rootManager.refresh()
    const root = findCategoryRoot(roots, new Map(roots.map((item) => [item.id, item])), body)
    const raw = String(body.path == null ? '' : body.path).replace(/\\/g, '/')
    const segments = raw.split('/').filter(Boolean)
    if (
      segments.length === 0
      || segments.some((segment) => segment === '.' || segment === '..'
        || segment.includes(':') || segment.includes('\0'))
    ) {
      throw new HttpError(400, '文件路径不合法')
    }
    const absPath = path.resolve(root.dir, ...segments)
    if (!isInside(root.dir, absPath)) throw new HttpError(400, '文件路径不合法')

    let stat
    let link
    try {
      stat = await fsp.stat(absPath)
      link = await fsp.lstat(absPath)
    } catch {
      throw new HttpError(404, '找不到这个文件')
    }
    if (link.isSymbolicLink()) throw new HttpError(400, '不能删除符号链接')
    if (!stat.isFile()) throw new HttpError(400, '这不是文件')
    if (!isHtmlName(absPath)) throw new HttpError(400, '只能删除 HTML 文件')

    const trashed = await moveToTrash(root, absPath, path.basename(absPath), 'file')
    const snapshot = await getSnapshot(true)
    return { ok: true, rootId: root.id, path: raw, ...trashed, snapshot }
  }

  async function deleteCategory(body) {
    const roots = await rootManager.refresh()
    const root = findCategoryRoot(roots, new Map(roots.map((item) => [item.id, item])), body)
    const name = normalizeCategoryName(body.name)
    if (name === ROOT_LEVEL_LABEL) throw new HttpError(400, '「根目录」是内置分组，不能删除')
    const source = directChildPath(root, name)

    let stat
    let link
    try {
      stat = await fsp.stat(source)
      link = await fsp.lstat(source)
    } catch {
      throw new HttpError(404, '找不到这个分类文件夹')
    }
    if (link.isSymbolicLink()) throw new HttpError(400, '不能删除符号链接')
    if (!stat.isDirectory()) throw new HttpError(404, '这个分类不是文件夹')

    const trashed = await moveToTrash(root, source, name, 'category')
    try {
      const registered = await readCategoryRegistry(root)
      await writeCategoryRegistry(root, registered.filter((item) => item.toLowerCase() !== name.toLowerCase()))
    } catch (error) {
      if (logger) logger.warn(`[html-gallery] 分类已移到回收站，但登记文件更新失败：${(error && error.message) || error}`)
    }

    const snapshot = await getSnapshot(true)
    return { ok: true, rootId: root.id, name, ...trashed, snapshot }
  }

  return async function handle(req, res) {
    try {
      if (!isLoopback(req)) {
        sendJson(res, 403, { error: 'forbidden: loopback-only' })
        return
      }

      const method = req.method || 'GET'
      const isHead = method === 'HEAD'
      const url = new URL(req.url || '/', 'http://local')
      const pathname = url.pathname

      if (pathname === `${ROUTE_PREFIX}/snapshot`) {
        if (method !== 'GET' && !isHead) {
          sendJson(res, 405, { error: 'method not allowed' })
          return
        }
        const snapshot = await getSnapshot(url.searchParams.get('refresh') === '1')
        sendJson(res, 200, snapshot, isHead)
        return
      }

      if (pathname === `${ROUTE_PREFIX}/health`) {
        const roots = await rootManager.refresh()
        sendJson(res, 200, {
          ok: true,
          roots: roots.map((root) => ({
            id: root.id,
            label: root.label,
            path: root.dir,
            kind: root.kind,
            exists: fs.existsSync(root.dir),
          })),
          extraRootsFile: rootManager.extraFile,
        }, isHead)
        return
      }

      if (pathname === `${ROUTE_PREFIX}/roots/add` || pathname === `${ROUTE_PREFIX}/roots/remove`) {
        if (method !== 'POST') {
          sendJson(res, 405, { error: 'method not allowed' })
          return
        }
        const body = await readJsonBody(req)
        const result = pathname === `${ROUTE_PREFIX}/roots/add`
          ? await rootManager.addExtra(body.path)
          : await rootManager.removeExtra(body.rootId)
        const snapshot = await getSnapshot(true)
        sendJson(res, 200, { ok: true, ...result, snapshot })
        return
      }

      if (pathname === `${ROUTE_PREFIX}/delete`) {
        if (method !== 'POST') {
          sendJson(res, 405, { error: 'method not allowed' })
          return
        }
        const body = await readJsonBody(req)
        if (body.kind !== 'file' && body.kind !== 'category') {
          throw new HttpError(400, '未知的删除类型')
        }
        const result = body.kind === 'file'
          ? await deleteFile(body)
          : await deleteCategory(body)
        sendJson(res, 200, result)
        return
      }

      if (pathname === `${ROUTE_PREFIX}/categories/create` || pathname === `${ROUTE_PREFIX}/categories/rename`) {
        if (method !== 'POST') {
          sendJson(res, 405, { error: 'method not allowed' })
          return
        }
        const body = await readJsonBody(req)
        const result = pathname === `${ROUTE_PREFIX}/categories/create`
          ? await createCategory(body)
          : await renameCategory(body)
        sendJson(res, 200, result)
        return
      }

      if (pathname === SITE_PREFIX || pathname.startsWith(`${SITE_PREFIX}/`)) {
        if (method !== 'GET' && !isHead) {
          sendJson(res, 405, { error: 'method not allowed' })
          return
        }
        if (pathname === SITE_PREFIX) {
          sendText(res, 404, 'not found')
          return
        }

        const tail = pathname.slice(SITE_PREFIX.length + 1)
        let segments
        try {
          segments = tail.split('/').map((segment) => decodeURIComponent(segment))
        } catch {
          sendText(res, 400, 'bad path')
          return
        }
        if (
          segments.length < 2
          || segments.some((segment) => !segment || segment === '.' || segment === '..'
            || segment.includes('/') || segment.includes('\\') || segment.includes(':') || segment.includes('\0'))
        ) {
          sendText(res, 404, 'not found')
          return
        }

        const rootId = segments.shift()
        let root = rootManager.byId(rootId)
        if (!root) {
          await rootManager.refresh(true)
          root = rootManager.byId(rootId)
        }
        if (!root) {
          sendText(res, 404, 'unknown root')
          return
        }

        const absPath = path.resolve(root.dir, ...segments)
        if (!isInside(root.dir, absPath)) {
          sendText(res, 404, 'not found')
          return
        }
        await serveFile(req, res, absPath, { logger })
        return
      }

      sendJson(res, 404, { error: 'not found' })
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500
      if (status >= 500 && logger) logger.warn(`[html-gallery] 请求处理失败：${(error && error.stack) || error}`)
      try {
        if (!res.headersSent) sendJson(res, status, { error: String((error && error.message) || error) })
        else res.end()
      } catch {
        /* ignore */
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 插件入口
// ---------------------------------------------------------------------------

export function apply(ctx, config = {}) {
  const logger = ctx.logger ? ctx.logger(name) : console
  const workingDirectory = typeof ctx.get === 'function' ? ctx.get('workingDirectory', false) : undefined
  const defaultDirectory = workingDirectory
    && typeof workingDirectory.defaultDirectory === 'string'
    && workingDirectory.defaultDirectory
    ? workingDirectory.defaultDirectory
    : process.cwd()

  const rootManager = createRootManager(config, defaultDirectory)

  const excludedDirs = new Set(DEFAULT_EXCLUDED_DIRS)
  for (const extra of asStringArray(config && config.excludeDirs)) {
    excludedDirs.add(extra.toLowerCase())
  }

  const handler = createHttpHandler({ rootManager, excludedDirs, logger })

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: ROUTE_PREFIX,
    handler,
  }), 'html-gallery: web routes')

  rootManager.refresh()
    .then((roots) => {
      try {
        logger.info(`[html-gallery] 扫描目录：${roots.map((root) => root.dir).join(' | ') || '(空)'}`)
        logger.info(`[html-gallery] 额外目录登记：${rootManager.extraFile}`)
      } catch {
        /* 某些 logger 不接受 info */
      }
    })
    .catch((error) => {
      if (logger) logger.warn(`[html-gallery] 初始化扫描目录失败：${(error && error.message) || error}`)
    })
}
