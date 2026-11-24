/**
 * Host half of the DSH desktop pet.
 *
 * Serves the swappable artwork under `/dsh-bat-think/*` from the package's own
 * `assets/` directory, so the client half can load PNG frames as plain images
 * and the owner can replace them without rebuilding anything.
 */
import { readdir, readFile } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'dsh-bat-think'
export const inject = ['webServer']

const ROUTE = '/dsh-bat-think'
const ASSET_ROOT = resolve(fileURLToPath(new URL('./assets/', import.meta.url)))

const MIME = Object.freeze({
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
})

function finish(res, status, headers = {}) {
  res.writeHead(status, { 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff', ...headers })
  res.end()
}

function sendJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8')
  res.writeHead(status, {
    'cache-control': 'no-cache',
    'content-length': String(body.byteLength),
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
  })
  res.end(body)
}

/**
 * Platform wallet balance through the Host's DeepSeek account service.
 * Returns `{ ok: false, reason }` when the deployment has no account service or
 * nobody is signed in, so the client can simply hide the row.
 */
async function readBalance(ctx, locale) {
  try {
    const account = typeof ctx.get === 'function' ? ctx.get('deepseekAccount') : ctx.deepseekAccount
    if (!account || typeof account.getBalance !== 'function') return { ok: false, reason: 'no-account' }
    const client = {
      version: '1.0.4',
      locale: typeof locale === 'string' && locale.length > 0 ? locale : 'zh-CN',
      timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
    }
    const result = await account.getBalance(client)
    if (!result) return { ok: false, reason: 'signed-out' }
    if (result.status !== 'ready' || !Array.isArray(result.value)) return { ok: false, reason: 'unavailable' }
    return { ok: true, wallets: result.value, bonusWallets: Array.isArray(result.bonusWallets) ? result.bonusWallets : [] }
  } catch {
    return { ok: false, reason: 'error' }
  }
}

async function serveAsset(req, res, ctx) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    finish(res, 405, { allow: 'GET, HEAD' })
    return
  }

  let pathname
  try {
    pathname = decodeURIComponent(new URL(req.url ?? ROUTE, 'http://dsh.local').pathname)
  } catch {
    finish(res, 400)
    return
  }

  const suffix = pathname === ROUTE || pathname === `${ROUTE}/` ? 'pet.json' : pathname.slice(ROUTE.length + 1)

  if (suffix === 'balance.json') {
    const locale = new URL(req.url ?? ROUTE, 'http://dsh.local').searchParams.get('locale') || ''
    sendJson(res, 200, await readBalance(ctx, locale))
    return
  }

  // Live listing of the accessory folder: dropping a PNG in is enough, no manifest.
  if (suffix === 'accessories/index.json') {
    let files = []
    try {
      // One level deep: accessories/helmet/*.png and accessories/bare/*.png.
      // The folder name is the variant the sticker belongs to.
      const root = resolve(ASSET_ROOT, 'accessories')
      const image = /\.(png|webp|gif|svg)$/i
      const entries = await readdir(root, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isFile() && image.test(entry.name)) {
          files.push(entry.name)
          continue
        }
        if (!entry.isDirectory()) continue
        const nested = await readdir(resolve(root, entry.name), { withFileTypes: true })
        for (const child of nested) {
          if (child.isFile() && image.test(child.name)) files.push(`${entry.name}/${child.name}`)
        }
      }
      files.sort((left, right) => left.localeCompare(right))
    } catch {
      files = []
    }
    const body = Buffer.from(JSON.stringify({ files }), 'utf8')
    res.writeHead(200, {
      'cache-control': 'no-cache',
      'content-length': String(body.byteLength),
      'content-type': 'application/json; charset=utf-8',
      'x-content-type-options': 'nosniff',
    })
    res.end(req.method === 'HEAD' ? undefined : body)
    return
  }
  const target = resolve(ASSET_ROOT, suffix)
  if (target !== ASSET_ROOT && !target.startsWith(`${ASSET_ROOT}${sep}`)) {
    finish(res, 403)
    return
  }

  try {
    const body = await readFile(target)
    res.writeHead(200, {
      // No cache: replacing a PNG must show up on the next refresh.
      'cache-control': 'no-cache',
      'content-length': String(body.byteLength),
      'content-type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream',
      'x-content-type-options': 'nosniff',
    })
    res.end(req.method === 'HEAD' ? undefined : body)
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'EISDIR')) {
      finish(res, 404)
      return
    }
    throw error
  }
}

export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: ROUTE,
    handler: (req, res) => serveAsset(req, res, ctx),
  }), 'dsh-bat-think: artwork route')
}
