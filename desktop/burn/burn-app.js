/* BURN app shell — mounts the redesigned UI, owns screen/expand state, fetches
   the snapshot, and delegates clicks. Classic script, loaded after the other
   burn/*.js files and before renderer.js.

   Flag: set BURN_UI=false to fall back to the legacy renderer untouched. */

const BURN_UI = true

const burnState = {
  screen: 'home', // 'home' | 'missions' | 'mission-setup' | 'settings' | 'optimize'
  expandedIds: {},
  providers: [],
  footer: null,
  syncing: false,
  syncError: '',
  // optimize (signals derived from the raw snapshot by window.OptimizeDetect)
  lastSnap: null,
  optimizeModel: null,
  optFilter: 'ALL',
  optExpanded: {}, // signalId -> true (multiple cards open at once)
  optStore: {}, // signalId -> { snoozedUntil?, dismissedAt?, metricValue? } (persisted)
  optTopOpen: {}, // saveMode expanded in the top rail
  optPromptOpen: {}, // promptKey -> true (compact prompt dropdowns)
  optContextScan: {}, // providerId -> scan result for context bloat fixer
  optContextScanLoading: {}, // providerId -> true while folder picker/scan runs
  // token coach — Daily Verdict cards over IPC
  coachModel: null,
  coachLoading: false,
  coachOpen: {}, // verdictId -> true (evidence expanded)
  // licensing — mirror of main's licenseState (single source of truth lives
  // in lib/license; this is display state only)
  license: null, // { status, unlocked, email, maskedKey, graceNote, checkoutUrl, portalUrl, price }
  licenseKeyInput: '',
  licenseNote: null, // { kind: 'error'|'ok', text } shown inline near the key field
  licenseBusy: false,
  licenseOpen: false, // settings LICENSE group collapsed state
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
  metricLayouts: {},
  trayPins: [],
  metricOpen: {},
  layoutUndo: [],
  notifsOpen: true,
  appOpen: false,
  privacyOpen: false,
  diagnosticsOpen: false,
  pricingOpen: false,
  proxyOpen: false,
  proxySettings: { enabled: false, url: '', hasCredentials: false },
  diagnostics: { logLevel: 'info', logPath: null, configPath: null, notice: '' },
  cliStatus: { installed: false, checking: true },
  pricingFallbackOptions: {},
  unknownModelFallback: { enabled: false, models: {} },
  notifs: { alerts: true, restored: true, quota: true, paceNear: false, paceRunOut: false },
  app: { lightMode: false, openAtLogin: true, saveMode: false },
  openUsagePrefs: {
    appearance: 'system',
    density: 'comfortable',
    reduceAnimations: false,
    timeFormat: 'system',
    globalShortcut: null,
    shortcutStatus: { registered: false },
    paceAlerts: { nearExhaustion: false, runOut: false },
    capturePrivacy: false,
    sync: { enabled: false },
    updates: { channel: 'stable', automaticChecks: true },
  },
  systemPrefs: { dark: true, reduceMotion: false, increaseContrast: false, reduceTransparency: false, timeFormat: '12h' },
  syncStatus: null,
  captureStatus: null,
  reportPeriod: '30d',
  reportMetric: 'cost',
  reportModelsOpen: false,
  shareTarget: null,
  shareRedact: { accountLabels: true, spend: false },
  shareNotice: '',
  creditClaim: null,
  cookies: {},
  cookieSaved: {}, // providerId -> true briefly after a successful key save
  // Scalar settings backed by the config file (populated from getConfig in
  // burnInit). Dropdowns read/write these; Save persists them.
  cfg: { trayMetric: 'burnbar', usageMeterMode: 'used', tokenHistoryDays: '30', sessionThreshold: '50,20', weeklyThreshold: '50,20', alertHours: '48', alertReservePct: '25' },
  provAlert: {}, // providerId -> 'inherit' | 'off' | '15' | '25' | '40' | '60'
  justSaved: false,
  justExported: false,
  version: 'v0.2.8',
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
    case 'coach':
      return burnRenderCoach(burnState)
    case 'home':
    default:
      return burnRenderHome(burnState)
  }
}

function burnRender() {
  if (!burnRoot) return
  // Preserve scroll position so re-renders (e.g. expanding a settings group)
  // don't jump the body back to the top.
  const focusIdentity = typeof BurnFocus !== 'undefined' ? BurnFocus.capture(burnRoot, document.activeElement) : null
  const prevBody = burnRoot.querySelector('.burn-body')
  const prevScroll = prevBody ? prevBody.scrollTop : 0
  const appearance = burnState.openUsagePrefs?.appearance || 'system'
  const light = appearance === 'light' || (appearance === 'system' && !burnState.systemPrefs?.dark)
  burnState.app.lightMode = light
  applyBurnTheme(light)
  burnRoot.classList.toggle('burn-light', light)
  burnRoot.classList.toggle('burn-compact', burnState.openUsagePrefs?.density === 'compact')
  burnRoot.classList.toggle('burn-reduce-motion', !!burnState.openUsagePrefs?.reduceAnimations || !!burnState.systemPrefs?.reduceMotion)
  burnRoot.classList.toggle('burn-high-contrast', !!burnState.systemPrefs?.increaseContrast)
  burnRoot.classList.toggle('burn-reduce-transparency', !!burnState.systemPrefs?.reduceTransparency)
  burnRoot.innerHTML = burnShell(burnScreenHtml())
  burnAfterRender()
  const newBody = burnRoot.querySelector('.burn-body')
  if (newBody) newBody.scrollTop = prevScroll
  if (focusIdentity && typeof BurnFocus !== 'undefined') BurnFocus.restore(burnRoot, focusIdentity)
}

function burnPatchOpenUsagePrefs(patch) {
  const current = burnState.openUsagePrefs || {}
  burnState.openUsagePrefs = {
    ...current,
    ...patch,
    paceAlerts: { ...(current.paceAlerts || {}), ...(patch.paceAlerts || {}) },
    sync: { ...(current.sync || {}), ...(patch.sync || {}) },
    updates: { ...(current.updates || {}), ...(patch.updates || {}) },
  }
  burnState.justSaved = false
  burnRender()
  if (window.maxx?.setOpenUsagePrefs) {
    Promise.resolve(window.maxx.setOpenUsagePrefs(patch)).then((saved) => {
      if (saved) burnState.openUsagePrefs = { ...burnState.openUsagePrefs, ...saved }
      burnRender()
    }).catch((err) => {
      burnState.syncError = burnSafeError(err?.message || err)
      burnRender()
    })
  }
}

function burnPatchUpdatePreferences(patch) {
  const current = burnState.openUsagePrefs?.updates || { channel: 'stable', automaticChecks: true }
  burnState.openUsagePrefs.updates = { ...current, ...patch }
  burnRender()
  const save = window.maxx?.setUpdatePreferences
  if (!save) {
    burnPatchOpenUsagePrefs({ updates: patch })
    return
  }
  Promise.resolve(save(patch)).then((saved) => {
    if (saved) burnState.openUsagePrefs.updates = { ...burnState.openUsagePrefs.updates, ...saved }
    burnRender()
  }).catch((err) => {
    burnState.update = { ...burnState.update, status: 'error', error: burnSafeError(err?.message || err) }
    burnRender()
  })
}

async function burnSetGlobalShortcut(accelerator) {
  const method = window.maxx?.setGlobalShortcut || window.maxx?.registerGlobalShortcut
  if (!method) return
  try {
    const result = await method(accelerator)
    burnState.openUsagePrefs.globalShortcut = result?.accelerator || null
    burnState.openUsagePrefs.shortcutStatus = {
      registered: !!result?.accelerator,
      error: result?.ok === false ? (result.error || 'Shortcut unavailable') : null,
    }
    burnRender()
  } catch (err) {
    burnState.openUsagePrefs.shortcutStatus = { registered: false, error: burnSafeError(err?.message || err) }
    burnRender()
  }
}

async function burnSetHistorySync(enabled) {
  if (!window.maxx?.setHistorySync) {
    burnPatchOpenUsagePrefs({ sync: { enabled } })
    return
  }
  burnState.openUsagePrefs.sync = { ...(burnState.openUsagePrefs.sync || {}), enabled }
  burnState.syncStatus = { ...(burnState.syncStatus || {}), enabled, syncing: true }
  burnRender()
  try {
    burnState.syncStatus = await window.maxx.setHistorySync({ enabled })
    burnState.openUsagePrefs.sync.enabled = !!burnState.syncStatus?.enabled
  } catch (err) {
    burnState.syncStatus = { enabled: !enabled, syncing: false, error: burnSafeError(err?.message || err) }
    burnState.openUsagePrefs.sync.enabled = !enabled
  }
  burnRender()
}

function burnHydrateResetConfig(config) {
  if (!config) return
  burnState.config = config
  const prefs = config.openUsagePrefs || {}
  burnState.openUsagePrefs = {
    ...burnState.openUsagePrefs,
    ...prefs,
    paceAlerts: { ...(burnState.openUsagePrefs.paceAlerts || {}), ...(prefs.paceAlerts || {}) },
    sync: { ...(burnState.openUsagePrefs.sync || {}), ...(prefs.sync || {}) },
    updates: { ...(burnState.openUsagePrefs.updates || {}), ...(prefs.updates || {}) },
  }
  burnState.settingsEnabled = Object.fromEntries(Object.entries(config.providers || {}).map(([id, provider]) => [id, provider.enabled !== false]))
  burnState.settingsOrder = Array.isArray(config.providerOrder) ? [...config.providerOrder] : []
  burnState.metricLayouts = config.metricLayouts || {}
  burnState.trayPins = Array.isArray(config.trayPins) ? config.trayPins : []
  burnState.expandedIds = Object.fromEntries((config.expandedProviderIds || []).map((id) => [id, true]))
  const threshold = (raw) => (Array.isArray(raw) ? raw : [50, 20]).map(Number).filter(Number.isFinite).slice(0, 2).join(',') || '50,20'
  burnState.cfg = {
    trayMetric: config.trayMetric || 'burnbar',
    usageMeterMode: config.usageMeterMode || 'used',
    tokenHistoryDays: String(config.tokenHistoryDays || 30),
    sessionThreshold: threshold(config.quotaWarningSessionThresholds || config.quotaWarningThresholds),
    weeklyThreshold: threshold(config.quotaWarningWeeklyThresholds || config.quotaWarningThresholds),
    alertHours: String(config.maxxAlertHours || 48),
    alertReservePct: String(config.maxxAlertReservePct || 25),
  }
  burnState.notifs = {
    alerts: config.maxxAlertsEnabled !== false,
    restored: config.sessionQuotaNotificationsEnabled !== false,
    quota: config.quotaWarningNotificationsEnabled === true,
  }
  burnState.app.openAtLogin = config.openAtLogin !== false
  burnState.app.saveMode = config.saveModeSuggestions === true
  burnState.unknownModelFallback = config.unknownModelFallback || { enabled: false, models: {} }
}

function burnTimeFormat() {
  const selected = burnState.openUsagePrefs?.timeFormat || 'system'
  if (selected === '12h' || selected === '24h') return selected
  if (burnState.systemPrefs?.timeFormat === '24h') return '24h'
  try {
    const cycle = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle
    return cycle === 'h23' || cycle === 'h24' ? '24h' : '12h'
  } catch (e) {
    return '12h'
  }
}

function burnFormatExactTime(timestamp, verb = 'Resets') {
  const value = Number(timestamp)
  if (!Number.isFinite(value)) return `${verb} unavailable`
  const date = new Date(value)
  const today = new Date()
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  const key = (item) => `${item.getFullYear()}-${item.getMonth()}-${item.getDate()}`
  const day = key(date) === key(today) ? 'today' : key(date) === key(tomorrow) ? 'tomorrow' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `${verb} ${day} at ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: burnTimeFormat() === '12h' })}`
}

function burnFormatCountdown(timestamp, verb = 'Resets') {
  const value = Number(timestamp)
  if (!Number.isFinite(value)) return `${verb} unavailable`
  const seconds = Math.max(0, Math.floor((value - Date.now()) / 1000))
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (days) return `${verb} in ${days}d ${String(hours).padStart(2, '0')}h`
  return `${verb} in ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`
}

function burnClockText(timestamp, verb) {
  return burnState.openUsagePrefs?.resetDisplay === 'exact'
    ? burnFormatExactTime(timestamp, verb)
    : burnFormatCountdown(timestamp, verb)
}

function burnTickVisibleClocks() {
  if (!burnRoot) return
  burnRoot.querySelectorAll('[data-burn-clock]').forEach((node) => {
    const raw = node.getAttribute('data-burn-clock')
    if (!raw) return
    const at = Number(raw)
    if (!Number.isFinite(at)) return
    const verb = node.getAttribute('data-burn-clock-verb') || 'Resets'
    node.textContent = burnClockText(at, verb)
  })
}

async function burnShareCard() {
  const target = burnState.shareTarget
  if (!target || !burnState.lastSnap) return
  const method = window.maxx?.shareCard || window.maxx?.copyBurnCardPng
  if (!method) {
    burnState.shareNotice = 'PNG sharing is unavailable in this build.'
    burnRender()
    return
  }
  const payload = {
    ...target,
    period: burnState.reportPeriod,
    metric: burnState.reportMetric,
    theme: burnState.app.lightMode ? 'light' : 'dark',
    redact: { ...burnState.shareRedact },
  }
  try {
    const result = await method(payload)
    burnState.shareNotice = result?.ok === false ? (result.error || 'Could not copy PNG.') : 'PNG copied to clipboard.'
  } catch (err) {
    burnState.shareNotice = burnSafeError(err?.message || err)
  }
  burnRender()
}

async function burnPrepareCredit(providerId, creditId) {
  const method = window.maxx?.prepareCodexResetCredit || window.maxx?.prepareResetCredit
  if (!method) return
  burnState.creditClaim = { status: 'checking', providerId, creditId }
  burnRender()
  try {
    const prepared = await method({ providerInstanceId: providerId, creditId })
    burnState.creditClaim = prepared?.ok
      ? { status: 'confirm', providerId, creditId, prepared }
      : { status: 'error', providerId, creditId, error: prepared?.error || 'This reset credit is not eligible.' }
  } catch (err) {
    burnState.creditClaim = { status: 'error', providerId, creditId, error: burnSafeError(err?.message || err) }
  }
  burnRender()
}

async function burnRedeemCredit() {
  const claim = burnState.creditClaim
  const method = window.maxx?.redeemCodexResetCredit || window.maxx?.redeemResetCredit
  if (!['confirm', 'retry'].includes(claim?.status) || !method) return
  burnState.creditClaim = { ...claim, status: 'redeeming' }
  burnRender()
  try {
    const result = await method({ ...claim.prepared, confirmed: true })
    if (result?.snapshot) burnApplySnapshot(result.snapshot)
    const definitive = ['no_credit', 'nothing_to_reset', 'cancelled', 'ineligible', 'account_changed', 'identity_mismatch'].includes(result?.code)
    burnState.creditClaim = result?.ok
      ? { status: 'done', providerId: claim.providerId, creditId: claim.creditId, message: result.alreadyRedeemed ? 'Already redeemed; usage refreshed.' : 'Reset credit redeemed.' }
      : !definitive
        ? { status: 'retry', providerId: claim.providerId, creditId: claim.creditId, prepared: claim.prepared, error: result?.error || 'Credit outcome is uncertain; retry the same request to refresh usage.' }
        : { status: 'error', providerId: claim.providerId, creditId: claim.creditId, error: result?.error || result?.code || 'Could not redeem this credit.' }
  } catch (err) {
    burnState.creditClaim = { status: 'retry', providerId: claim.providerId, creditId: claim.creditId, prepared: claim.prepared, error: burnSafeError(err?.message || err) }
  }
  burnRender()
}

function burnGo(screen) {
  burnState.screen = screen
  burnRender()
  if (screen === 'missions' && !burnState.ideasLoaded && !burnState.ideasLoading) burnLoadIdeas()
  if (screen === 'coach' && !burnState.coachModel && !burnState.coachLoading) burnLoadCoach()
}

// Refresh the license state mirror. Cheap local IPC (reads a JSON file);
// called at init and whenever a licensing action completes.
async function burnLoadLicense() {
  if (!window.maxx?.licenseState) return
  try {
    burnState.license = await window.maxx.licenseState()
  } catch (err) {
    console.error('[burn] licenseState failed', err)
  }
}

// Activate a pasted key. Unlock is instant on success (spec section 19): the
// new state lands in burnState.license and the next render shows full cards —
// no restart.
async function burnActivateLicense() {
  if (burnState.licenseBusy || !window.maxx?.licenseActivate) return
  const key = (burnState.licenseKeyInput || '').trim()
  if (!key) {
    burnState.licenseNote = { kind: 'error', text: 'Paste your license key first.' }
    burnRender()
    return
  }
  burnState.licenseBusy = true
  burnState.licenseNote = null
  burnRender()
  try {
    const res = await window.maxx.licenseActivate({ key })
    if (res && res.state) burnState.license = res.state
    if (res && res.ok) {
      burnState.licenseKeyInput = ''
      burnState.licenseNote = { kind: 'ok', text: 'Token Coach unlocked. Enjoy.' }
    } else {
      burnState.licenseNote = { kind: 'error', text: (res && res.message) || 'Activation failed.' }
    }
  } catch (err) {
    console.error('[burn] licenseActivate failed', err)
    burnState.licenseNote = { kind: 'error', text: 'Activation failed. Try again.' }
  } finally {
    burnState.licenseBusy = false
    burnRender()
  }
}

async function burnDeactivateLicense() {
  if (burnState.licenseBusy || !window.maxx?.licenseDeactivate) return
  burnState.licenseBusy = true
  burnRender()
  try {
    const res = await window.maxx.licenseDeactivate()
    if (res && res.state) burnState.license = res.state
    burnState.licenseNote = { kind: 'ok', text: 'Seat freed. This machine is back on the free tracker.' }
  } catch (err) {
    console.error('[burn] licenseDeactivate failed', err)
  } finally {
    burnState.licenseBusy = false
    burnRender()
  }
}

function burnBuyLicense() {
  const url = (burnState.license && burnState.license.checkoutUrl) || 'https://maxxtoken.app'
  window.maxx?.openExternal?.(url)
}

// Pull Daily Verdict cards once per popover session, then re-render Coach.
async function burnLoadCoach() {
  if (!window.maxx?.coachVerdicts) return
  burnState.coachLoading = true
  burnRender()
  try {
    burnState.coachModel = await window.maxx.coachVerdicts()
  } catch (err) {
    console.error('[burn] coachVerdicts failed', err)
    burnState.coachModel = { ok: false, verdicts: [], error: 'Could not build verdicts.' }
  } finally {
    burnState.coachLoading = false
    if (burnState.screen === 'coach') burnRender()
  }
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
  const hasInstances = (snap?.providers || []).some((provider) => provider?.providerFamily && provider.id !== provider.providerFamily)
  const needsInstanceConfig = hasInstances && !burnState._instanceConfigReloaded && !burnState.layoutUndo.length && window.maxx?.getConfig
  if (needsInstanceConfig) burnState._instanceConfigReloaded = true
  burnState.lastSnap = snap
  burnState.syncing = snap?.refresh?.inProgress === true
  burnState.providers = burnAdaptProviders(snap, { usageMeterMode: burnState.cfg?.usageMeterMode || 'used', metricLayouts: burnState.metricLayouts, now: Date.now() })
  burnReconcileMetricLayouts(!needsInstanceConfig)
  burnState.footer = burnAdaptFooter(snap)
  burnState.syncError = ''
  burnComputeOptimize(snap)
  burnRender()
  if (needsInstanceConfig) {
    window.maxx.getConfig().then((config) => {
      if (!config) return
      burnState.config = config
      burnState.metricLayouts = config.metricLayouts || burnState.metricLayouts
      burnState.trayPins = Array.isArray(config.trayPins) ? config.trayPins : burnState.trayPins
      burnRevalidateSnapshot(false)
      burnReconcileMetricLayouts(true)
      burnRender()
    }).catch(() => {})
  }
}

function burnRevalidateSnapshot(render = true) {
  if (!burnState.lastSnap) return
  burnState.providers = burnAdaptProviders(burnState.lastSnap, {
    usageMeterMode: burnState.cfg?.usageMeterMode || 'used',
    metricLayouts: burnState.metricLayouts,
    now: Date.now(),
  })
  burnState.footer = burnAdaptFooter(burnState.lastSnap)
  if (render) burnRender()
}

function burnReconcileMetricLayouts(persist = true) {
  let changed = false
  const next = { ...(burnState.metricLayouts || {}) }
  for (const provider of burnState.providers || []) {
    if (!provider.metricLayout) continue
    if (JSON.stringify(next[provider.id] || null) !== JSON.stringify(provider.metricLayout)) changed = true
    next[provider.id] = provider.metricLayout
  }
  burnState.metricLayouts = next
  if (changed && persist) burnSchedulePreferenceSave()
}

function burnPreferenceSnapshot() {
  return {
    metricLayouts: JSON.parse(JSON.stringify(burnState.metricLayouts || {})),
    trayPins: JSON.parse(JSON.stringify(burnState.trayPins || [])),
  }
}

function burnPushLayoutUndo() {
  burnState.layoutUndo.push(burnPreferenceSnapshot())
  if (burnState.layoutUndo.length > 30) burnState.layoutUndo.shift()
}

function burnRestoreLayoutSnapshot(snapshot) {
  if (!snapshot) return
  burnState.metricLayouts = snapshot.metricLayouts || {}
  burnState.trayPins = snapshot.trayPins || []
  burnRevalidateSnapshot(false)
  burnSchedulePreferenceSave()
  burnRender()
}

function burnMetricPlacement(providerId, metricId) {
  const layout = burnState.metricLayouts?.[providerId] || {}
  if ((layout.hidden || []).includes(metricId)) return 'hidden'
  if ((layout.primary || []).includes(metricId)) return 'primary'
  return 'expanded'
}

function burnSetMetricPlacement(providerId, metricId, placement) {
  const layout = burnState.metricLayouts?.[providerId]
  if (!layout || !layout.order.includes(metricId)) return
  burnPushLayoutUndo()
  const next = { ...layout, primary: layout.primary.filter((id) => id !== metricId), hidden: layout.hidden.filter((id) => id !== metricId) }
  if (placement === 'primary') next.primary.push(metricId)
  if (placement === 'hidden') next.hidden.push(metricId)
  burnState.metricLayouts = { ...burnState.metricLayouts, [providerId]: next }
  burnRevalidateSnapshot(false)
  burnSchedulePreferenceSave()
  burnRender()
}

function burnMoveMetric(providerId, metricId, direction) {
  const layout = burnState.metricLayouts?.[providerId]
  if (!layout) return
  const order = [...layout.order]
  const from = order.indexOf(metricId)
  const to = from + direction
  if (from < 0 || to < 0 || to >= order.length) return
  burnPushLayoutUndo()
  order.splice(to, 0, order.splice(from, 1)[0])
  burnState.metricLayouts = { ...burnState.metricLayouts, [providerId]: { ...layout, order } }
  burnRevalidateSnapshot(false)
  burnSchedulePreferenceSave()
  burnRender()
}

function burnSetMetricPin(providerId, metricId, style) {
  burnPushLayoutUndo()
  const pins = (burnState.trayPins || []).filter((pin) => !(pin.providerId === providerId && pin.metricId === metricId))
  if (style !== 'none') {
    const existing = pins.filter((pin) => pin.providerId === providerId)
    if (existing.length >= 2) {
      const remove = existing[0]
      pins.splice(pins.findIndex((pin) => pin.providerId === remove.providerId && pin.metricId === remove.metricId), 1)
    }
    pins.push({ providerId, metricId, style: style === 'text' ? 'text' : 'bar' })
    burnState.cfg.trayMetric = 'pins'
  }
  burnState.trayPins = pins
  if (!pins.length && burnState.cfg.trayMetric === 'pins') burnState.cfg.trayMetric = 'burnbar'
  burnSchedulePreferenceSave()
  burnRender()
}

function burnResetProviderLayout(providerId) {
  burnPushLayoutUndo()
  const layouts = { ...(burnState.metricLayouts || {}) }
  delete layouts[providerId]
  burnState.metricLayouts = layouts
  burnState.trayPins = (burnState.trayPins || []).filter((pin) => pin.providerId !== providerId)
  if (!burnState.trayPins.length && burnState.cfg.trayMetric === 'pins') burnState.cfg.trayMetric = 'burnbar'
  burnRevalidateSnapshot(false)
  burnReconcileMetricLayouts()
  burnSchedulePreferenceSave()
  burnRender()
}

function burnResetAllLayouts() {
  burnPushLayoutUndo()
  burnState.metricLayouts = {}
  burnState.trayPins = []
  if (burnState.cfg.trayMetric === 'pins') burnState.cfg.trayMetric = 'burnbar'
  burnRevalidateSnapshot(false)
  burnReconcileMetricLayouts()
  burnSchedulePreferenceSave()
  burnRender()
}

function burnSchedulePreferenceSave() {
  if (!window.maxx?.saveBurnPreferences) return
  if (burnState._preferenceTimer) clearTimeout(burnState._preferenceTimer)
  burnState._preferenceTimer = setTimeout(async () => {
    try {
      const saved = await window.maxx.saveBurnPreferences({
        metricLayouts: burnState.metricLayouts,
        trayPins: burnState.trayPins,
        expandedProviderIds: Object.keys(burnState.expandedIds).filter((id) => burnState.expandedIds[id]),
        trayMetric: burnState.cfg?.trayMetric,
      })
      if (saved) burnState.config = saved
    } catch (err) {
      console.error('[burn] preference save failed', err)
    }
  }, 150)
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
  burnState.syncError = ''
  burnRender()
  let snap = null
  try {
    snap = await window.maxx.syncNow()
    if (snap && snap.providers) burnApplySnapshot(snap)
  } catch (err) {
    console.error('[burn] sync failed', err)
    burnState.syncError = 'Refresh failed. Showing the last successful data.'
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
    if (dest === 'back') burnGo(burnState.screen === 'mission-setup' ? 'missions' : burnState.screen === 'flow' ? 'optimize' : 'home')
    else burnGo(dest)
    return
  }

  const displayToggle = e.target.closest('[data-burn-display-toggle]')
  if (displayToggle) {
    e.preventDefault()
    e.stopPropagation()
    const kind = displayToggle.getAttribute('data-burn-display-toggle')
    if (kind === 'usage') {
      burnState.cfg.usageMeterMode = burnState.cfg.usageMeterMode === 'left' ? 'used' : 'left'
      burnRevalidateSnapshot(false)
    } else if (kind === 'reset') {
      burnPatchOpenUsagePrefs({ resetDisplay: burnState.openUsagePrefs?.resetDisplay === 'exact' ? 'countdown' : 'exact' })
    }
    burnRender()
    return
  }

  const reportMetric = e.target.closest('[data-burn-report-metric]')
  if (reportMetric) {
    burnState.reportMetric = reportMetric.getAttribute('data-burn-report-metric')
    burnRender()
    return
  }
  const reportPeriod = e.target.closest('[data-burn-report-period]')
  if (reportPeriod) {
    burnState.reportPeriod = reportPeriod.getAttribute('data-burn-report-period')
    burnRender()
    return
  }
  if (e.target.closest('[data-burn-report-models]')) {
    burnState.reportModelsOpen = !burnState.reportModelsOpen
    burnRender()
    return
  }

  const share = e.target.closest('[data-burn-share]')
  if (share) {
    const value = share.getAttribute('data-burn-share')
    if (value === 'close') {
      burnState.shareTarget = null
      burnState.shareNotice = ''
      burnRender()
    } else if (value === 'copy') burnShareCard()
    else {
      const [kind, providerId] = value.split('|')
      burnState.shareTarget = { kind, providerId: providerId || undefined }
      burnState.shareNotice = ''
      burnRender()
    }
    return
  }

  const credit = e.target.closest('[data-burn-credit]')
  if (credit) {
    const [action, providerId, creditId] = (credit.getAttribute('data-burn-credit') || '').split('|')
    if (action === 'prepare') burnPrepareCredit(providerId, creditId)
    else if (action === 'confirm') burnRedeemCredit()
    else if (action === 'cancel') { burnState.creditClaim = null; burnRender() }
    return
  }

  if (e.target.closest('[data-burn-shortcut-clear]')) {
    burnSetGlobalShortcut(null)
    return
  }

  const coachToggle = e.target.closest('[data-coach-toggle]')
  if (coachToggle) {
    const id = coachToggle.getAttribute('data-coach-toggle')
    burnState.coachOpen[id] = !burnState.coachOpen[id]
    burnRender()
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
    if (scope === 'prov') {
      const provider = (burnState.providers || []).find((item) => item.id === key)
      const family = provider?._raw?.providerFamily || key
      const current = burnState.settingsEnabled[key] !== undefined ? burnState.settingsEnabled[key] : burnState.settingsEnabled[family]
      const next = current === false
      burnState.settingsEnabled[family] = next
      for (const item of burnState.providers || []) {
        if ((item._raw?.providerFamily || item.id) === family) burnState.settingsEnabled[item.id] = next
      }
    }
    else if (scope === 'notif') burnState.notifs[key] = !burnState.notifs[key]
    else if (scope === 'pref') {
      if (key === 'paceNear') burnPatchOpenUsagePrefs({ paceAlerts: { nearExhaustion: !burnState.openUsagePrefs?.paceAlerts?.nearExhaustion } })
      else if (key === 'paceRunOut') burnPatchOpenUsagePrefs({ paceAlerts: { runOut: !burnState.openUsagePrefs?.paceAlerts?.runOut } })
      else if (key === 'capturePrivacy') burnPatchOpenUsagePrefs({ capturePrivacy: !burnState.openUsagePrefs?.capturePrivacy })
      else if (key === 'reduceAnimations') burnPatchOpenUsagePrefs({ reduceAnimations: !burnState.openUsagePrefs?.reduceAnimations })
      else if (key === 'sync') burnSetHistorySync(!burnState.openUsagePrefs?.sync?.enabled)
      else if (key === 'updateAutomaticChecks') burnPatchUpdatePreferences({ automaticChecks: !burnState.openUsagePrefs?.updates?.automaticChecks })
      return
    }
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
    else if (key === 'license') burnState.licenseOpen = !burnState.licenseOpen
    else if (key === 'privacy') burnState.privacyOpen = !burnState.privacyOpen
    else if (key === 'diagnostics') burnState.diagnosticsOpen = !burnState.diagnosticsOpen
    else if (key === 'pricing') burnState.pricingOpen = !burnState.pricingOpen
    else if (key === 'proxy') burnState.proxyOpen = !burnState.proxyOpen
    burnRender()
    return
  }

  const action = e.target.closest('[data-burn-action]')
  if (action) {
    const which = action.getAttribute('data-burn-action')
    if (which === 'sync') burnSync()
    else if (which === 'license-buy') burnBuyLicense()
    else if (which === 'license-activate') burnActivateLicense()
    else if (which === 'license-deactivate') burnDeactivateLicense()
    else if (which === 'license-settings') { burnState.licenseOpen = true; burnGo('settings') }
    else if (which === 'pick-folder') burnPickFolder()
    else if (which === 'copy-goal') window.maxx?.copyText?.(burnState.missionGoal)
    else if (which === 'start-mission') burnStartMission()
    else if (which === 'reveal-config') window.maxx?.openConfigFile?.()
    else if (which === 'reveal-log') window.maxx?.openDebugLog?.()
    else if (which === 'copy-log-path') {
      window.maxx?.copyLogPath?.().then(() => {
        burnState.diagnostics.notice = 'Log path copied'
        burnRender()
      }).catch((err) => {
        burnState.diagnostics.notice = burnSafeError(err?.message || err)
        burnRender()
      })
    }
    else if (which === 'save-proxy' || which === 'clear-proxy-auth') {
      const proxy = burnState.proxySettings
      const payload = { enabled: proxy.enabled, url: proxy.url }
      if (which === 'clear-proxy-auth') payload.credentials = {}
      else if (proxy.username || proxy.password) payload.credentials = { username: proxy.username || '', password: proxy.password || '' }
      window.maxx?.setProxySettings?.(payload).then((value) => {
        burnState.proxySettings = { ...value, username: '', password: '', notice: 'Proxy settings applied.' }
        burnRender()
      }).catch(() => {
        burnState.proxySettings.notice = 'Could not apply proxy settings. Check the address and secure storage access.'
        burnRender()
      })
    }
    else if (which === 'install-cli') {
      if (!window.maxx?.installCli) return
      burnState.cliStatus = { ...burnState.cliStatus, checking: true, error: '' }
      burnRender()
      window.maxx.installCli().then((status) => {
        burnState.cliStatus = { ...status, checking: false }
        burnRender()
      }).catch((err) => {
        burnState.cliStatus = { installed: false, checking: false, error: burnSafeError(err?.message || err) }
        burnRender()
      })
    }
    else if (which === 'uninstall-cli') {
      if (!window.maxx?.uninstallCli) return
      burnState.cliStatus = { ...burnState.cliStatus, checking: true, error: '' }
      burnRender()
      window.maxx.uninstallCli().then((status) => {
        burnState.cliStatus = { ...(status || {}), checking: false }
        burnRender()
      }).catch((err) => {
        burnState.cliStatus = { ...burnState.cliStatus, checking: false, error: burnSafeError(err?.message || err) }
        burnRender()
      })
    }
    else if (which === 'reset-settings') {
      window.maxx?.resetSettings?.().then((result) => {
        if (result?.cancelled) return
        burnHydrateResetConfig(result?.config || burnState.config)
        burnState.diagnostics.notice = result?.ok === false ? burnSafeError(result.error) : 'Settings reset. Credentials were preserved.'
        burnState.diagnostics.logLevel = burnState.config?.logLevel || 'info'
        burnState.unknownModelFallback = burnState.config?.unknownModelFallback || { enabled: false, models: {} }
        burnState.proxySettings = { ...burnState.config?.proxy, hasCredentials: burnState.proxySettings.hasCredentials }
        burnRender()
      }).catch((err) => {
        burnState.diagnostics.notice = burnSafeError(err?.message || err)
        burnRender()
      })
    }
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

  const providerAction = e.target.closest('[data-burn-provider-action]')
  if (providerAction) {
    const raw = providerAction.getAttribute('data-burn-provider-action') || ''
    const split = raw.indexOf(':')
    const kind = raw.slice(0, split)
    const id = raw.slice(split + 1)
    if (kind === 'refresh' && window.maxx?.refreshProvider) {
      const provider = (burnState.providers || []).find((item) => item.id === id)
      if (provider?._raw) {
        provider._raw.refreshState = 'refreshing'
        provider._raw.refreshError = null
      }
      burnRender()
      window.maxx.refreshProvider(id).then((snap) => snap && burnApplySnapshot(snap)).catch((err) => {
        if (provider?._raw) {
          provider._raw.refreshState = 'error'
          provider._raw.refreshError = burnSafeError(err?.message || err)
        }
        burnRender()
      })
    } else if (kind === 'account' || kind === 'status') {
      const provider = (burnState.providers || []).find((item) => item.id === id)
      window.maxx?.openProviderLink?.(provider?._raw?.providerFamily || id, kind === 'account' ? 'dashboard' : 'status')
    }
    return
  }

  const metricAction = e.target.closest('[data-burn-metric-action]')
  if (metricAction) {
    const [kind, providerId, metricId] = (metricAction.getAttribute('data-burn-metric-action') || '').split('|')
    if (kind === 'up') burnMoveMetric(providerId, metricId, -1)
    else if (kind === 'down') burnMoveMetric(providerId, metricId, 1)
    else if (kind === 'open') { burnState.metricOpen[providerId] = !burnState.metricOpen[providerId]; burnRender() }
    else if (kind === 'reset') burnResetProviderLayout(providerId)
    else if (kind === 'reset-all') burnResetAllLayouts()
    else if (kind === 'undo') burnRestoreLayoutSnapshot(burnState.layoutUndo.pop())
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

  const optCopyPrompt = e.target.closest('[data-burn-opt-copy-prompt]')
  if (optCopyPrompt) {
    const raw = optCopyPrompt.getAttribute('data-burn-opt-copy-prompt')
    const idx = raw.lastIndexOf(':')
    const pid = raw.slice(0, idx)
    const itemIndex = Number(raw.slice(idx + 1))
    const scan = burnState.optContextScan && burnState.optContextScan[pid]
    const finding = scan && Array.isArray(scan.findings) ? scan.findings[itemIndex] : null
    if (finding && finding.promptText && window.maxx?.copyText) {
      window.maxx.copyText(finding.promptText).then(() => {
        scan.copiedPrompt = finding.ignorePattern || finding.detail || String(itemIndex)
        if (burnState.screen === 'optimize') burnRender()
      }).catch((err) => console.error('[burn] copy cleanup prompt failed', err))
    }
    return
  }

  // Optimize: generic "Copy" button (e.g. cache cleanup prompts). Attribute =
  // "<copiedKey>::<uri-encoded text>". Copies to clipboard; flags the key for a
  // brief "Copied" state.
  const optCopyText = e.target.closest('[data-burn-opt-copy-text]')
  if (optCopyText) {
    const raw = optCopyText.getAttribute('data-burn-opt-copy-text') || ''
    const sep = raw.indexOf('::')
    if (sep > -1 && window.maxx?.copyText) {
      const key = raw.slice(0, sep)
      const cmd = decodeURIComponent(raw.slice(sep + 2))
      window.maxx.copyText(`${cmd}\n`).then(() => {
        burnState.optCopiedCmd = key
        burnRender()
        setTimeout(() => {
          if (burnState.optCopiedCmd === key) {
            burnState.optCopiedCmd = null
            if (burnState.screen === 'optimize') burnRender()
          }
        }, 1800)
      }).catch((err) => console.error('[burn] copy command failed', err))
    }
    return
  }

  const optPromptToggle = e.target.closest('[data-burn-opt-prompt-toggle]')
  if (optPromptToggle) {
    const key = optPromptToggle.getAttribute('data-burn-opt-prompt-toggle')
    burnState.optPromptOpen[key] = !burnState.optPromptOpen[key]
    burnRender()
    return
  }

  // Optimize: provider filter chip.
  const optFilter = e.target.closest('[data-burn-opt-filter]')
  if (optFilter) {
    burnState.optFilter = optFilter.getAttribute('data-burn-opt-filter')
    burnRender()
    return
  }

  const optTop = e.target.closest('[data-burn-opt-top]')
  if (optTop) {
    const key = optTop.getAttribute('data-burn-opt-top')
    burnState.optTopOpen[key] = !burnState.optTopOpen[key]
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
    if (provEl && !isOpen) {
      provEl.classList.add('open')
      provEl.querySelector('[data-burn-row]')?.setAttribute('aria-expanded', 'true')
      const detail = provEl.querySelector('.burn-detail')
      if (detail) {
        detail.setAttribute('aria-hidden', 'false')
        detail.removeAttribute('inert')
      }
    } else if (provEl) {
      provEl.classList.remove('open')
      provEl.querySelector('[data-burn-row]')?.setAttribute('aria-expanded', 'false')
      const detail = provEl.querySelector('.burn-detail')
      if (detail) {
        detail.setAttribute('aria-hidden', 'true')
        detail.setAttribute('inert', '')
      }
    }
    burnState.expandedIds[id] = !isOpen
    burnSchedulePreferenceSave()
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
  const proxy = e.target.closest('[data-burn-proxy]')
  if (proxy) {
    burnState.proxySettings[proxy.getAttribute('data-burn-proxy')] = proxy.type === 'checkbox' ? proxy.checked : proxy.value
    return
  }
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
    return
  }
  const licenseKey = e.target.closest('[data-burn-license-key]')
  if (licenseKey) {
    burnState.licenseKeyInput = licenseKey.value
  }
}

// <select> change → update state. No re-render: the native control already
// shows the new value, and re-rendering would close the dropdown. Values are
// committed to the config file on Save (burnSaveSettings).
function burnHandleChange(e) {
  const redact = e.target.closest('[data-burn-share-redact]')
  if (redact) {
    burnState.shareRedact[redact.getAttribute('data-burn-share-redact')] = !!redact.checked
    return
  }
  const sel = e.target.closest('[data-burn-select]')
  if (!sel) return
  const key = sel.getAttribute('data-burn-select')
  if (key.startsWith('metric|')) {
    const [, providerId, metricId] = key.split('|')
    burnSetMetricPlacement(providerId, metricId, sel.value)
  } else if (key.startsWith('pin|')) {
    const [, providerId, metricId] = key.split('|')
    burnSetMetricPin(providerId, metricId, sel.value)
  } else if (key.startsWith('warn:')) {
    const id = key.slice(5)
    const provider = (burnState.providers || []).find((item) => item.id === id)
    const family = provider?._raw?.providerFamily || id
    burnState.provAlert[family] = sel.value
    for (const item of burnState.providers || []) {
      if ((item._raw?.providerFamily || item.id) === family) burnState.provAlert[item.id] = sel.value
    }
  } else if (['appearance', 'density', 'timeFormat', 'resetDisplay'].includes(key)) {
    burnPatchOpenUsagePrefs({ [key]: sel.value })
    return
  } else if (key === 'updateChannel') {
    burnPatchUpdatePreferences({ channel: sel.value })
    return
  } else if (key === 'logLevel') {
    burnState.diagnostics.logLevel = sel.value
    window.maxx?.setLogLevel?.(sel.value).then((value) => {
      burnState.diagnostics = { ...burnState.diagnostics, ...(value || {}), notice: 'Log level updated' }
      burnRender()
    }).catch((err) => {
      burnState.diagnostics.notice = burnSafeError(err?.message || err)
      burnRender()
    })
    return
  } else if (key === 'fallbackEnabled') {
    burnState.unknownModelFallback.enabled = sel.value === 'on'
  } else if (key.startsWith('fallback:')) {
    const providerId = key.slice('fallback:'.length)
    burnState.unknownModelFallback.models = { ...(burnState.unknownModelFallback.models || {}), [providerId]: sel.value }
  } else {
    burnState.cfg[key] = sel.value
    if (key === 'usageMeterMode') burnRevalidateSnapshot(false)
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
    const display = (burnState.providers || []).find((provider) => provider.id === id)
    const family = display?._raw?.providerFamily || id
    const warn = burnState.provAlert[id] || burnState.provAlert[family] || 'inherit'
    const enabledValue = burnState.settingsEnabled[id] !== undefined ? burnState.settingsEnabled[id] : burnState.settingsEnabled[family]
    providers[family] = {
      ...providers[family],
      enabled: enabledValue !== false,
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
    trayPins: burnState.trayPins,
    metricLayouts: burnState.metricLayouts,
    expandedProviderIds: Object.keys(burnState.expandedIds).filter((id) => burnState.expandedIds[id]),
    usageMeterMode: cfg.usageMeterMode || 'used',
    tokenHistoryDays: Number(cfg.tokenHistoryDays) || 30,
    saveModeSuggestions: burnState.app.saveMode === true,
    unknownModelFallback: burnState.unknownModelFallback,
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
      for (const gc of child.children) {
        const gcs = getComputedStyle(gc)
        h += gc.offsetHeight + (parseFloat(gcs.marginTop) || 0) + (parseFloat(gcs.marginBottom) || 0)
      }
    } else {
      h += child.offsetHeight
    }
  }
  return window.maxx.setPopoverHeight(Math.ceil(h) + 2).catch(() => {})
}

function burnPreparePopoverOpen() {
  burnRevalidateSnapshot(false)
  if (burnState.screen !== 'home' && burnState.screen !== 'mission-setup') burnGo('home')
  // Background revalidation may have moved the license state since the last
  // open (e.g. GRACE ↔ LICENSED, refund → REVOKED). Refresh quietly.
  burnLoadLicense().catch(() => {})
  return Promise.resolve(burnResize()).catch(() => {})
}

function burnHandleKeydown(e) {
  if (e.target?.matches?.('[data-burn-shortcut]')) {
    if (e.key === 'Tab') return
    e.preventDefault()
    if (e.key === 'Escape') { e.target.blur(); return }
    const modifiers = []
    if (e.metaKey || e.ctrlKey) modifiers.push('CommandOrControl')
    if (e.altKey) modifiers.push('Alt')
    if (e.shiftKey) modifiers.push('Shift')
    const aliases = { ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right' }
    const key = aliases[e.key] || (e.key.length === 1 ? e.key.toUpperCase() : e.key)
    if (!['Meta', 'Control', 'Alt', 'Shift'].includes(key) && modifiers.length) burnSetGlobalShortcut([...modifiers, key].join('+'))
    return
  }
  if ((e.key === 'Enter' || e.key === ' ') && e.target?.matches?.('[role="button"][data-burn-display-toggle]')) {
    e.preventDefault()
    e.target.click()
    return
  }
  if ((e.key === 'Enter' || e.key === ' ') && e.target?.matches?.('[role="button"][data-burn-row]')) {
    e.preventDefault()
    e.target.click()
    return
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    if (e.target?.matches?.('input, textarea, select')) {
      e.target.blur()
      return
    }
    if (burnState.shareTarget) {
      burnState.shareTarget = null
      burnState.shareNotice = ''
      burnRender()
      return
    }
    if (burnState.screen === 'home') window.maxx?.close?.()
    else burnGo('home')
    return
  }
  if ((e.metaKey || e.ctrlKey) && e.key === ',') {
    e.preventDefault()
    burnGo('settings')
    return
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'r') {
    e.preventDefault()
    burnSync()
    return
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    burnState.appOpen = true
    burnGo('settings')
    return
  }
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 's') {
    e.preventDefault()
    if (burnState.screen !== 'home') burnGo('home')
    burnState.shareTarget = { kind: 'aggregate' }
    burnState.shareNotice = ''
    burnRender()
    return
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && burnState.screen === 'settings') {
    const snapshot = burnState.layoutUndo.pop()
    if (snapshot) {
      e.preventDefault()
      burnRestoreLayoutSnapshot(snapshot)
    }
  }
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
  document.addEventListener('keydown', burnHandleKeydown)
  // Restore the persisted theme (shared key with the legacy renderer).
  try { burnState.app.lightMode = localStorage.getItem('maxxtoken-theme') === 'light' } catch (e) {}
  burnOptLoadStore()
  applyBurnTheme(burnState.app.lightMode)
  burnRender()

  if (window.maxx?.getOpenUsagePrefs) {
    try {
      const prefs = await window.maxx.getOpenUsagePrefs()
      if (prefs) {
        burnState.openUsagePrefs = {
          ...burnState.openUsagePrefs,
          ...prefs,
          paceAlerts: { ...burnState.openUsagePrefs.paceAlerts, ...(prefs.paceAlerts || {}) },
          sync: { ...burnState.openUsagePrefs.sync, ...(prefs.sync || {}) },
          updates: { ...burnState.openUsagePrefs.updates, ...(prefs.updates || {}) },
        }
        const system = prefs.systemPreferences || {}
        burnState.systemPrefs = {
          ...burnState.systemPrefs,
          dark: system.dark ?? burnState.systemPrefs.dark,
          reduceMotion: system.reducedMotion ?? system.reduceMotion ?? false,
          increaseContrast: system.highContrast ?? system.increaseContrast ?? false,
          reduceTransparency: system.reducedTransparency ?? system.reduceTransparency ?? false,
          timeFormat: system.timeFormat || burnState.systemPrefs.timeFormat,
        }
        burnRender()
      }
    } catch (err) {
      console.error('[burn] getOpenUsagePrefs failed', err)
    }
  }
  if (window.maxx?.getSystemPreferences) {
    window.maxx.getSystemPreferences().then((system) => {
      burnState.systemPrefs = {
        ...burnState.systemPrefs,
        ...system,
        reduceMotion: system?.reducedMotion ?? system?.reduceMotion ?? burnState.systemPrefs.reduceMotion,
        increaseContrast: system?.highContrast ?? system?.increaseContrast ?? burnState.systemPrefs.increaseContrast,
        reduceTransparency: system?.reducedTransparency ?? system?.reduceTransparency ?? burnState.systemPrefs.reduceTransparency,
      }
      burnRender()
    }).catch(() => {})
  }
  if (window.maxx?.onSystemPreferences) {
    window.maxx.onSystemPreferences((system) => {
      burnState.systemPrefs = {
        ...burnState.systemPrefs,
        ...system,
        reduceMotion: system?.reducedMotion ?? system?.reduceMotion ?? burnState.systemPrefs.reduceMotion,
        increaseContrast: system?.highContrast ?? system?.increaseContrast ?? burnState.systemPrefs.increaseContrast,
        reduceTransparency: system?.reducedTransparency ?? system?.reduceTransparency ?? burnState.systemPrefs.reduceTransparency,
      }
      burnRender()
    })
  }
  if (window.maxx?.getSyncStatus) window.maxx.getSyncStatus().then((status) => { burnState.syncStatus = status; if (burnState.screen === 'settings') burnRender() }).catch(() => {})
  if (window.maxx?.getCapturePrivacyStatus) window.maxx.getCapturePrivacyStatus().then((status) => { burnState.captureStatus = status; if (burnState.screen === 'settings') burnRender() }).catch(() => {})
  if (window.maxx?.onHistorySyncStatus) window.maxx.onHistorySyncStatus((status) => { burnState.syncStatus = status; if (burnState.screen === 'settings') burnRender() })
  if (window.maxx?.onCapturePrivacyStatus) window.maxx.onCapturePrivacyStatus((status) => { burnState.captureStatus = status; if (burnState.screen === 'settings') burnRender() })

  // License state mirrors main's licenseState; gates the Coach screen only —
  // the free tracker never touches it.
  burnLoadLicense().then(() => {
    if (burnState.screen === 'coach' || burnState.screen === 'settings') burnRender()
  })

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
      burnState.metricLayouts = c.metricLayouts || {}
      burnState.trayPins = Array.isArray(c.trayPins) ? c.trayPins : []
      burnState.expandedIds = Object.fromEntries((c.expandedProviderIds || []).map((id) => [id, true]))
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
      burnState.unknownModelFallback = c.unknownModelFallback || { enabled: false, models: {} }
      if (burnState.lastSnap) burnState.providers = burnAdaptProviders(burnState.lastSnap, { usageMeterMode: burnState.cfg.usageMeterMode, metricLayouts: burnState.metricLayouts })
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
  if (window.maxx?.getDiagnostics) {
    window.maxx.getProxySettings?.().then((value) => {
      burnState.proxySettings = { ...(value || {}) }
      if (burnState.screen === 'settings') burnRender()
    }).catch(() => {})
    window.maxx.getDiagnostics().then((value) => {
      burnState.diagnostics = { ...burnState.diagnostics, ...(value || {}) }
      if (burnState.screen === 'settings') burnRender()
    }).catch(() => {})
  }
  if (window.maxx?.getCliStatus) {
    window.maxx.getCliStatus().then((value) => {
      burnState.cliStatus = { ...(value || {}), checking: false }
      if (burnState.screen === 'settings') burnRender()
    }).catch((err) => {
      burnState.cliStatus = { installed: false, checking: false, error: burnSafeError(err?.message || err) }
      if (burnState.screen === 'settings') burnRender()
    })
  }
  if (window.maxx?.getPricingFallbackOptions) {
    window.maxx.getPricingFallbackOptions().then((value) => {
      burnState.pricingFallbackOptions = value || {}
      if (burnState.screen === 'settings') burnRender()
    }).catch(() => {})
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

  // Keep reset/freshness labels honest without another provider request.
  setInterval(() => {
    if (burnState.screen === 'home' && burnState.lastSnap) burnRevalidateSnapshot(true)
  }, 60000)
  setInterval(burnTickVisibleClocks, 1000)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', burnInit)
} else {
  burnInit()
}
