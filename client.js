/**
 * Client half of the DSH desktop pet.
 *
 * Renders one entry into the frame-wide `shell.overlay` seat: a draggable pet
 * that breathes, answers clicks, and swaps to its `thinking` frame with a
 * bouncing three-dot bubble while an Agent is running. Every picture comes from
 * `/dsh-bat-think/<file>` (served by index.js out of `assets/`), so replacing the
 * PNGs is all that is needed to change how the pet looks.
 */
window.__ModuleLoader__.load({
  id: 'dsh-bat-think',
  factory(require) {
    'use strict'

    const React = require('react')
    const { useEffect, useMemo, useRef, useState } = React
    const h = React.createElement

    const ROUTE = '/dsh-bat-think'
    const KEY_POS = 'dsh-bat-think:position'
    const KEY_SIZE = 'dsh-bat-think:size'
    const KEY_COLLAPSED = 'dsh-bat-think:collapsed'
    const KEY_GREETED = 'dsh-bat-think:greeted'
    const KEY_ACCESSORY = 'dsh-bat-think:accessory'
    const KEY_VARIANT = 'dsh-bat-think:variant'
    const BUILD = '1.0.1'
    const KEY_CANVAS_WIDTH = 'dsh-bat-think:canvas-width'
    const MIN_SIZE = 96
    const MAX_SIZE = 320
    const DEFAULT_SIZE = 168
    const DEFAULT_RATIO = 1.42
    const EDGE_RIGHT = 24
    const EDGE_BOTTOM = 16
    const THINK_PAUSE_MS = 3000
    const BUBBLE_MS = 3200

    /** Used until `pet.json` arrives, and as the fallback for missing sections. */
    const FALLBACK = {
      name: '蝙蝠侠',
      size: DEFAULT_SIZE,
      canvas: { width: 512, height: 512, crop: [92, 76, 316, 359] },
      hotspot: [148, 318, 214, 100],
      variants: {
        helmet: { idle: ['idle.png'], thinking: ['thinking.png'] },
        bare: {
          idle: ['idle-bare.png'],
          thinking: ['thinking-bare.png'],
          eyes: { open: 'eyes/open.png', half: 'eyes/half.png', closed: 'eyes/closed.png' },
        },
      },
      fps: { idle: 3 },
      sayings: ['阿尔弗雷德！', '正在归档……', '我要夜巡了'],
      thinkingAck: '稍等',
      accessories: { helmet: [], bare: [] },
    }

    // The pet watches the session list so the thought bubble follows the Agent.
    // The service may arrive after this plugin applies, so the store is attached
    // whenever it shows up and every mounted subscriber is re-read.
    const EMPTY_SESSIONS = Object.freeze({ ids: [], byId: {} })
    let bridgeTarget = null
    let bridgeDispose = null
    let modelDirectories = null
    const modelListeners = new Set()
    function setModelDirectories(next) {
      if (modelDirectories === next) return
      modelDirectories = next
      for (const listener of [...modelListeners]) listener(next)
    }
    const bridgeListeners = new Set()

    function bridgeEmit() {
      for (const listener of [...bridgeListeners]) listener()
    }

    function attachSessionList(list) {
      if (!list || typeof list.getSnapshot !== 'function' || bridgeTarget === list) return
      if (bridgeDispose) bridgeDispose()
      bridgeTarget = list
      bridgeDispose = typeof list.subscribe === 'function' ? list.subscribe(bridgeEmit) : null
      bridgeEmit()
    }

    function detachSessionList() {
      if (bridgeDispose) bridgeDispose()
      bridgeDispose = null
      bridgeTarget = null
      bridgeEmit()
    }

    function subscribeSessions(listener) {
      bridgeListeners.add(listener)
      return () => { bridgeListeners.delete(listener) }
    }

    function getSessionsSnapshot() {
      return bridgeTarget ? bridgeTarget.getSnapshot() : EMPTY_SESSIONS
    }

    const STYLE_ID = 'dsh-bat-think-style'
    const CSS = `
.dsh-bat-think-root {
  position: fixed;
  z-index: 70;
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: auto;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
  font-family: inherit;
}
.dsh-bat-think-body {
  position: relative;
  width: 100%;
  transform-origin: 50% 100%;
  animation: dsh-bat-think-breathe 4.5s ease-in-out infinite;
}
.dsh-bat-think-body.is-bump { animation: dsh-bat-think-hop 0.42s ease-in-out 3; }
.dsh-bat-think-img {
  display: block;
  width: 100%;
  height: auto;
  cursor: grab;
  filter: drop-shadow(0 10px 16px rgba(0, 0, 0, 0.18));
  -webkit-user-drag: none;
}
.dsh-bat-think-img:active { cursor: grabbing; }
.dsh-bat-think-eyes {
  position: absolute;
  pointer-events: none;
  -webkit-user-drag: none;
}
@keyframes dsh-bat-think-breathe {
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-3px) scale(1.02); }
}
@keyframes dsh-bat-think-hop {
  0%, 100% { transform: translateY(0) scale(1); }
  35% { transform: translateY(-16px) scale(1.03); }
  65% { transform: translateY(0) scale(0.985); }
}
@media (prefers-reduced-motion: reduce) {
  .dsh-bat-think-body, .dsh-bat-think-body.is-bump { animation: none; }
}
.dsh-bat-think-bubble {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 50%;
  --dsh-bat-think-shift: translateX(-50%);
  transform: var(--dsh-bat-think-shift);
  width: max-content;
  max-width: min(240px, calc(100vw - 24px));
  padding: 8px 12px;
  border-radius: 14px;
  background: var(--dsw-alias-bg-layer-2, #ffffff);
  color: var(--dsw-alias-label-primary, #1f2328);
  border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.08));
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
  font-size: 13px;
  line-height: 1.45;
  text-align: center;
  pointer-events: none;
  animation: dsh-bat-think-pop 0.18s ease-out;
}
.dsh-bat-think-bubble.is-left { left: 0; --dsh-bat-think-shift: none; }
.dsh-bat-think-bubble.is-right { left: auto; right: 0; --dsh-bat-think-shift: none; }
.dsh-bat-think-bubble.is-left::after { left: 26px; }
.dsh-bat-think-bubble.is-right::after { left: auto; right: 26px; }
.dsh-bat-think-bubble::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  width: 10px;
  height: 10px;
  margin-top: -5px;
  transform: translateX(-50%) rotate(45deg);
  background: var(--dsw-alias-bg-layer-2, #ffffff);
  border-right: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.08));
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.08));
}
.dsh-bat-think-think {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 50%;
  --dsh-bat-think-shift: translateX(-50%);
  transform: var(--dsh-bat-think-shift);
  width: max-content;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 15px;
  border-radius: 16px;
  background: var(--dsw-alias-bg-layer-2, #ffffff);
  border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.08));
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.14);
  pointer-events: none;
  animation: dsh-bat-think-pop 0.18s ease-out;
}
.dsh-bat-think-think.is-left { left: 0; --dsh-bat-think-shift: none; }
.dsh-bat-think-think.is-right { left: auto; right: 0; --dsh-bat-think-shift: none; }
.dsh-bat-think-think.is-left::after { left: 26px; }
.dsh-bat-think-think.is-right::after { left: auto; right: 26px; }
.dsh-bat-think-think::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  width: 9px;
  height: 9px;
  margin-top: -5px;
  transform: translateX(-50%) rotate(45deg);
  background: var(--dsw-alias-bg-layer-2, #ffffff);
  border-right: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.08));
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.08));
}
.dsh-bat-think-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--dsw-alias-label-tertiary, #8a94a6);
  animation: dsh-bat-think-dot-bounce 1.15s ease-in-out infinite;
}
.dsh-bat-think-dot:nth-child(2) { animation-delay: 0.16s; }
.dsh-bat-think-dot:nth-child(3) { animation-delay: 0.32s; }
@keyframes dsh-bat-think-dot-bounce {
  0%, 75%, 100% { opacity: 0.35; transform: translateY(0); }
  35% { opacity: 1; transform: translateY(-3px); }
}
@keyframes dsh-bat-think-pop {
  from { opacity: 0; transform: var(--dsh-bat-think-shift) translateY(4px); }
  to { opacity: 1; transform: var(--dsh-bat-think-shift) translateY(0); }
}
.dsh-bat-think-tools {
  position: absolute;
  top: -12px;
  right: -8px;
  display: flex;
  gap: 4px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
}
.dsh-bat-think-root:hover .dsh-bat-think-tools { opacity: 1; pointer-events: auto; }
.dsh-bat-think-tool {
  width: 22px;
  height: 22px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.1));
  background: var(--dsw-alias-bg-layer-2, #ffffff);
  color: var(--dsw-alias-label-secondary, #5b6470);
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
}
.dsh-bat-think-tool:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.06)); }
.dsh-bat-think-laptop {
  position: absolute;
  padding: 0;
  border: 0;
  border-radius: 12px;
  background: transparent;
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
}
.dsh-bat-think-laptop:hover { background: rgba(255, 255, 255, 0.14); }
.dsh-bat-think-usage {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  --dsh-bat-think-shift: translateX(-50%);
  transform: var(--dsh-bat-think-shift);
  width: 210px;
  max-width: min(240px, calc(100vw - 24px));
  padding: 10px 12px;
  border-radius: 14px;
  background: var(--dsw-alias-bg-layer-2, #ffffff);
  color: var(--dsw-alias-label-primary, #1f2328);
  border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.08));
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.16);
  font-size: 12px;
  line-height: 1.5;
  pointer-events: auto;
  animation: dsh-bat-think-pop 0.18s ease-out;
}
.dsh-bat-think-usage.is-left { left: 0; --dsh-bat-think-shift: none; }
.dsh-bat-think-usage.is-right { left: auto; right: 0; --dsh-bat-think-shift: none; }
.dsh-bat-think-usage-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
  font-weight: 600;
}
.dsh-bat-think-usage-close {
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--dsw-alias-label-tertiary, #8a94a6);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.dsh-bat-think-usage-close:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.06)); }
.dsh-bat-think-usage-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  color: var(--dsw-alias-label-secondary, #5b6470);
}
.dsh-bat-think-usage-row b {
  max-width: 132px;
  color: var(--dsw-alias-label-primary, #1f2328);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-bat-think-usage-sub {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 6px;
  color: var(--dsw-alias-label-tertiary, #8a94a6);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.dsh-bat-think-usage-bar {
  height: 4px;
  margin-top: 3px;
  border-radius: 2px;
  background: var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.08));
  overflow: hidden;
}
.dsh-bat-think-usage-bar i {
  display: block;
  height: 100%;
  border-radius: 2px;
  background: var(--dsw-alias-state-business-primary, #4d6bfe);
}
.dsh-bat-think-accessory {
  position: absolute;
  background-repeat: no-repeat;
  pointer-events: auto;
  cursor: grab;
}
.dsh-bat-think-accessory:active { cursor: grabbing; }
.dsh-bat-think-accessory:hover { filter: drop-shadow(0 0 5px rgba(255, 255, 255, 0.5)); }
.dsh-bat-think-chip {
  position: fixed;
  z-index: 70;
  width: 40px;
  height: 40px;
  padding: 0;
  overflow: hidden;
  border-radius: 50%;
  border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.1));
  background: var(--dsw-alias-bg-layer-2, #ffffff);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.16);
  cursor: pointer;
  pointer-events: auto;
  display: flex;
  align-items: center;
  justify-content: center;
}
.dsh-bat-think-chip img { width: 40px; height: 40px; object-fit: cover; object-position: 50% 12%; pointer-events: none; }
.dsh-bat-think-chip:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.06)); }
`

    function installStyle() {
      if (document.getElementById(STYLE_ID)) return () => {}
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = CSS
      document.head.appendChild(style)
      return () => style.remove()
    }

    function readNumber(key, fallback) {
      try {
        const value = Number(localStorage.getItem(key))
        return Number.isFinite(value) && value > 0 ? value : fallback
      } catch {
        return fallback
      }
    }

    function readPosition() {
      try {
        const raw = localStorage.getItem(KEY_POS)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        if (!parsed || !Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return null
        return { x: parsed.x, y: parsed.y }
      } catch {
        return null
      }
    }

    function writeSetting(key, value) {
      try {
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value))
      } catch {
        // Private mode or a locked-down storage keeps the value for this page only.
      }
    }

    function accessoryUrl(file) {
      return `${ROUTE}/accessories/${String(file).split('/').map(encodeURIComponent).join('/')}`
    }

    function readAccessory() {
      try {
        const raw = localStorage.getItem(KEY_ACCESSORY)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        if (!parsed || typeof parsed.file !== 'string' || parsed.file === '') return null
        return {
          file: parsed.file,
          dx: Number.isFinite(parsed.dx) ? parsed.dx : 0,
          dy: Number.isFinite(parsed.dy) ? parsed.dy : 0,
          scale: Number.isFinite(parsed.scale) && parsed.scale > 0 ? parsed.scale : 1,
        }
      } catch {
        return null
      }
    }

    function writeAccessory(value) {
      try {
        if (value) localStorage.setItem(KEY_ACCESSORY, JSON.stringify(value))
        else localStorage.removeItem(KEY_ACCESSORY)
      } catch {}
    }

    function clampSize(value) {
      const size = Number(value)
      if (!Number.isFinite(size) || size <= 0) return DEFAULT_SIZE
      return Math.max(MIN_SIZE, Math.min(MAX_SIZE, size))
    }

    function clampPosition(x, y, width, height) {
      const viewportWidth = window.innerWidth || 1024
      const viewportHeight = window.innerHeight || 768
      // Keep the pet mostly on screen while allowing it to sit against an edge.
      const minX = -width * 0.15
      const maxX = viewportWidth - width * 0.85
      const minY = 0
      const maxY = viewportHeight - height * 0.55
      return {
        x: Math.min(Math.max(x, minX), Math.max(minX, maxX)),
        y: Math.min(Math.max(y, minY), Math.max(minY, maxY)),
      }
    }

    function formatCount(value) {
      return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('en-US') : '—'
    }

    /** The Session the main view is showing, following both snapshot spellings. */
    function mainSessionIdOf(snapshot) {
      if (!snapshot || typeof snapshot !== 'object') return undefined
      if (typeof snapshot.current === 'string' && snapshot.current !== '') return snapshot.current
      const byId = snapshot.byId
      if (!byId || typeof byId !== 'object') return undefined
      for (const row of Object.values(byId)) {
        if (!row || typeof row !== 'object') continue
        const held = row.retainedBy && row.retainedBy.mainView
        if (typeof held === 'number' && held > 0) return row.id
      }
      return undefined
    }

    function mergeManifest(base, extra) {
      const variants = { ...(base.variants || {}) }
      for (const [name, definition] of Object.entries(extra.variants || {})) {
        variants[name] = { ...(variants[name] || {}), ...definition }
      }
      const accessories = extra.accessories && !Array.isArray(extra.accessories)
        ? { ...(base.accessories || {}), ...extra.accessories }
        : (base.accessories || { helmet: [], bare: [] })
      return {
        ...base,
        ...extra,
        variants,
        accessories,
        fps: { ...(base.fps || {}), ...(extra.fps || {}) },
        sayings: Array.isArray(extra.sayings) && extra.sayings.length > 0
          ? extra.sayings.map(String)
          : base.sayings,
      }
    }

    function readVariant() {
      try {
        return localStorage.getItem(KEY_VARIANT) === 'bare' ? 'bare' : 'helmet'
      } catch {
        return 'helmet'
      }
    }

    function Pet() {
      // A single line in the browser console makes a missing registration obvious.
      useEffect(() => { console.info('[dsh-bat-think] mounted at shell.overlay') }, [])

      const [manifest, setManifest] = useState(FALLBACK)
      const [bubble, setBubble] = useState('')
      const [variant, setVariant] = useState(readVariant)
      const [eyeFrame, setEyeFrame] = useState('open')
      const [position, setPosition] = useState(null)
      const [size, setSize] = useState(() => clampSize(readNumber(KEY_SIZE, DEFAULT_SIZE)))
      const [ratio, setRatio] = useState(DEFAULT_RATIO)
      const [collapsed, setCollapsed] = useState(() => {
        try { return localStorage.getItem(KEY_COLLAPSED) === '1' } catch { return false }
      })
      const [missing, setMissing] = useState(false)
      const [loadAttempt, setLoadAttempt] = useState(0)
      const [failedFile, setFailedFile] = useState('')
      const [frame, setFrame] = useState(0)
      const [bump, setBump] = useState(false)
      const [thinkPaused, setThinkPaused] = useState(false)
      const [usageOpen, setUsageOpen] = useState(false)
      const [accessory, setAccessory] = useState(readAccessory)
      const [accessoryList, setAccessoryList] = useState([])
      const [accMeta, setAccMeta] = useState(null)

      const sessionState = React.useSyncExternalStore(subscribeSessions, getSessionsSnapshot)
      const thinking = useMemo(() => {
        const ids = sessionState && sessionState.ids
        const byId = sessionState && sessionState.byId
        if (!Array.isArray(ids) || !byId) return false
        return ids.some((id) => byId[id] && byId[id].running === true)
      }, [sessionState])

      const mainSessionId = useMemo(() => {
        const shown = mainSessionIdOf(sessionState)
        if (shown) return shown
        const ids = sessionState && sessionState.ids
        return Array.isArray(ids) && ids.length > 0 ? ids[0] : undefined
      }, [sessionState])
      const projectionValues = useMemo(() => {
        const row = mainSessionId && sessionState && sessionState.byId ? sessionState.byId[mainSessionId] : undefined
        const block = mainSessionId && sessionState && sessionState.projectionsBySession
          ? sessionState.projectionsBySession[mainSessionId]
          : undefined
        const rowValues = row && row.projectionValues
        const blockValues = block && block.values
        if (!rowValues && !blockValues) return null
        // The list row and the per-session block carry the same projection
        // values; merge them so whichever arrives first is usable.
        return { ...(blockValues || {}), ...(rowValues || {}) }
      }, [sessionState, mainSessionId])
      const usage = projectionValues && projectionValues.tokenUsage
      const pressure = projectionValues && projectionValues.contextPressure
      const usedTokens = pressure ? (pressure.projectedTokens ?? pressure.pressureTokens) : undefined
      const windowTokens = pressure ? pressure.contextWindow : undefined
      const contextPercent = typeof usedTokens === 'number' && typeof windowTokens === 'number' && windowTokens > 0
        ? Math.min(100, Math.round((usedTokens / windowTokens) * 100))
        : null
      const hasUsage = Boolean(usage || pressure)
      const totals = useMemo(() => {
        const byId = (sessionState && sessionState.byId) || {}
        const sum = {
          sessions: 0,
          uncachedInputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        }
        for (const row of Object.values(byId)) {
          const value = row && row.projectionValues && row.projectionValues.tokenUsage
          if (!value) continue
          sum.sessions += 1
          sum.uncachedInputTokens += Number(value.uncachedInputTokens) || 0
          sum.outputTokens += Number(value.outputTokens) || 0
          sum.cacheReadTokens += Number(value.cacheReadTokens) || 0
          sum.cacheWriteTokens += Number(value.cacheWriteTokens) || 0
        }
        return sum
      }, [sessionState])
      const [modelService, setModelService] = useState(modelDirectories)
      useEffect(() => {
        const listener = (next) => setModelService(next)
        modelListeners.add(listener)
        setModelService(modelDirectories)
        return () => { modelListeners.delete(listener) }
      }, [])
      const [modelLabel, setModelLabel] = useState('')
      useEffect(() => {
        setModelLabel('')
        if (!mainSessionId || !modelService) return undefined
        let directory
        try {
          directory = modelService.directoryFor(mainSessionId)
        } catch {
          return undefined
        }
        const read = () => {
          try {
            const snapshot = directory.store.getSnapshot()
            const current = snapshot && snapshot.current
            if (!current) return ''
            const groups = snapshot.groups || []
            const group = groups.find((candidate) => candidate && candidate.id === current.provider)
            const model = group && (group.models || []).find((candidate) => candidate && candidate.id === current.model)
            return (model && model.name) || current.model || ''
          } catch {
            return ''
          }
        }
        setModelLabel(read())
        const dispose = directory.store.subscribe(() => setModelLabel(read()))
        return () => { try { dispose() } catch {} }
      }, [mainSessionId, modelService])

      const variantAccessories = useMemo(() => {
        const prefix = `${variant}/`
        const fromIndex = accessoryList.filter((file) => String(file).startsWith(prefix))
        if (fromIndex.length > 0) return fromIndex
        const map = manifest.accessories && !Array.isArray(manifest.accessories) ? manifest.accessories : {}
        return Array.isArray(map[variant]) ? map[variant].map(String) : []
      }, [accessoryList, manifest, variant])

      // Accessories are discovered from the folder; `pet.json` lists the same
      // names as a fallback for a Host that has not reloaded yet.
      useEffect(() => {
        let cancelled = false
        fetch(`${ROUTE}/accessories/index.json`, { cache: 'no-cache' })
          .then((response) => (response.ok ? response.json() : null))
          .then((json) => {
            if (cancelled || !json || !Array.isArray(json.files) || json.files.length === 0) return
            setAccessoryList(json.files.map(String))
          })
          .catch(() => {})
        return () => { cancelled = true }
      }, [])

      useEffect(() => {
        if (variantAccessories.length === 0) return
        setAccessory((current) => {
          if (!current || variantAccessories.includes(current.file)) return current
          writeAccessory(null)
          return null
        })
      }, [variantAccessories])

      // Bounding box and alpha mask of the current accessory, for placement and
      // for "click the pixels, not the box" removal.
      useEffect(() => {
        const file = accessory ? accessory.file : ''
        setAccMeta(null)
        if (!file) return undefined
        let cancelled = false
        const image = new Image()
        image.onload = () => {
          if (cancelled) return
          const width = image.naturalWidth
          const height = image.naturalHeight
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const context = canvas.getContext('2d')
          if (!context) return
          context.drawImage(image, 0, 0)
          let data = null
          let box = { x: 0, y: 0, w: width, h: height }
          try {
            data = context.getImageData(0, 0, width, height)
            let minX = width
            let minY = height
            let maxX = -1
            let maxY = -1
            for (let y = 0; y < height; y += 1) {
              for (let x = 0; x < width; x += 1) {
                if (data.data[(y * width + x) * 4 + 3] > 8) {
                  if (x < minX) minX = x
                  if (y < minY) minY = y
                  if (x > maxX) maxX = x
                  if (y > maxY) maxY = y
                }
              }
            }
            if (maxX >= minX) box = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
          } catch {
            data = null
          }
          setAccMeta({ width, height, box, data })
        }
        image.onerror = () => { if (!cancelled) setAccMeta(null) }
        image.src = accessoryUrl(file)
        return () => { cancelled = true; image.onload = null; image.onerror = null }
      }, [accessory && accessory.file])

      const dragRef = useRef(null)
      const alive = useRef(true)
      const bubbleTimer = useRef(0)
      const bumpTimer = useRef(0)
      const thinkTimer = useRef(0)

      useEffect(() => {
        alive.current = true
        return () => { alive.current = false }
      }, [])

      // Artwork manifest: the client keeps working with the fallback if it fails.
      useEffect(() => {
        let cancelled = false
        fetch(`${ROUTE}/pet.json`, { cache: 'no-cache' })
          .then((response) => (response.ok ? response.json() : null))
          .then((json) => {
            if (cancelled || !json) return
            const merged = mergeManifest(FALLBACK, json)
            setManifest(merged)
            const cropWidth = merged.canvas && Array.isArray(merged.canvas.crop) ? Number(merged.canvas.crop[2]) : 0
            let stored = 0
            try { stored = Number(localStorage.getItem(KEY_SIZE)) } catch {}
            if (!Number.isFinite(stored) || stored <= 0) {
              setSize(clampSize(json.size))
            } else if (cropWidth > 0) {
              // The shared canvas got wider when the bare variant arrived: scale
              // the saved size once so the pet keeps its on-screen size.
              let previousWidth = readNumber(KEY_CANVAS_WIDTH, 0)
              if (!previousWidth && stored > 0) previousWidth = 247
              if (previousWidth > 0 && Math.abs(previousWidth - cropWidth) > 1) {
                setSize((current) => clampSize(Math.round(current * (cropWidth / previousWidth))))
              }
            }
            if (cropWidth > 0) writeSetting(KEY_CANVAS_WIDTH, String(cropWidth))
          })
          .catch((error) => console.warn('[dsh-bat-think] pet.json could not be loaded', error))
        return () => { cancelled = true }
      }, [])

      // First position: the saved one, otherwise bottom-right above the composer.
      useEffect(() => {
        const started = readPosition()
        const width = clampSize(readNumber(KEY_SIZE, DEFAULT_SIZE))
        const start = started ?? {
          x: (window.innerWidth || 1024) - width - EDGE_RIGHT,
          y: (window.innerHeight || 768) - width * DEFAULT_RATIO - EDGE_BOTTOM,
        }
        setPosition(clampPosition(start.x, start.y, width, width * DEFAULT_RATIO))
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])

      // Keep the pet inside the viewport when the window, the size or the
      // artwork's aspect ratio changes.
      useEffect(() => {
        setPosition((current) => (current ? clampPosition(current.x, current.y, size, size * ratio) : current))
      }, [ratio, size])

      useEffect(() => {
        const onResize = () => {
          setPosition((current) => (current ? clampPosition(current.x, current.y, size, size * ratio) : current))
        }
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
      }, [size, ratio])

      const frames = useMemo(() => {
        const definition = (manifest.variants && manifest.variants[variant]) || {}
        const list = thinking && Array.isArray(definition.thinking) && definition.thinking.length > 0
          ? definition.thinking
          : definition.idle
        return Array.isArray(list) && list.length > 0 ? list : ['idle.png']
      }, [manifest, thinking, variant])

      // Warm both frames so switching to the working picture does not flicker.
      useEffect(() => {
        const files = []
        for (const definition of Object.values(manifest.variants || {})) {
          files.push(...(definition.idle || []), ...(definition.thinking || []), ...Object.values(definition.eyes || {}))
        }
        for (const file of files) {
          const image = new Image()
          image.src = `${ROUTE}/${String(file).split('/').map(encodeURIComponent).join('/')}`
        }
      }, [manifest])

      useEffect(() => {
        setFrame(0)
        if (frames.length < 2) return undefined
        const fps = Number(manifest.fps && manifest.fps[thinking ? 'thinking' : 'idle']) || 4
        const timer = setInterval(() => {
          if (!alive.current) return
          setFrame((index) => (index + 1) % frames.length)
        }, Math.max(90, 1000 / fps))
        return () => clearInterval(timer)
      }, [frames, manifest, thinking])

      // Blink only in the bare-face variant: the eye layer steps open → half →
      // closed → half → open on a loose timer.
      useEffect(() => {
        if (variant !== 'bare') { setEyeFrame('open'); return undefined }
        const sequence = ['open', 'half', 'closed', 'half', 'open']
        let step = 0
        let timer = 0
        setEyeFrame('open')
        const tick = () => {
          step = (step + 1) % sequence.length
          if (alive.current) setEyeFrame(sequence[step])
          const wait = step === 0 ? 2800 + Math.random() * 3800 : 95
          timer = window.setTimeout(tick, wait)
        }
        timer = window.setTimeout(tick, 2800 + Math.random() * 3800)
        return () => window.clearTimeout(timer)
      }, [variant])

      const say = (text) => {
        if (!text) return
        setBubble(text)
        window.clearTimeout(bubbleTimer.current)
        bubbleTimer.current = window.setTimeout(() => {
          if (alive.current) setBubble('')
        }, BUBBLE_MS)
      }

      // Greet once per browser session.
      useEffect(() => {
        if (!position) return
        let greeted = ''
        try { greeted = sessionStorage.getItem(KEY_GREETED) || '' } catch { greeted = '1' }
        if (greeted === '1') return
        const timer = window.setTimeout(() => say('拖我换个位置，点我试试～'), 900)
        try { sessionStorage.setItem(KEY_GREETED, '1') } catch {}
        return () => window.clearTimeout(timer)
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [position])

      useEffect(() => () => {
        window.clearTimeout(bubbleTimer.current)
        window.clearTimeout(bumpTimer.current)
        window.clearTimeout(thinkTimer.current)
      }, [])

      const adjustSize = (delta) => {
        const next = clampSize(size + delta)
        setSize(next)
        writeSetting(KEY_SIZE, String(next))
      }

      const toggleCollapsed = (next) => {
        setCollapsed(next)
        try { localStorage.setItem(KEY_COLLAPSED, next ? '1' : '0') } catch {}
      }

      const stopTool = (event) => {
        event.stopPropagation()
        event.preventDefault()
      }

      // A press without movement is a click. While the Agent is running the
      // thought bubble gives way to a short "稍等", then comes back.
      const react = () => {
        if (usageOpen) setUsageOpen(false)
        setBump(true)
        window.clearTimeout(bumpTimer.current)
        bumpTimer.current = window.setTimeout(() => {
          if (alive.current) setBump(false)
        }, 1300)

        if (thinking) {
          setThinkPaused(true)
          window.clearTimeout(thinkTimer.current)
          thinkTimer.current = window.setTimeout(() => {
            if (alive.current) setThinkPaused(false)
          }, THINK_PAUSE_MS)
          say(manifest.thinkingAck || '稍等')
          return
        }

        const lines = manifest.sayings
        say(lines[Math.floor(Math.random() * lines.length)])
      }

      useEffect(() => {
        setMissing(false)
        setLoadAttempt(0)
      }, [variant])

      const toggleVariant = () => {
        const next = variant === 'bare' ? 'helmet' : 'bare'
        setVariant(next)
        try { localStorage.setItem(KEY_VARIANT, next) } catch {}
        setAccessory(null)
        writeAccessory(null)
        setBump(true)
        window.clearTimeout(bumpTimer.current)
        bumpTimer.current = window.setTimeout(() => {
          if (alive.current) setBump(false)
        }, 1300)
        say(next === 'bare' ? '摘下面罩' : '戴上面罩')
      }

      // Three quick clicks swap the helmet, so a single click waits briefly.
      const clickRef = useRef({ count: 0, last: 0, timer: 0 })
      const onPetClick = () => {
        const now = Date.now()
        const state = clickRef.current
        if (now - state.last > 700) state.count = 0
        state.last = now
        state.count += 1
        window.clearTimeout(state.timer)
        if (state.count >= 3) {
          state.count = 0
          toggleVariant()
          return
        }
        state.timer = window.setTimeout(() => {
          if (alive.current) react()
        }, 300)
      }

      const rollAccessory = () => {
        const list = variantAccessories
        if (list.length === 0) {
          say('还没有配件，把 PNG 放进 assets/accessories/ 就行')
          return
        }
        const pool = list.length > 1 && accessory ? list.filter((file) => file !== accessory.file) : list
        const file = pool[Math.floor(Math.random() * pool.length)] || list[0]
        const next = { file }
        setAccessory(next)
        writeAccessory(next)
        setBump(true)
        window.clearTimeout(bumpTimer.current)
        bumpTimer.current = window.setTimeout(() => {
          if (alive.current) setBump(false)
        }, 1300)
      }

      // Clicking the sticker's own pixels takes it off; its empty box pokes the pet.
      const onAccessoryClick = (event) => {
        event.stopPropagation()
        const rect = event.currentTarget.getBoundingClientRect()
        const meta = accMeta
        if (meta && meta.data && rect.width > 0 && rect.height > 0) {
          const x = Math.min(meta.width - 1, Math.max(0, Math.floor(meta.box.x + ((event.clientX - rect.left) / rect.width) * meta.box.w)))
          const y = Math.min(meta.height - 1, Math.max(0, Math.floor(meta.box.y + ((event.clientY - rect.top) / rect.height) * meta.box.h)))
          if (meta.data.data[(y * meta.width + x) * 4 + 3] < 24) {
            react()
            return
          }
        }
        setAccessory(null)
        writeAccessory(null)
      }

      const onPointerDown = (event) => {
        if (event.button !== 0 || !position) return
        event.preventDefault()
        event.currentTarget.setPointerCapture?.(event.pointerId)
        dragRef.current = {
          id: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          originX: position.x,
          originY: position.y,
          moved: false,
        }
      }

      const onPointerMove = (event) => {
        const drag = dragRef.current
        if (!drag || drag.id !== event.pointerId) return
        const dx = event.clientX - drag.startX
        const dy = event.clientY - drag.startY
        if (!drag.moved && Math.hypot(dx, dy) > 3) drag.moved = true
        if (drag.moved) setPosition(clampPosition(drag.originX + dx, drag.originY + dy, size, size * ratio))
      }

      const endDrag = (event) => {
        const drag = dragRef.current
        if (!drag || drag.id !== event.pointerId) return
        dragRef.current = null
        if (drag.moved) {
          setPosition((current) => {
            if (current) writeSetting(KEY_POS, current)
            return current
          })
        } else {
          onPetClick()
        }
      }

      if (!position) return null

      const boxHeight = Math.round(size * ratio)

      if (collapsed) {
        const chipLeft = Math.min(Math.max(8, position.x + size - 44), Math.max(8, (window.innerWidth || 1024) - 48))
        const chipTop = Math.min(Math.max(8, position.y + boxHeight - 44), Math.max(8, (window.innerHeight || 768) - 48))
        return h('button', {
          type: 'button',
          className: 'dsh-bat-think-chip',
          style: { left: `${chipLeft}px`, top: `${chipTop}px` },
          title: '叫出桌宠',
          'aria-label': '叫出桌宠',
          onClick: () => toggleCollapsed(false),
        }, h('img', { src: `${ROUTE}/idle.png`, alt: '', draggable: false }))
      }

      const current = frames[Math.min(frame, frames.length - 1)] || 'idle.png'
      const src = `${accessoryUrl(current)}?v=${BUILD}${loadAttempt > 0 ? `&retry=${loadAttempt}` : ''}`
      const showThink = thinking && !thinkPaused && !bubble && !usageOpen
      const centreX = position.x + size / 2
      const viewportWidth = window.innerWidth || 1024
      const bubbleEdge = centreX < 136 ? ' is-left' : centreX > viewportWidth - 136 ? ' is-right' : ''

      // Accessories sit on the same 512 canvas as the artwork: `canvas.crop`
      // records which part of that canvas the PNG crops, so a sticker lands
      // exactly where it was drawn.
      const canvasSpec = manifest.canvas && Array.isArray(manifest.canvas.crop) && manifest.canvas.crop.length === 4
        ? manifest.canvas
        : null
      const crop = canvasSpec ? canvasSpec.crop.map(Number) : [0, 0, 247, 353]
      const unit = size / (crop[2] || 1)
      const canvasWidth = canvasSpec ? Number(canvasSpec.width) || 512 : 512
      const canvasHeight = canvasSpec ? Number(canvasSpec.height) || 512 : 512

      const eyes = variant === 'bare' && manifest.variants && manifest.variants.bare
        ? manifest.variants.bare.eyes
        : null
      const eyeFile = eyes ? (eyes[eyeFrame] || eyes.open || '') : ''
      const eyesLayer = !missing && eyeFile
        ? h('img', {
            className: 'dsh-bat-think-eyes',
            src: accessoryUrl(eyeFile),
            alt: '',
            draggable: false,
            style: {
              left: `${-crop[0] * unit}px`,
              top: `${-crop[1] * unit}px`,
              width: `${canvasWidth * unit}px`,
              height: `${canvasHeight * unit}px`,
            },
          })
        : null

      const hotspotPixels = Array.isArray(manifest.hotspot) && manifest.hotspot.length === 4 ? manifest.hotspot.map(Number) : null
      const hotspotStyle = hotspotPixels
        ? {
            left: `${(hotspotPixels[0] - crop[0]) * unit}px`,
            top: `${(hotspotPixels[1] - crop[1]) * unit}px`,
            width: `${hotspotPixels[2] * unit}px`,
            height: `${hotspotPixels[3] * unit}px`,
          }
        : { left: '8%', top: '69%', width: '52%', height: '30%' }

      const accessoryLayer = accessory && accMeta && canvasSpec
        ? (() => {
            return h('div', {
              className: 'dsh-bat-think-accessory',
              style: {
                left: `${(accMeta.box.x - crop[0]) * unit}px`,
                top: `${(accMeta.box.y - crop[1]) * unit}px`,
                width: `${accMeta.box.w * unit}px`,
                height: `${accMeta.box.h * unit}px`,
                backgroundImage: `url("${accessoryUrl(accessory.file)}")`,
                backgroundSize: `${canvasWidth * unit}px ${canvasHeight * unit}px`,
                backgroundPosition: `${-accMeta.box.x * unit}px ${-accMeta.box.y * unit}px`,
              },
              title: '点图案摘掉',
              onPointerDown: (event) => event.stopPropagation(),
              onClick: onAccessoryClick,
            })
          })()
        : null


      return h('div', {
        className: 'dsh-bat-think-root',
        style: { left: `${position.x}px`, top: `${position.y}px`, width: `${size}px` },
        role: 'group',
        'aria-label': manifest.name || 'Desktop pet',
        title: manifest.name || 'Desktop pet',
        onPointerDown,
        onPointerMove,
        onPointerUp: endDrag,
        onPointerCancel: endDrag,
        onContextMenu: (event) => event.preventDefault(),
      },
      showThink
        ? h('div', { className: `dsh-bat-think-think${bubbleEdge}`, role: 'status', 'aria-label': '思考中' },
            h('span', { className: 'dsh-bat-think-dot' }),
            h('span', { className: 'dsh-bat-think-dot' }),
            h('span', { className: 'dsh-bat-think-dot' }))
        : null,
      usageOpen
        ? h('div', { className: `dsh-bat-think-usage${bubbleEdge}`, role: 'dialog', 'aria-label': 'API 用量' },
            h('div', { className: 'dsh-bat-think-usage-head' },
              h('span', null, 'API 用量'),
              h('button', {
                type: 'button',
                className: 'dsh-bat-think-usage-close',
                title: '关闭',
                'aria-label': '关闭用量面板',
                onPointerDown: stopTool,
                onClick: () => setUsageOpen(false),
              }, '×')),
            modelLabel
              ? h('div', { className: 'dsh-bat-think-usage-row' }, h('span', null, '模型'), h('b', { title: modelLabel }, modelLabel))
              : null,
            hasUsage
              ? [
                  h('div', { key: 'out', className: 'dsh-bat-think-usage-row' }, h('span', null, '输出'), h('b', null, formatCount(usage && usage.outputTokens))),
                  h('div', { key: 'in', className: 'dsh-bat-think-usage-row' }, h('span', null, '输入'), h('b', null, formatCount(usage && usage.uncachedInputTokens))),
                  h('div', { key: 'cache', className: 'dsh-bat-think-usage-row' }, h('span', null, '缓存读取'), h('b', null, formatCount(usage && usage.cacheReadTokens))),
                  h('div', { key: 'ctx', className: 'dsh-bat-think-usage-sub' }, h('span', null, '上下文'), h('span', null, contextPercent === null ? '—' : `${contextPercent}%`)),
                  ...(contextPercent === null ? [] : [h('div', { key: 'bar', className: 'dsh-bat-think-usage-bar' }, h('i', { style: { width: `${contextPercent}%` } }))]),
                  h('div', { key: 'num', className: 'dsh-bat-think-usage-sub' }, h('span', null, formatCount(usedTokens)), h('span', null, formatCount(windowTokens))),
                  totals.sessions > 0
                    ? h('div', { key: 'all', className: 'dsh-bat-think-usage-sub' },
                        h('span', null, `已加载 ${totals.sessions} 个会话`),
                        h('span', null, formatCount(totals.uncachedInputTokens + totals.cacheReadTokens + totals.outputTokens)))
                    : null,
                ]
              : h('div', { className: 'dsh-bat-think-usage-sub' }, '这个会话还没有用量数据'))
        : null,
      bubble && !usageOpen ? h('div', { className: `dsh-bat-think-bubble${bubbleEdge}`, role: 'status' }, bubble) : null,
      missing
        ? h('div', { className: `dsh-bat-think-bubble${bubbleEdge}` },
            `立绘没找到：${failedFile || current}（${manifest.variants && manifest.variants[variant] ? variant : '?'}）`)
        : null,
      h('div', { className: `dsh-bat-think-body${bump ? ' is-bump' : ''}` },
        missing
          ? null
          : h('img', {
              className: 'dsh-bat-think-img',
              src,
              alt: '',
              draggable: false,
              style: { width: `${size}px` },
              onDragStart: (event) => event.preventDefault(),
              onLoad: (event) => {
                const element = event.currentTarget
                if (element.naturalWidth > 0 && element.naturalHeight > 0) {
                  const next = element.naturalHeight / element.naturalWidth
                  setRatio((value) => (Math.abs(value - next) > 0.01 ? next : value))
                }
              },
              onError: () => {
                // A file swapped on disk can 404 for a moment; try twice before
                // telling the user the artwork is missing.
                if (loadAttempt < 2) {
                  window.setTimeout(() => {
                    if (alive.current) setLoadAttempt((attempt) => attempt + 1)
                  }, 800)
                  return
                }
                setFailedFile(current)
                setMissing(true)
              },
            }),
        eyesLayer,
        missing
          ? null
          : h('button', {
              type: 'button',
              className: 'dsh-bat-think-laptop',
              style: hotspotStyle,
              title: 'API 用量',
              'aria-label': '查看 API 用量',
              onPointerDown: stopTool,
              onClick: (event) => {
                event.stopPropagation()
                setUsageOpen((open) => !open)
              },
            }),
        accessoryLayer),
      usageOpen ? null : h('div', { className: 'dsh-bat-think-tools' },
        h('button', { type: 'button', className: 'dsh-bat-think-tool', title: '缩小', 'aria-label': '缩小宠物', onPointerDown: stopTool, onClick: () => adjustSize(-16) }, '−'),
        h('button', { type: 'button', className: 'dsh-bat-think-tool', title: '放大', 'aria-label': '放大宠物', onPointerDown: stopTool, onClick: () => adjustSize(16) }, '+'),
        h('button', { type: 'button', className: 'dsh-bat-think-tool', title: '随机配件', 'aria-label': '随机配件', onPointerDown: stopTool, onClick: rollAccessory },
          h('svg', { width: 12, height: 12, viewBox: '0 0 16 16', 'aria-hidden': true },
            h('rect', { x: 1.6, y: 1.6, width: 12.8, height: 12.8, rx: 3.2, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4 }),
            ...[[4.9, 4.9], [11.1, 4.9], [8, 8], [4.9, 11.1], [11.1, 11.1]].map(([cx, cy], index) => h('circle', { key: index, cx, cy, r: 1.15, fill: 'currentColor' })))),
        h('button', { type: 'button', className: 'dsh-bat-think-tool', title: '收起', 'aria-label': '收起桌宠', onPointerDown: stopTool, onClick: () => toggleCollapsed(true) }, '×'),
      ))
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const softGet = typeof ctx.get === 'function' ? ctx.get.bind(ctx) : undefined
        try {
          const soft = softGet ? softGet('sessions') : ctx.sessions
          if (soft && soft.list) attachSessionList(soft.list)
        } catch {
          // The service is not up yet; ctx.inject below attaches it later.
        }
        try {
          const models = softGet ? softGet('modelDirectories') : ctx.modelDirectories
          if (models) setModelDirectories(models)
        } catch {
          // Optional: the usage card simply omits the model row without it.
        }
        try {
          ctx.inject(['modelDirectories'], (scoped) => {
            scoped.effect(() => {
              setModelDirectories(scoped.modelDirectories || null)
              return () => setModelDirectories(null)
            }, 'dsh-bat-think: model directories')
          })
        } catch {
          // No model-selection service in this deployment.
        }
        try {
          ctx.inject(['sessions'], (scoped) => {
            scoped.effect(() => {
              const sessions = scoped.sessions
              if (sessions && sessions.list) attachSessionList(sessions.list)
              return () => detachSessionList()
            }, 'dsh-bat-think: session bridge')
          })
        } catch {
          // A deployment without the session service keeps the pet, minus the
          // thought bubble.
        }
        ctx.effect(() => installStyle(), 'dsh-bat-think: styles')
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'dsh-bat-think',
          order: 20,
        }, Pet))
      },
    }
  },
})
