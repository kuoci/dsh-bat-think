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

async function serveAsset(req, res) {
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

  // Live listing of the accessory folder: dropping a PNG in is enough, no manifest.
  if (suffix === 'accessories/index.json') {
    let files = []
    try {
      const entries = await readdir(resolve(ASSET_ROOT, 'accessories'), { withFileTypes: true })
      files = entries
        .filter((entry) => entry.isFile() && /\.(png|webp|gif|svg)$/i.test(entry.name))
        .map((entry) => entry.name)
        .sort((left, right) => left.localeCompare(right))
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
    handler: serveAsset,
  }), 'dsh-bat-think: artwork route')
}
