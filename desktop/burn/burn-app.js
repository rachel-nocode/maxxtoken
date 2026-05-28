/* BURN app shell — mounts the redesigned UI, owns screen/expand state, fetches
   the snapshot, and delegates clicks. Classic script, loaded after the other
   burn/*.js files and before renderer.js.

   Flag: set BURN_UI=false to fall back to the legacy renderer untouched. */

const BURN_UI = true

const burnState = {
  screen: 'home', // 'home' | 'missions' | 'mission-setup' | 'settings'
  expandedId: null,
  providers: [],
  footer: null,
  // mission-setup form
  missionRec: null,
  missionModels: {},
  missionFolder: null, // display basename
  missionFolderPath: null, // full path for IPC
  missionGoal: '',
  // settings (session state; full config persistence is a follow-up)
  settingsEnabled: {},
  settingsOrder: [],
  notifsOpen: true,
  appOpen: false,
  notifs: { ideas: true, alerts: true, restored: true, quota: true },
  app: { lightMode: false, openAtLogin: true },
  cookies: {},
  version: 'v0.2.3-beta.1',
}

let burnRoot = null

function burnShell(inner) {
  return (
    `<div style="${bstyle({
      position: 'fixed',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      background: BURN.surface,
      color: BURN.text,
      fontFamily: BURN_FONT.sans,
      overflow: 'hidden',
    })}">${inner}</div>`
  )
}

// Screens not yet built render a labelled placeholder so navigation works.
function burnRenderPlaceholder(backLabel, note) {
  return (
    burnHeader({ backLabel }) +
    `<div style="${bstyle({
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: BURN_FONT.mono,
      fontSize: 11,
      letterSpacing: 0.6,
      color: BURN.text3,
      textTransform: 'uppercase',
    })}">${burnEsc(note)}</div>`
  )
}

function burnScreenHtml() {
  switch (burnState.screen) {
    case 'missions':
      return burnRenderMissions(burnState)
    case 'mission-setup':
      return burnRenderMissionSetup(burnState)
    case 'settings':
      return burnRenderSettings(burnState)
    case 'home':
    default:
      return burnRenderHome(burnState)
  }
}

function burnRender() {
  if (!burnRoot) return
  burnRoot.innerHTML = burnShell(burnScreenHtml())
  burnAfterRender()
}

function burnGo(screen) {
  burnState.screen = screen
  if (screen !== 'home') burnState.expandedId = null
  burnRender()
}

function burnApplySnapshot(snap) {
  burnState.providers = burnAdaptProviders(snap)
  burnState.footer = burnAdaptFooter(snap)
  burnRender()
}

function burnOpenMissionSetup(missionN) {
  const mission = BURN_MISSIONS.find((m) => m.n === missionN)
  burnState.missionRec = mission?.rec || null
  burnState.missionModels = {}
  if (mission?.rec && burnState.providers.some((p) => p.id === mission.rec)) {
    burnState.missionModels[mission.rec] = true
  }
  burnGo('mission-setup')
}

async function burnPickFolder() {
  if (!window.maxx?.missionPickFolder) return
  try {
    const res = await window.maxx.missionPickFolder()
    const path = typeof res === 'string' ? res : res?.path || res?.folder
    if (!path || res?.canceled) return
    burnState.missionFolderPath = path
    burnState.missionFolder = String(path).replace(/\/+$/, '').split('/').pop()
    burnRender()
  } catch (err) {
    console.error('[burn] pick folder failed', err)
  }
}

function burnStartMission() {
  const models = Object.keys(burnState.missionModels).filter((id) => burnState.missionModels[id])
  if (!burnState.missionFolderPath || !models.length) return // validation: folder + >=1 model
  if (window.maxx?.missionStartProject) {
    window.maxx
      .missionStartProject({ folder: burnState.missionFolderPath, models, goal: burnState.missionGoal })
      .catch((err) => console.error('[burn] start mission failed', err))
  }
  burnGo('home')
}

function burnHandleClick(e) {
  const nav = e.target.closest('[data-burn-nav]')
  if (nav) {
    const dest = nav.getAttribute('data-burn-nav')
    if (dest === 'back') burnGo(burnState.screen === 'mission-setup' ? 'missions' : 'home')
    else burnGo(dest)
    return
  }

  const build = e.target.closest('[data-burn-build]')
  if (build) {
    burnOpenMissionSetup(build.getAttribute('data-burn-build'))
    return
  }

  const model = e.target.closest('[data-burn-model]')
  if (model) {
    const id = model.getAttribute('data-burn-model')
    burnState.missionModels[id] = !burnState.missionModels[id]
    burnRender()
    return
  }

  const toggle2 = e.target.closest('[data-burn-toggle]')
  if (toggle2) {
    const [scope, key] = toggle2.getAttribute('data-burn-toggle').split(':')
    if (scope === 'prov') burnState.settingsEnabled[key] = burnState.settingsEnabled[key] === false
    else if (scope === 'notif') burnState.notifs[key] = !burnState.notifs[key]
    else if (scope === 'app') burnState.app[key] = !burnState.app[key]
    burnRender()
    return
  }

  const collapse = e.target.closest('[data-burn-collapse]')
  if (collapse) {
    const key = collapse.getAttribute('data-burn-collapse')
    if (key === 'notifs') burnState.notifsOpen = !burnState.notifsOpen
    else if (key === 'app') burnState.appOpen = !burnState.appOpen
    // 'updates' head never opens in v1
    burnRender()
    return
  }

  const action = e.target.closest('[data-burn-action]')
  if (action) {
    const which = action.getAttribute('data-burn-action')
    if (which === 'pick-folder') burnPickFolder()
    else if (which === 'copy-goal') window.maxx?.copyText?.(burnState.missionGoal)
    else if (which === 'start-mission') burnStartMission()
    else if (which === 'reveal-config') window.maxx?.openConfigFile?.()
    else if (which === 'reveal-log') window.maxx?.openDebugLog?.()
    else if (which === 'save-cookie') {
      const id = action.getAttribute('data-cookie-id')
      const val = burnState.cookies[id]
      if (id && val) window.maxx?.setApiKey?.(id, val)?.catch?.(() => {})
    } else if (which === 'save-config') {
      // Full config persistence pending; close the popover for now.
      window.maxx?.close?.()
    }
    return
  }

  // Provider row expand/collapse (chevron and row resolve to the same id).
  // Mutate classes instead of re-rendering so the 120ms transition fires.
  const toggle = e.target.closest('[data-burn-chevron], [data-burn-row]')
  if (toggle) {
    const id = toggle.getAttribute('data-burn-chevron') || toggle.getAttribute('data-burn-row')
    const provEl = burnRoot.querySelector(`[data-burn-prov="${id}"]`)
    const isOpen = !!provEl && provEl.classList.contains('open')
    burnRoot.querySelectorAll('.burn-prov.open').forEach((el) => el.classList.remove('open'))
    if (provEl && !isOpen) provEl.classList.add('open')
    burnState.expandedId = isOpen ? null : id
    // Resize once expanded (immediate) and again after the 120ms collapse.
    burnResize()
    setTimeout(burnResize, 150)
  }
}

// Goal textarea: update state + char-count meta in place (no re-render, keeps
// focus and caret).
function burnHandleInput(e) {
  const goal = e.target.closest('[data-burn-goal]')
  if (goal) {
    burnState.missionGoal = goal.value
    const meta = document.getElementById('burn-goal-meta')
    if (meta) meta.textContent = goal.value.length ? `${goal.value.length} CHAR` : 'OPTIONAL'
    return
  }
  const cookie = e.target.closest('[data-burn-cookie]')
  if (cookie) {
    burnState.cookies[cookie.getAttribute('data-burn-cookie')] = cookie.value
  }
}

// Drag-reorder for settings provider rows. Re-attached after each render.
let burnDragId = null
function burnApplyDrag(fromId, toId) {
  if (!fromId || !toId || fromId === toId) return
  const ids = burnSettingsProviders(burnState).map((p) => p.id)
  const from = ids.indexOf(fromId)
  const to = ids.indexOf(toId)
  if (from < 0 || to < 0) return
  ids.splice(to, 0, ids.splice(from, 1)[0])
  burnState.settingsOrder = ids
  burnRender()
}

// Size the popover window to the natural content height (clamped in main).
// Measured from intrinsic child heights so a short list doesn't leave a gap
// and a long one still scrolls.
function burnResize() {
  if (!burnRoot || !window.maxx?.setPopoverHeight) return
  const shell = burnRoot.firstElementChild
  if (!shell) return
  let h = 0
  for (const child of shell.children) {
    if (child.classList.contains('burn-body')) {
      const cs = getComputedStyle(child)
      h += parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
      for (const gc of child.children) h += gc.offsetHeight
    } else {
      h += child.offsetHeight
    }
  }
  window.maxx.setPopoverHeight(Math.ceil(h) + 2)
}

function burnAfterRender() {
  burnResize()
  if (burnState.screen !== 'settings' || !burnRoot) return
  burnRoot.querySelectorAll('[data-burn-drag]').forEach((row) => {
    row.addEventListener('dragstart', () => {
      burnDragId = row.getAttribute('data-burn-drag')
    })
    row.addEventListener('dragover', (e) => e.preventDefault())
    row.addEventListener('drop', (e) => {
      e.preventDefault()
      burnApplyDrag(burnDragId, row.getAttribute('data-burn-drag'))
      burnDragId = null
    })
  })
}

async function burnInit() {
  if (!BURN_UI) return

  // Hide the legacy popover; mount the burn root in its place.
  const legacy = document.querySelector('.popover')
  if (legacy) legacy.style.display = 'none'

  burnRoot = document.getElementById('burn-root')
  if (!burnRoot) {
    burnRoot = document.createElement('div')
    burnRoot.id = 'burn-root'
    burnRoot.className = 'burn-root'
    document.body.appendChild(burnRoot)
  }
  burnRoot.classList.add('burn-root')

  burnRoot.addEventListener('click', burnHandleClick)
  burnRoot.addEventListener('input', burnHandleInput)
  burnRender()

  if (window.maxx?.getUpdateStatus) {
    window.maxx
      .getUpdateStatus()
      .then((s) => {
        const v = s?.version || s?.currentVersion
        if (v) {
          burnState.version = v.startsWith('v') ? v : `v${v}`
          if (burnState.screen === 'settings') burnRender()
        }
      })
      .catch(() => {})
  }

  if (window.maxx?.onSnapshot) window.maxx.onSnapshot(burnApplySnapshot)
  if (window.maxx?.getSnapshot) {
    try {
      const snap = await window.maxx.getSnapshot()
      if (snap) burnApplySnapshot(snap)
    } catch (err) {
      console.error('[burn] getSnapshot failed', err)
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', burnInit)
} else {
  burnInit()
}
