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
  syncing: false,
  // mission-setup form
  missionModels: {},
  missionFolder: null, // display basename
  missionFolderPath: null, // full path for IPC
  missionGoal: '',
  // missions (real burn ideas from window.maxx.burnIdeas)
  ideas: [],
  ideaTarget: null,
  ideasLoaded: false,
  ideasLoading: false,
  // settings (sourced from config.providers; toggles are session-only for now)
  config: null,
  apiKeyState: {},
  settingsEnabled: {},
  settingsOrder: [],
  notifsOpen: true,
  appOpen: false,
  notifs: { ideas: true, alerts: true, restored: true, quota: true },
  app: { lightMode: false, openAtLogin: true },
  cookies: {},
  cookieSaved: {}, // providerId -> true briefly after a successful key save
  // Scalar settings backed by the config file (populated from getConfig in
  // burnInit). Dropdowns read/write these; Save persists them.
  cfg: { trayMetric: 'left', tokenHistoryDays: '30', sessionThreshold: '50,20', weeklyThreshold: '50,20', alertHours: '48', alertReservePct: '25' },
  provAlert: {}, // providerId -> 'inherit' | 'off' | '15' | '25' | '40' | '60'
  justSaved: false,
  version: 'v0.2.3-beta.1',
  updatesOpen: false,
  update: { status: 'idle', percent: 0, error: '' }, // mirrors main's updateState
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
  // Preserve scroll position so re-renders (e.g. expanding a settings group)
  // don't jump the body back to the top.
  const prevBody = burnRoot.querySelector('.burn-body')
  const prevScroll = prevBody ? prevBody.scrollTop : 0
  burnRoot.classList.toggle('burn-light', !!burnState.app.lightMode)
  burnRoot.innerHTML = burnShell(burnScreenHtml())
  burnAfterRender()
  const newBody = burnRoot.querySelector('.burn-body')
  if (newBody) newBody.scrollTop = prevScroll
}

function burnGo(screen) {
  burnState.screen = screen
  if (screen !== 'home') burnState.expandedId = null
  burnRender()
  if (screen === 'missions' && !burnState.ideasLoaded && !burnState.ideasLoading) burnLoadIdeas()
}

// Pull real burn ideas (+ target provider) once, then re-render Missions.
async function burnLoadIdeas() {
  if (!window.maxx?.burnIdeas) return
  burnState.ideasLoading = true
  try {
    const res = await window.maxx.burnIdeas()
    burnState.ideas = Array.isArray(res?.ideas) ? res.ideas : []
    burnState.ideaTarget = res?.target || null
    burnState.ideasLoaded = true
  } catch (err) {
    console.error('[burn] burnIdeas failed', err)
  } finally {
    burnState.ideasLoading = false
    if (burnState.screen === 'missions') burnRender()
  }
}

function burnApplySnapshot(snap) {
  burnState.providers = burnAdaptProviders(snap)
  burnState.footer = burnAdaptFooter(snap)
  burnRender()
}

// SYNC tile: force a fresh detection of every provider. Fresh data also
// arrives via the onSnapshot push channel.
async function burnSync() {
  if (burnState.syncing || !window.maxx?.syncNow) return
  burnState.syncing = true
  burnRender()
  let snap = null
  try {
    snap = await window.maxx.syncNow()
    if (snap && snap.providers) burnApplySnapshot(snap)
  } catch (err) {
    console.error('[burn] sync failed', err)
  } finally {
    burnState.syncing = false
    // applySnapshot already re-rendered when a usable snapshot came back;
    // only render here otherwise, to avoid a double render flash.
    if (!snap?.providers) burnRender()
  }
}

function burnOpenMissionSetup(index) {
  const idea = burnState.ideas[Number(index)]
  // Preselect the target provider (the model the idea suggests spending).
  const rec = burnState.ideaTarget?.id || null
  burnState.missionModels = {}
  if (rec && burnState.providers.some((p) => p.id === rec)) {
    burnState.missionModels[rec] = true
  }
  burnState.missionGoal = idea ? `${idea.title}\n\n${idea.pitch || ''}`.trim() : ''
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
    // Back is deterministic: mission-setup is a child of missions, every other
    // screen is a top-level sibling of home. Returning to home (not prevScreen)
    // avoids the settings⇄missions ping-pong the one-deep memory used to cause.
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
    else if (scope === 'app') {
      burnState.app[key] = !burnState.app[key]
      if (key === 'lightMode') {
        applyBurnTheme(burnState.app.lightMode)
        // Persist immediately (shared key with the legacy renderer) so the
        // theme survives relaunch even before the user hits Save.
        try { localStorage.setItem('maxxtoken-theme', burnState.app.lightMode ? 'light' : 'dark') } catch (e) {}
      }
    }
    burnRender()
    return
  }

  const collapse = e.target.closest('[data-burn-collapse]')
  if (collapse) {
    const key = collapse.getAttribute('data-burn-collapse')
    if (key === 'notifs') burnState.notifsOpen = !burnState.notifsOpen
    else if (key === 'app') burnState.appOpen = !burnState.appOpen
    else if (key === 'updates') burnState.updatesOpen = !burnState.updatesOpen
    burnRender()
    return
  }

  const action = e.target.closest('[data-burn-action]')
  if (action) {
    const which = action.getAttribute('data-burn-action')
    if (which === 'sync') burnSync()
    else if (which === 'pick-folder') burnPickFolder()
    else if (which === 'copy-goal') window.maxx?.copyText?.(burnState.missionGoal)
    else if (which === 'start-mission') burnStartMission()
    else if (which === 'reveal-config') window.maxx?.openConfigFile?.()
    else if (which === 'reveal-log') window.maxx?.openDebugLog?.()
    else if (which === 'save-cookie') {
      const id = action.getAttribute('data-cookie-id')
      const val = burnState.cookies[id]
      if (id && val && window.maxx?.setApiKey) {
        Promise.resolve(window.maxx.setApiKey(id, val))
          .then(() => {
            burnState.cookieSaved[id] = true
            if (burnState.screen === 'settings') burnRender()
            setTimeout(() => {
              delete burnState.cookieSaved[id]
              if (burnState.screen === 'settings') burnRender()
            }, 1600)
          })
          .catch(() => {})
      }
    } else if (which === 'save-config') {
      burnSaveSettings()
    } else if (which === 'check-updates') {
      if (!window.maxx?.checkUpdates) return
      burnState.update = { ...burnState.update, status: 'checking', error: '' }
      burnRender()
      window.maxx.checkUpdates().then(burnUpdateApply).catch(() => {})
    } else if (which === 'install-update') {
      window.maxx?.installUpdate?.()
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

// <select> change → update state. No re-render: the native control already
// shows the new value, and re-rendering would close the dropdown. Values are
// committed to the config file on Save (burnSaveSettings).
function burnHandleChange(e) {
  const sel = e.target.closest('[data-burn-select]')
  if (!sel) return
  const key = sel.getAttribute('data-burn-select')
  if (key.startsWith('warn:')) {
    burnState.provAlert[key.slice(5)] = sel.value
  } else {
    burnState.cfg[key] = sel.value
  }
  burnState.justSaved = false
}

// Merge the Settings UI state into the full config object and persist via IPC.
// Starts from burnState.config (the complete config from getConfig) so we never
// drop fields the UI doesn't surface. saveConfig persists + applies login item +
// updates the tray, and returns a fresh snapshot.
async function burnSaveSettings() {
  if (!window.maxx?.saveConfig) {
    window.maxx?.close?.()
    return
  }
  const base = burnState.config || {}
  const order = burnSettingsProviders(burnState).map((p) => p.id)
  const providers = { ...(base.providers || {}) }
  for (const id of order) {
    const warn = burnState.provAlert[id] || 'inherit'
    providers[id] = {
      ...providers[id],
      enabled: burnState.settingsEnabled[id] !== false,
      alertsEnabled: warn === 'off' ? false : undefined,
      alertReservePct: warn === 'inherit' || warn === 'off' ? undefined : Number(warn),
    }
  }
  const cfg = burnState.cfg || {}
  const toThresholds = (s) => String(s || '50,20').split(',').map((n) => Number(n)).filter((n) => Number.isFinite(n))
  const sessionThr = toThresholds(cfg.sessionThreshold)
  const weeklyThr = toThresholds(cfg.weeklyThreshold)
  const merged = {
    ...base,
    openAtLogin: burnState.app.openAtLogin !== false,
    missions: !!burnState.notifs.ideas,
    maxxAlertsEnabled: !!burnState.notifs.alerts,
    sessionQuotaNotificationsEnabled: !!burnState.notifs.restored,
    quotaWarningNotificationsEnabled: !!burnState.notifs.quota,
    maxxAlertHours: Number(cfg.alertHours) || 48,
    maxxAlertReservePct: Number(cfg.alertReservePct) || 25,
    quotaWarningThresholds: sessionThr,
    quotaWarningSessionThresholds: sessionThr,
    quotaWarningWeeklyThresholds: weeklyThr,
    trayMetric: cfg.trayMetric || 'left',
    tokenHistoryDays: Number(cfg.tokenHistoryDays) || 30,
    providerOrder: order,
    providers,
  }
  // Optimistic feedback: flip to "Saved ✓" immediately on click. The IPC
  // round-trip forces a fresh snapshot (network detection) and can be slow or
  // reject; the button must confirm regardless, so we don't gate it on await.
  burnState.justSaved = true
  burnRender()
  if (burnState._savedTimer) clearTimeout(burnState._savedTimer)
  burnState._savedTimer = setTimeout(() => {
    burnState.justSaved = false
    if (burnState.screen === 'settings') burnRender()
  }, 1800)

  try {
    const snap = await window.maxx.saveConfig(merged)
    if (snap && snap.providers) burnApplySnapshot(snap)
    if (window.maxx.getConfig) {
      try { burnState.config = await window.maxx.getConfig() } catch (e) {}
    }
  } catch (err) {
    console.error('[burn] saveConfig failed', err)
  }
}

// Fold a main-process update-status object into state + re-render Settings.
// Shape: { status, version, percent, error }.
function burnUpdateApply(s) {
  if (!s) return
  const v = s.version || s.currentVersion
  if (v) burnState.version = String(v).startsWith('v') ? String(v) : `v${v}`
  burnState.update = {
    status: s.status || 'idle',
    percent: Number(s.percent) || 0,
    error: s.error || '',
  }
  if (burnState.screen === 'settings') burnRender()
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
  burnRoot.addEventListener('change', burnHandleChange)
  // Restore the persisted theme (shared key with the legacy renderer).
  try { burnState.app.lightMode = localStorage.getItem('maxxtoken-theme') === 'light' } catch (e) {}
  applyBurnTheme(burnState.app.lightMode)
  burnRender()

  if (window.maxx?.getUpdateStatus) {
    window.maxx.getUpdateStatus().then(burnUpdateApply).catch(() => {})
  }
  // Live push: download progress + "ready" arrive without a manual check.
  if (window.maxx?.onUpdateStatus) window.maxx.onUpdateStatus(burnUpdateApply)

  // Config drives the full Settings provider list (every configured provider,
  // not just the detected ones).
  if (window.maxx?.getConfig) {
    try {
      burnState.config = await window.maxx.getConfig()
      const c = burnState.config || {}
      const provs = c.providers || {}
      for (const id in provs) {
        if (burnState.settingsEnabled[id] === undefined) {
          burnState.settingsEnabled[id] = provs[id]?.enabled !== false
        }
        // Per-provider warn floor → dropdown value.
        const p = provs[id] || {}
        burnState.provAlert[id] =
          p.alertsEnabled === false ? 'off' : p.alertReservePct ? String(p.alertReservePct) : 'inherit'
      }
      // Hydrate scalar settings + notif toggles from the config file so the
      // dropdowns/switches show the real saved state.
      const thr = (raw) => {
        const v = (Array.isArray(raw) ? raw : [50, 20]).map(Number).filter(Number.isFinite)
        const key = [...new Set(v)].sort((a, b) => b - a).slice(0, 2).join(',')
        return ['50,20', '40,15', '25,10', '20,0'].includes(key) ? key : '50,20'
      }
      burnState.cfg = {
        trayMetric: c.trayMetric || 'left',
        tokenHistoryDays: String(c.tokenHistoryDays || 30),
        sessionThreshold: thr(c.quotaWarningSessionThresholds || c.quotaWarningThresholds),
        weeklyThreshold: thr(c.quotaWarningWeeklyThresholds || c.quotaWarningThresholds),
        alertHours: String(c.maxxAlertHours || 48),
        alertReservePct: String(c.maxxAlertReservePct || 25),
      }
      burnState.notifs = {
        ideas: c.missions === true,
        alerts: c.maxxAlertsEnabled !== false,
        restored: c.sessionQuotaNotificationsEnabled !== false,
        quota: c.quotaWarningNotificationsEnabled === true,
      }
      burnState.app.openAtLogin = c.openAtLogin !== false
      if (burnState.screen === 'settings') burnRender()
    } catch (err) {
      console.error('[burn] getConfig failed', err)
    }
  }
  if (window.maxx?.getApiKeyState) {
    window.maxx
      .getApiKeyState()
      .then((s) => {
        burnState.apiKeyState = s || {}
        if (burnState.screen === 'settings') burnRender()
      })
      .catch(() => {})
  }

  // Reopening the popover resets to the home/usage screen — the renderer keeps
  // its state while merely hidden, so without this a subpage would persist.
  if (window.maxx?.onPopoverShown) {
    window.maxx.onPopoverShown(() => {
      // Preserve an in-progress mission setup (folder/models/goal the user is
      // mid-entry on); otherwise return to the home/usage screen.
      if (burnState.screen !== 'home' && burnState.screen !== 'mission-setup') burnGo('home')
    })
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
