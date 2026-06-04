/* BURN app shell — mounts the redesigned UI, owns screen/expand state, fetches
   the snapshot, and delegates clicks. Classic script, loaded after the other
   burn/*.js files and before renderer.js.

   Flag: set BURN_UI=false to fall back to the legacy renderer untouched. */

const BURN_UI = true

const burnState = {
  screen: 'home', // 'home' | 'missions' | 'mission-setup' | 'settings' | 'optimize'
  expandedId: null,
  providers: [],
  footer: null,
  syncing: false,
  // optimize (signals derived from the raw snapshot by window.OptimizeDetect)
  lastSnap: null,
  optimizeModel: null,
  optFilter: 'ALL',
  optExpanded: {}, // signalId -> true (multiple cards open at once)
  optStore: {}, // signalId -> { snoozedUntil?, dismissedAt?, metricValue? } (persisted)
  optDrillOpen: {}, // providerId -> true (agentic session drill-down expanded)
  optDrillDay: {}, // providerId -> dayKey (which day's detail is open)
  optContextScan: {}, // providerId -> scan result for context bloat fixer
  optContextScanLoading: {}, // providerId -> true while folder picker/scan runs
  // mission-setup form
  missionModels: {},
  missionFolder: null, // display basename
  missionFolderPath: null, // full path for IPC
  missionGoal: '',
  missionNote: '', // status/error surfaced under the start button
  missionPreflight: null,
  missionPreflightLoading: false,
  // missions (real burn ideas from window.maxx.burnIdeas)
  ideas: [],
  ideaTarget: null,
  generation: null, // { mode:'live'|'offline', provider, providerName, error }
  ideasLoaded: false,
  ideasLoading: false,
  // missions screen mode: 'new' (generated app ideas) | 'backlog' (repo missions)
  missionMode: 'new',
  backlog: null, // { dir, folderName, stack, missions, sourceCount, testCount }
  backlogLoading: false,
  // settings (sourced from config.providers; toggles are session-only for now)
  config: null,
  apiKeyState: {},
  settingsEnabled: {},
  settingsOrder: [],
  notifsOpen: true,
  appOpen: false,
  notifs: { alerts: true, restored: true, quota: true },
  app: { lightMode: false, openAtLogin: true, saveMode: false },
  cookies: {},
  cookieSaved: {}, // providerId -> true briefly after a successful key save
  // Scalar settings backed by the config file (populated from getConfig in
  // burnInit). Dropdowns read/write these; Save persists them.
  cfg: { trayMetric: 'burnbar', usageMeterMode: 'used', tokenHistoryDays: '30', sessionThreshold: '50,20', weeklyThreshold: '50,20', alertHours: '48', alertReservePct: '25' },
  provAlert: {}, // providerId -> 'inherit' | 'off' | '15' | '25' | '40' | '60'
  justSaved: false,
  justExported: false,
  version: 'v0.2.4',
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
    case 'optimize':
      return burnRenderOptimize(burnState)
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
    burnState.generation = res?.generation || null
    burnState.ideasLoaded = true
  } catch (err) {
    console.error('[burn] burnIdeas failed', err)
    // Mark loaded so the UI shows an empty/error state instead of hanging on
    // "Finding burn ideas…" forever when the IPC call rejects.
    burnState.ideasLoaded = true
  } finally {
    burnState.ideasLoading = false
    if (burnState.screen === 'missions') burnRender()
  }
}

// Pick a repo and scan it for backlog missions (deterministic, main-process).
async function burnPickBacklog() {
  if (!window.maxx?.backlogMissions || burnState.backlogLoading) return
  burnState.backlogLoading = true
  burnRender()
  try {
    const res = await window.maxx.backlogMissions()
    if (res && res.ok) {
      burnState.backlog = {
        dir: res.dir,
        folderName: res.folderName,
        stack: res.stack,
        missions: Array.isArray(res.missions) ? res.missions : [],
        sourceCount: res.sourceCount,
        testCount: res.testCount,
      }
    }
    // canceled → leave existing backlog state untouched
  } catch (err) {
    console.error('[burn] backlogMissions failed', err)
  } finally {
    burnState.backlogLoading = false
    if (burnState.screen === 'missions') burnRender()
  }
}

// Launch a build for one backlog mission in its repo.
async function burnStartBacklog(index) {
  const bl = burnState.backlog
  const mission = bl && Array.isArray(bl.missions) ? bl.missions[index] : null
  if (!mission || !window.maxx?.backlogStart) return
  try {
    await window.maxx.backlogStart({ dir: bl.dir, mission })
  } catch (err) {
    console.error('[burn] backlogStart failed', err)
  }
}

function burnApplySnapshot(snap) {
  burnState.providers = burnAdaptProviders(snap, { usageMeterMode: burnState.cfg?.usageMeterMode || 'used' })
  burnState.footer = burnAdaptFooter(snap)
  burnComputeOptimize(snap)
  burnRender()
}

// Derive Optimize signals from the raw snapshot (no new data pipe). Pure +
// defensive: any failure leaves the panel empty rather than breaking Burn.
function burnComputeOptimize(snap) {
  burnState.lastSnap = snap
  try {
    if (window.OptimizeDetect) {
      burnState.optimizeModel = window.OptimizeDetect.buildOptimizeModel(snap, {
        saveModeEnabled: burnState.app.saveMode === true,
      })
    }
  } catch (err) {
    console.error('[burn] optimize detect failed', err)
    burnState.optimizeModel = null
  }
}

const BURN_OPT_STORE_KEY = 'maxxtoken-optimize-state'

// Load persisted snooze/dismiss records (durable across restarts, like theme).
function burnOptLoadStore() {
  try {
    const raw = localStorage.getItem(BURN_OPT_STORE_KEY)
    burnState.optStore = raw ? JSON.parse(raw) : {}
  } catch (e) {
    burnState.optStore = {}
  }
}

function burnOptSaveStore() {
  try {
    localStorage.setItem(BURN_OPT_STORE_KEY, JSON.stringify(burnState.optStore || {}))
  } catch (e) {}
}

function burnOptFindSignal(id) {
  const sigs = burnState.optimizeModel && burnState.optimizeModel.signals
  return Array.isArray(sigs) ? sigs.find((s) => s.id === id) || null : null
}

// Primary card action → open the relevant external page (caching docs or the
// provider dashboard). Spec'd per-kind in optimize-detect (signal.action).
async function burnOptPrimaryAction(sig) {
  const a = sig && sig.action
  if (!a) return
  try {
    if (a.type === 'external' && a.url) window.maxx?.openExternal?.(a.url)
    else if (a.type === 'providerLink') window.maxx?.openProviderLink?.(sig.provider, a.kind || 'dashboard')
    else if (a.type === 'contextScan' && window.maxx?.scanContextBloat) {
      burnState.optContextScanLoading[sig.provider] = true
      burnRender()
      const res = await window.maxx.scanContextBloat(sig.provider)
      if (res && !res.canceled) burnState.optContextScan[sig.provider] = res
      burnState.optContextScanLoading[sig.provider] = false
      if (burnState.screen === 'optimize') burnRender()
    }
  } catch (err) {
    if (sig && sig.provider) burnState.optContextScanLoading[sig.provider] = false
    console.error('[burn] optimize primary action failed', err)
    if (burnState.screen === 'optimize') burnRender()
  }
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
  burnState.missionNote = ''
  burnGo('mission-setup')
  burnScheduleMissionPreflight(50)
}

async function burnPickFolder() {
  if (!window.maxx?.missionPickFolder) return
  try {
    const res = await window.maxx.missionPickFolder()
    const path = typeof res === 'string' ? res : res?.dir || res?.path || res?.folder
    if (!path || res?.canceled) return
    burnState.missionFolderPath = path
    burnState.missionFolder = String(path).replace(/\/+$/, '').split('/').pop()
    burnState.missionNote = ''
    burnScheduleMissionPreflight(50)
    burnRender()
  } catch (err) {
    console.error('[burn] pick folder failed', err)
  }
}

function burnMissionPayload() {
  const models = Object.keys(burnState.missionModels).filter((id) => burnState.missionModels[id])
  return {
    dir: burnState.missionFolderPath,
    folder: burnState.missionFolderPath,
    models,
    goal: burnState.missionGoal,
  }
}

function burnScheduleMissionPreflight(delay = 350) {
  if (burnState._preflightTimer) clearTimeout(burnState._preflightTimer)
  burnState._preflightTimer = setTimeout(() => burnLoadMissionPreflight(), delay)
}

async function burnLoadMissionPreflight() {
  if (!window.maxx?.missionPreflight) return
  const payload = burnMissionPayload()
  burnState.missionPreflightLoading = true
  const requestId = Date.now()
  burnState._preflightRequest = requestId
  try {
    const res = await window.maxx.missionPreflight(payload)
    if (burnState._preflightRequest !== requestId) return
    burnState.missionPreflight = res || null
  } catch (err) {
    if (burnState._preflightRequest !== requestId) return
    burnState.missionPreflight = { ok: false, error: err && err.message ? err.message : 'Preflight failed.' }
  } finally {
    if (burnState._preflightRequest === requestId) {
      burnState.missionPreflightLoading = false
      if (burnState.screen === 'mission-setup') burnRender()
    }
  }
}

function burnStartMission() {
  const payload = burnMissionPayload()
  if (!burnState.missionFolderPath || !payload.models.length) {
    burnState.missionNote = !burnState.missionFolderPath ? 'Pick a folder first.' : 'Pick at least one model.'
    burnRender()
    return
  }
  if (!window.maxx?.missionStartProject) return
  burnState.missionNote = 'Starting mission…'
  burnRender()
  window.maxx
    .missionStartProject(payload)
    .then((res) => {
      if (res && res.ok) {
        burnState.missionNote = ''
        burnGo('home')
      } else {
        burnState.missionNote = 'Could not start: ' + ((res && res.error) || 'unknown')
        burnRender()
      }
    })
    .catch((err) => {
      burnState.missionNote = err && err.message ? err.message : 'Could not start mission.'
      burnRender()
    })
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

  const backlogBuild = e.target.closest('[data-burn-backlog]')
  if (backlogBuild) {
    burnStartBacklog(Number(backlogBuild.getAttribute('data-burn-backlog')))
    return
  }

  const model = e.target.closest('[data-burn-model]')
  if (model) {
    const id = model.getAttribute('data-burn-model')
    burnState.missionModels[id] = !burnState.missionModels[id]
    burnScheduleMissionPreflight(50)
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
    } else if (scope === 'opt' && key === 'saveMode') {
      burnToggleSaveMode()
      return
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
    else if (which === 'export-usage') burnExportUsage()
    else if (which === 'mode-new') { burnState.missionMode = 'new'; burnRender() }
    else if (which === 'mode-backlog') { burnState.missionMode = 'backlog'; burnRender() }
    else if (which === 'pick-backlog') burnPickBacklog()
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
    } else if (which === 'opt-rescan') {
      // Re-read the last snapshot (no new collection) and re-detect.
      if (burnState.lastSnap) burnComputeOptimize(burnState.lastSnap)
      burnRender()
    }
    return
  }

  // Optimize: provider filter chip.
  const optReveal = e.target.closest('[data-burn-opt-reveal]')
  if (optReveal) {
    const raw = optReveal.getAttribute('data-burn-opt-reveal')
    const idx = raw.lastIndexOf(':')
    const pid = raw.slice(0, idx)
    const itemIndex = Number(raw.slice(idx + 1))
    const scan = burnState.optContextScan && burnState.optContextScan[pid]
    const finding = scan && Array.isArray(scan.findings) ? scan.findings[itemIndex] : null
    if (finding && finding.path) window.maxx?.revealPath?.(finding.path).catch((err) => console.error('[burn] reveal path failed', err))
    return
  }

  // Optimize: provider filter chip.
  const optFilter = e.target.closest('[data-burn-opt-filter]')
  if (optFilter) {
    burnState.optFilter = optFilter.getAttribute('data-burn-opt-filter')
    burnRender()
    return
  }

  // Optimize: agentic session drill-down — toggle a provider's day list.
  const optDrill = e.target.closest('[data-burn-opt-drill]')
  if (optDrill) {
    const id = optDrill.getAttribute('data-burn-opt-drill')
    burnState.optDrillOpen[id] = !burnState.optDrillOpen[id]
    burnRender()
    return
  }

  // Optimize: select a day inside a provider's drill-down (toggles its detail).
  const optDay = e.target.closest('[data-burn-opt-day]')
  if (optDay) {
    const raw = optDay.getAttribute('data-burn-opt-day')
    const i = raw.indexOf(':')
    const pid = raw.slice(0, i)
    const day = raw.slice(i + 1)
    burnState.optDrillDay[pid] = burnState.optDrillDay[pid] === day ? null : day
    burnRender()
    return
  }

  // Optimize: card expand/collapse (multiple open at once — it's a dashboard).
  const optCardEl = e.target.closest('[data-burn-opt-card]')
  if (optCardEl) {
    const id = optCardEl.getAttribute('data-burn-opt-card')
    burnState.optExpanded[id] = !burnState.optExpanded[id]
    burnRender()
    return
  }

  // Optimize: card actions (primary / snooze / dismiss). Snooze + dismiss hide
  // the signal for the session (durable persistence is a later step).
  const optAction = e.target.closest('[data-burn-opt-action]')
  if (optAction) {
    // Split on the FIRST colon only — signal ids contain colons (e.g.
    // "codex:cache"), so a plain split() would mangle the id.
    const raw = optAction.getAttribute('data-burn-opt-action')
    const idx = raw.indexOf(':')
    const kind = raw.slice(0, idx)
    const id = raw.slice(idx + 1)
    const sig = burnOptFindSignal(id)
    if (kind === 'snooze') {
      const days = window.OptimizeDetect?.CONFIG?.snoozeDays || 30
      burnState.optStore[id] = { ...(burnState.optStore[id] || {}), snoozedUntil: Date.now() + days * 86400000 }
      burnOptSaveStore()
      burnRender()
    } else if (kind === 'dismiss') {
      // Store the metric at dismiss time so we only resurface when it moves.
      burnState.optStore[id] = {
        ...(burnState.optStore[id] || {}),
        dismissedAt: Date.now(),
        metricValue: sig ? sig.metricValue : null,
      }
      burnOptSaveStore()
      burnRender()
    } else if (kind === 'primary') {
      burnOptPrimaryAction(sig)
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

async function burnToggleSaveMode() {
  burnState.app.saveMode = !burnState.app.saveMode
  if (burnState.lastSnap) burnComputeOptimize(burnState.lastSnap)
  burnRender()
  if (!window.maxx?.saveConfig) return
  if (!burnState.config && window.maxx.getConfig) {
    try { burnState.config = await window.maxx.getConfig() } catch (e) {}
  }
  if (!burnState.config) return
  const merged = {
    ...(burnState.config || {}),
    saveModeSuggestions: burnState.app.saveMode === true,
  }
  try {
    const snap = await window.maxx.saveConfig(merged)
    if (window.maxx.getConfig) {
      try { burnState.config = await window.maxx.getConfig() } catch (e) {}
    } else {
      burnState.config = merged
    }
    if (snap && snap.providers) burnApplySnapshot(snap)
  } catch (err) {
    console.error('[burn] saveMode save failed', err)
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
    burnScheduleMissionPreflight()
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
    maxxAlertsEnabled: !!burnState.notifs.alerts,
    sessionQuotaNotificationsEnabled: !!burnState.notifs.restored,
    quotaWarningNotificationsEnabled: !!burnState.notifs.quota,
    maxxAlertHours: Number(cfg.alertHours) || 48,
    maxxAlertReservePct: Number(cfg.alertReservePct) || 25,
    quotaWarningThresholds: sessionThr,
    quotaWarningSessionThresholds: sessionThr,
    quotaWarningWeeklyThresholds: weeklyThr,
    trayMetric: cfg.trayMetric || 'burnbar',
    usageMeterMode: cfg.usageMeterMode || 'used',
    tokenHistoryDays: Number(cfg.tokenHistoryDays) || 30,
    saveModeSuggestions: burnState.app.saveMode === true,
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

// Export usage + cost history to JSON via the native save dialog (main process
// owns the dialog + file write). Flip the button to "EXPORTED ✓" on success.
async function burnExportUsage() {
  if (!window.maxx?.exportUsage) return
  try {
    const res = await window.maxx.exportUsage()
    if (!res || !res.ok) return
    burnState.justExported = true
    if (burnState.screen === 'settings') burnRender()
    if (burnState._exportTimer) clearTimeout(burnState._exportTimer)
    burnState._exportTimer = setTimeout(() => {
      burnState.justExported = false
      if (burnState.screen === 'settings') burnRender()
    }, 1800)
  } catch (err) {
    console.error('[burn] exportUsage failed', err)
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
  if (!burnRoot || !window.maxx?.setPopoverHeight) return Promise.resolve()
  const shell = burnRoot.firstElementChild
  if (!shell) return Promise.resolve()
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
  return window.maxx.setPopoverHeight(Math.ceil(h) + 2).catch(() => {})
}

function burnPreparePopoverOpen() {
  if (burnState.screen !== 'home' && burnState.screen !== 'mission-setup') burnGo('home')
  return Promise.resolve(burnResize()).catch(() => {})
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
  burnOptLoadStore()
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
        trayMetric: c.trayMetric || 'burnbar',
        usageMeterMode: c.usageMeterMode || 'used',
        tokenHistoryDays: String(c.tokenHistoryDays || 30),
        sessionThreshold: thr(c.quotaWarningSessionThresholds || c.quotaWarningThresholds),
        weeklyThreshold: thr(c.quotaWarningWeeklyThresholds || c.quotaWarningThresholds),
        alertHours: String(c.maxxAlertHours || 48),
        alertReservePct: String(c.maxxAlertReservePct || 25),
      }
      burnState.notifs = {
        alerts: c.maxxAlertsEnabled !== false,
        restored: c.sessionQuotaNotificationsEnabled !== false,
        quota: c.quotaWarningNotificationsEnabled === true,
      }
      burnState.app.openAtLogin = c.openAtLogin !== false
      burnState.app.saveMode = c.saveModeSuggestions === true
      if (burnState.lastSnap) burnState.providers = burnAdaptProviders(burnState.lastSnap, { usageMeterMode: burnState.cfg.usageMeterMode })
      if (burnState.lastSnap) burnComputeOptimize(burnState.lastSnap)
      if (burnState.screen === 'settings' || burnState.screen === 'optimize') burnRender()
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
  window.__maxxPreparePopoverOpen = burnPreparePopoverOpen
  if (window.maxx?.onPopoverShown) {
    window.maxx.onPopoverShown(() => {
      // Preserve an in-progress mission setup (folder/models/goal the user is
      // mid-entry on); otherwise return to the home/usage screen.
      burnPreparePopoverOpen()
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
