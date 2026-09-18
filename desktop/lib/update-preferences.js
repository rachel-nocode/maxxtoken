const DEFAULTS = Object.freeze({
  channel: 'stable',
  automaticChecks: true,
})

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

function normalize(value) {
  const raw = value && typeof value === 'object' ? value : {}
  return {
    channel: raw.channel === 'beta' ? 'beta' : DEFAULTS.channel,
    automaticChecks: raw.automaticChecks !== false,
  }
}

function merge(current, patch) {
  return normalize({ ...normalize(current), ...(patch && typeof patch === 'object' ? patch : {}) })
}

function feedChannel(value) {
  return normalize(value).channel === 'beta' ? 'beta' : 'latest'
}

function manifestNames(value) {
  const channel = feedChannel(value)
  return { mac: `${channel}-mac.yml`, windows: `${channel}.yml` }
}

function versionParts(value) {
  const match = String(value || '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/)
  return match ? { prerelease: match[4] || null } : null
}

function isVersionAllowed(version, value) {
  const parts = versionParts(version)
  if (!parts) return false
  return normalize(value).channel === 'beta' || parts.prerelease == null
}

function configureUpdater(updater, value) {
  const preferences = normalize(value)
  updater.channel = feedChannel(preferences)
  updater.allowPrerelease = preferences.channel === 'beta'
  // electron-updater enables downgrades whenever `channel` is assigned.
  updater.allowDowngrade = false
  updater.autoDownload = false
  updater.autoInstallOnAppQuit = false
  return preferences
}

function createUpdatePolicy({
  updater,
  isPackaged,
  getPreferences,
  intervalMs = CHECK_INTERVAL_MS,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  onChecking = () => {},
  onAvailable = () => {},
  onNotAvailable = () => {},
  onError = () => {},
}) {
  let timer = null
  let generation = 0
  let applied = null
  let queue = Promise.resolve()
  const operations = new Map()
  let candidate = null
  let staged = null
  let activeDownloadToken = null

  function clearSchedule() {
    if (timer) clearIntervalFn(timer)
    timer = null
  }

  function preferences() {
    return normalize(getPreferences())
  }

  function samePreferences(a, b) {
    return !!a && a.channel === b.channel && a.automaticChecks === b.automaticChecks
  }

  function invalidate() {
    generation += 1
    candidate = null
    staged = null
    if (activeDownloadToken?.cancel) activeDownloadToken.cancel()
  }

  async function runCheck(requestedGeneration, current) {
    if (requestedGeneration !== generation) return { ignored: true }
    configureUpdater(updater, current)
    onChecking({ generation: requestedGeneration, preferences: current })
    let result
    try {
      result = await updater.checkForUpdates()
    } catch (error) {
      if (requestedGeneration !== generation) return { ignored: true }
      onError(error, { generation: requestedGeneration, preferences: current })
      throw error
    }
    if (requestedGeneration !== generation) {
      result?.cancellationToken?.cancel?.()
      return { ignored: true }
    }
    if (!result || result.isUpdateAvailable === false) {
      onNotAvailable(result?.updateInfo || result?.versionInfo || null, { generation: requestedGeneration, preferences: current })
      return result
    }
    const version = result.updateInfo?.version || result.versionInfo?.version
    if (!isVersionAllowed(version, current)) {
      result.cancellationToken?.cancel?.()
      onNotAvailable(result.updateInfo || result.versionInfo || null, { generation: requestedGeneration, preferences: current })
      return { ...result, ignored: true }
    }
    candidate = { generation: requestedGeneration, channel: current.channel, version }
    activeDownloadToken = result.cancellationToken || null
    onAvailable(result.updateInfo || result.versionInfo, { ...candidate, preferences: current })
    try {
      await updater.downloadUpdate(result.cancellationToken)
    } catch (error) {
      if (requestedGeneration !== generation) return { ignored: true }
      onError(error, { generation: requestedGeneration, preferences: current })
      throw error
    } finally {
      if (activeDownloadToken === result.cancellationToken) activeDownloadToken = null
    }
    if (requestedGeneration !== generation) return { ignored: true }
    return result
  }

  function check({ manual = false } = {}) {
    const current = preferences()
    const requestedGeneration = generation
    if (!isPackaged() || (!manual && !current.automaticChecks)) return Promise.resolve(null)
    if (operations.has(requestedGeneration)) return operations.get(requestedGeneration)
    const promise = queue.catch(() => {}).then(() => runCheck(requestedGeneration, current))
    operations.set(requestedGeneration, promise)
    queue = promise.catch(() => {})
    promise.finally(() => {
      if (operations.get(requestedGeneration) === promise) operations.delete(requestedGeneration)
    }).catch(() => {})
    return promise
  }

  function apply() {
    clearSchedule()
    const current = preferences()
    updater.autoDownload = false
    updater.autoInstallOnAppQuit = false
    if (!samePreferences(applied, current)) {
      invalidate()
      applied = current
      if (operations.size === 0) configureUpdater(updater, current)
    }
    if (!isPackaged() || !current.automaticChecks) return current
    check().catch(() => {})
    timer = setIntervalFn(() => check().catch(() => {}), intervalMs)
    return current
  }

  function markDownloaded(version) {
    const current = preferences()
    if (!candidate || candidate.generation !== generation || candidate.version !== version || !isVersionAllowed(version, current)) return false
    staged = { ...candidate }
    return true
  }

  function canInstall(version = staged?.version) {
    const current = preferences()
    return !!staged && staged.generation === generation && staged.version === version && isVersionAllowed(version, current)
  }

  function stop() {
    clearSchedule()
    invalidate()
    updater.autoInstallOnAppQuit = false
  }

  return {
    apply,
    checkManual: () => check({ manual: true }),
    checkAutomatic: () => check({ manual: false }),
    stop,
    preferences,
    markDownloaded,
    canInstall,
    hasCurrentCandidate: () => !!candidate && candidate.generation === generation,
    hasScheduledChecks: () => timer != null,
  }
}

module.exports = {
  DEFAULTS,
  CHECK_INTERVAL_MS,
  normalize,
  merge,
  feedChannel,
  manifestNames,
  isVersionAllowed,
  configureUpdater,
  createUpdatePolicy,
}
