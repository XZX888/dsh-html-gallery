import http from 'node:http'
import os from 'node:os'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { apply } from '../lib/index.js'

const root = path.join(os.tmpdir(), 'dsh-html-gallery-category-test')
await fsp.rm(root, { recursive: true, force: true })
await fsp.mkdir(root, { recursive: true })
await fsp.writeFile(path.join(root, '首页.html'), '<!doctype html><title>测试首页</title><h1>hi</h1>', 'utf8')

let route = null
const logger = { info: () => {}, warn: (...args) => console.log('[warn]', ...args) }
const ctx = {
  logger: () => logger,
  get: (name) => (name === 'workingDirectory' ? { defaultDirectory: root } : undefined),
  effect: (fn) => { fn() },
  webServer: { register: (registered) => { route = registered; return () => {} } },
}

apply(ctx, { roots: [root], autoWorkspaces: false, extraRootsFile: path.join(root, '.extra-roots.json') })
const server = http.createServer((req, res) => route.handler(req, res))
server.listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${server.address().port}`
  const post = (routePath, body) => fetch(base + routePath, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then(async (res) => ({ status: res.status, data: await res.json() }))
  let failed = 0
  const check = (label, ok, detail) => {
    console.log((ok ? 'PASS' : 'FAIL') + ' ' + label + (detail ? ' — ' + detail : ''))
    if (!ok) failed += 1
  }

  try {
    let snap = await fetch(base + '/api/dsh-html-gallery/snapshot').then((r) => r.json())
    check('initial snapshot', snap.total === 1 && snap.categories.length === 1, JSON.stringify(snap.categories.map((c) => c.name)))

    let result = await post('/api/dsh-html-gallery/categories/create', { name: '测试分类' })
    check('create category status', result.status === 200, String(result.status))
    check('create category folder', fs.existsSync(path.join(root, '测试分类')))
    check('create category in snapshot', result.data.snapshot.categories.some((c) => c.topFolder === '测试分类' && c.count === 0))

    result = await post('/api/dsh-html-gallery/categories/create', { name: '测试分类' })
    check('duplicate create rejected', result.status === 409, String(result.status))

    result = await post('/api/dsh-html-gallery/categories/create', { name: '..\\坏' })
    check('invalid name rejected', result.status === 400, String(result.status))

    result = await post('/api/dsh-html-gallery/categories/rename', { from: '测试分类', to: '改好的分类' })
    check('rename status', result.status === 200, String(result.status))
    check('rename moved folder', !fs.existsSync(path.join(root, '测试分类')) && fs.existsSync(path.join(root, '改好的分类')))
    check('rename in snapshot', result.data.snapshot.categories.some((c) => c.topFolder === '改好的分类'))

    result = await post('/api/dsh-html-gallery/categories/rename', { from: '不存在的分类', to: '随便' })
    check('rename missing rejected', result.status === 404, String(result.status))

    await fsp.mkdir(path.join(root, '另一个'))
    result = await post('/api/dsh-html-gallery/categories/rename', { from: '改好的分类', to: '另一个' })
    check('rename collision rejected', result.status === 409, String(result.status))

    await fsp.writeFile(path.join(root, '改好的分类', '页面.html'), '<!doctype html><title>分类里的页面</title>', 'utf8')
    snap = await fetch(base + '/api/dsh-html-gallery/snapshot?refresh=1').then((r) => r.json())
    const movedCat = snap.categories.find((c) => c.topFolder === '改好的分类')
    check('page appears in renamed category', !!movedCat && movedCat.count === 1, movedCat && movedCat.items[0] && movedCat.items[0].path)

    const getResult = await fetch(base + '/api/dsh-html-gallery/categories/create')
    check('GET mutation rejected', getResult.status === 405, String(getResult.status))

    const registry = JSON.parse(await fsp.readFile(path.join(root, '.dsh-html-gallery', 'categories.json'), 'utf8'))
    check('registry updated', registry.categories.includes('改好的分类') && !registry.categories.includes('测试分类'), JSON.stringify(registry.categories))

    const rootId = snap.roots[0].id
    result = await post('/api/dsh-html-gallery/delete', { kind: 'file', rootId, path: '改好的分类/页面.html' })
    check('delete file status', result.status === 200, String(result.status))
    check('delete file removed', !fs.existsSync(path.join(root, '改好的分类', '页面.html')))
    check('delete file trash', fs.existsSync(path.join(root, '.dsh-html-gallery', 'trash'))
      && fs.readdirSync(path.join(root, '.dsh-html-gallery', 'trash')).length > 0)
    check('delete file snapshot', result.data.snapshot.categories.find((c) => c.topFolder === '改好的分类').count === 0)

    result = await post('/api/dsh-html-gallery/delete', { kind: 'file', rootId, path: '../逃出去.html' })
    check('delete traversal rejected', result.status === 400, String(result.status))

    await fsp.writeFile(path.join(root, '说明.txt'), 'not html', 'utf8')
    result = await post('/api/dsh-html-gallery/delete', { kind: 'file', rootId, path: '说明.txt' })
    check('delete non-html rejected', result.status === 400, String(result.status))

    await fsp.writeFile(path.join(root, '改好的分类', '第二版.html'), '<!doctype html><title>第二版</title>', 'utf8')
    result = await post('/api/dsh-html-gallery/delete', { kind: 'category', rootId, name: '改好的分类' })
    check('delete category status', result.status === 200, String(result.status))
    check('delete category moved', !fs.existsSync(path.join(root, '改好的分类')))
    const registryAfterDelete = JSON.parse(await fsp.readFile(path.join(root, '.dsh-html-gallery', 'categories.json'), 'utf8'))
    check('delete category registry', !registryAfterDelete.categories.includes('改好的分类'), JSON.stringify(registryAfterDelete.categories))

    result = await post('/api/dsh-html-gallery/delete', { kind: 'category', rootId, name: '根目录' })
    check('delete root category rejected', result.status === 400, String(result.status))

    const extraRoot = root + '-extra'
    await fsp.rm(extraRoot, { recursive: true, force: true })
    await fsp.mkdir(extraRoot, { recursive: true })
    await fsp.writeFile(path.join(extraRoot, '外部页面.html'), '<!doctype html><title>外部</title>', 'utf8')
    result = await post('/api/dsh-html-gallery/roots/add', { path: extraRoot })
    check('add extra root status', result.status === 200, String(result.status))
    check('add extra root appears', result.data.snapshot.roots.length === 2 && result.data.snapshot.total === 2,
      JSON.stringify(result.data.snapshot.roots.map((r) => r.path)))
    const extraId = result.data.root && result.data.root.id
    result = await post('/api/dsh-html-gallery/roots/remove', { rootId: extraId })
    check('remove extra root status', result.status === 200, String(result.status))
    check('remove extra root gone', result.data.snapshot.roots.length === 1 && result.data.snapshot.total === 1)
    await fsp.rm(extraRoot, { recursive: true, force: true })
  } catch (error) {
    console.error('TEST ERROR', error)
    failed += 1
  } finally {
    server.close()
    await fsp.rm(root, { recursive: true, force: true })
    await fsp.rm(root + '-extra', { recursive: true, force: true })
    console.log(failed === 0 ? 'ALL PASS' : failed + ' FAILED')
    process.exitCode = failed === 0 ? 0 : 1
  }
})
