import http from 'node:http'
import os from 'node:os'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { apply } from '../lib/index.js'

const baseDir = path.join(os.tmpdir(), 'dsh-html-gallery-workspace-test')
const home = path.join(baseDir, 'home')
const configRoot = path.join(baseDir, 'config-root')
const wsA = path.join(baseDir, 'workspace-a')
const wsB = path.join(baseDir, 'workspace-b')
const wsC = path.join(baseDir, 'workspace-c')

await fsp.rm(baseDir, { recursive: true, force: true })
for (const dir of [home, configRoot, wsA, wsB, wsC]) await fsp.mkdir(dir, { recursive: true })
await fsp.writeFile(path.join(configRoot, '配置页.html'), '<!doctype html><title>配置页</title>', 'utf8')
await fsp.writeFile(path.join(wsA, '备课页.html'), '<!doctype html><title>备课页</title>', 'utf8')
await fsp.writeFile(path.join(wsB, '跨盘页.html'), '<!doctype html><title>跨盘页</title>', 'utf8')
await fsp.writeFile(path.join(wsC, '新工作区.html'), '<!doctype html><title>新工作区</title>', 'utf8')

const storeDir = path.join(home, 'storages')
await fsp.mkdir(storeDir, { recursive: true })
const storeFile = path.join(storeDir, 'workspace.json')
async function writeWorkspaces(entries) {
  const table = {}
  for (const [index, entry] of entries.entries()) {
    table['ws' + index] = { path: entry.path, title: entry.title, sessionIds: [], createdAt: 1, updatedAt: 1 }
  }
  await fsp.writeFile(storeFile, JSON.stringify({
    tables: { workspaces: table },
    global: { workspaceIds: Object.keys(table) },
  }, null, 2), 'utf8')
}
await writeWorkspaces([
  { path: wsA, title: '备课区' },
  { path: wsB, title: '跨盘工作区' },
])

process.env.DSH_HOME = home

let route = null
const logger = { info: () => {}, warn: (...args) => console.log('[warn]', ...args) }
const ctx = {
  logger: () => logger,
  get: (name) => (name === 'workingDirectory' ? { defaultDirectory: configRoot } : undefined),
  effect: (fn) => { fn() },
  webServer: { register: (registered) => { route = registered; return () => {} } },
}

apply(ctx, { roots: [configRoot], extraRootsFile: path.join(baseDir, 'extra-roots.json') })
const server = http.createServer((req, res) => route.handler(req, res))
server.listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${server.address().port}`
  let failed = 0
  const check = (label, ok, detail) => {
    console.log((ok ? 'PASS' : 'FAIL') + ' ' + label + (detail ? ' — ' + detail : ''))
    if (!ok) failed += 1
  }

  try {
    let snap = await fetch(base + '/api/dsh-html-gallery/snapshot?refresh=1').then((r) => r.json())
    check('auto workspaces discovered', snap.roots.length === 3, JSON.stringify(snap.roots.map((r) => [r.label, r.kind])))
    check('all workspace pages found', snap.total === 3, String(snap.total))
    check('workspace root labels', snap.roots.some((r) => r.label === '备课区') && snap.roots.some((r) => r.label === '跨盘工作区'))
    check('workspace html visible', snap.categories.some((c) => c.items.some((i) => i.name === '跨盘页.html')))

    await writeWorkspaces([
      { path: wsA, title: '备课区' },
      { path: wsB, title: '跨盘工作区' },
      { path: wsC, title: '新工作区' },
    ])
    snap = await fetch(base + '/api/dsh-html-gallery/snapshot?refresh=1').then((r) => r.json())
    check('new workspace picked up', snap.roots.length === 4 && snap.total === 4, JSON.stringify(snap.roots.map((r) => r.label)))

    await writeWorkspaces([{ path: wsA, title: '备课区' }])
    snap = await fetch(base + '/api/dsh-html-gallery/snapshot?refresh=1').then((r) => r.json())
    check('removed workspace dropped', snap.roots.length === 2 && snap.total === 2, JSON.stringify(snap.roots.map((r) => r.label)))

    const extraDir = path.join(baseDir, 'extra-root')
    await fsp.mkdir(extraDir, { recursive: true })
    await fsp.writeFile(path.join(extraDir, '外部目录页.html'), '<!doctype html><title>外部目录页</title>', 'utf8')
    let result = await fetch(base + '/api/dsh-html-gallery/roots/add', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: extraDir }),
    }).then(async (res) => ({ status: res.status, data: await res.json() }))
    check('extra root added', result.status === 200 && result.data.added === true, String(result.status))
    check('extra root scanned', result.data.snapshot.total === 3 && result.data.snapshot.roots.length === 3)

    result = await fetch(base + '/api/dsh-html-gallery/roots/remove', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rootId: result.data.root.id }),
    }).then(async (res) => ({ status: res.status, data: await res.json() }))
    check('extra root removed', result.status === 200 && result.data.snapshot.total === 2 && result.data.snapshot.roots.length === 2)
  } catch (error) {
    console.error('TEST ERROR', error)
    failed += 1
  } finally {
    server.close()
    await fsp.rm(baseDir, { recursive: true, force: true })
    console.log(failed === 0 ? 'ALL PASS' : failed + ' FAILED')
    process.exitCode = failed === 0 ? 0 : 1
  }
})
