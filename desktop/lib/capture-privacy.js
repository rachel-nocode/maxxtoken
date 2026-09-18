const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')
const { promisify } = require('util')

const execFileAsync = promisify(execFile)
const DEFAULT_POLL_MS = 3000

function defaultProbePath(options = {}) {
  const candidates = [
    options.resourcesPath && path.join(options.resourcesPath, 'screen-capture-probe'),
    path.join(__dirname, '..', 'native', 'bin', 'screen-capture-probe'),
  ].filter(Boolean)
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0] || null
}

async function runNativeProbe(probePath, exec = execFileAsync) {
  if (!probePath || !fs.existsSync(probePath)) {
    return unsupported('Screen-capture protection is unavailable because the native detector is missing.')
  }
  try {
    const result = await exec(probePath, [], { timeout: 2000, maxBuffer: 8192 })
    const parsed = JSON.parse(String(result.stdout || '').trim())
    if (!['full', 'limited'].includes(parsed.supportLevel) || typeof parsed.captured !== 'boolean') {
      return unsupported('The native screen-capture detector returned an invalid response.')
    }
    return {
      supported: parsed.supported === true && parsed.supportLevel === 'full',
      supportLevel: parsed.supportLevel,
      captured: parsed.captured,
      message: String(parsed.message || ''),
    }
  } catch {
    return unsupported('The native screen-capture detector could not be started.')
  }
}

function createCapturePrivacyMonitor(options = {}) {
  const platform = options.platform || process.platform
  const probePath = options.probePath || defaultProbePath(options)
  const probe = options.probe || (() => runNativeProbe(probePath, options.exec))
  const pollMs = positiveNumber(options.pollMs, DEFAULT_POLL_MS)
  const onChange = typeof options.onChange === 'function' ? options.onChange : () => {}
  let enabled = false
  let timer = null
  let checking = false
  let generation = 0
  let status = baseStatus(platform)

  async function check() {
    if (!enabled || platform !== 'darwin' || checking) return getStatus()
    checking = true
    const currentGeneration = generation
    let result
    try {
      result = await probe()
    } catch {
      result = unsupported('The native screen-capture detector could not be checked.')
    } finally {
      checking = false
    }
    if (!enabled || currentGeneration !== generation) return getStatus()
    const fullSupport = result.supported === true && result.supportLevel === 'full'
    update({
      ...result,
      enabled: true,
      supported: fullSupport,
      concealUsage: result.captured === true || !fullSupport,
      message: fullSupport
        ? result.message
        : `Full screen-capture detection is unavailable; usage remains hidden while privacy is enabled. ${result.message || ''}`.trim(),
      checkedAt: Date.now(),
    })
    return getStatus()
  }

  function start() {
    if (!enabled || platform !== 'darwin' || timer) return
    void check()
    timer = setInterval(() => { void check() }, pollMs)
    timer.unref?.()
  }

  function stop() {
    generation += 1
    if (timer) clearInterval(timer)
    timer = null
    checking = false
  }

  function setEnabled(value) {
    const next = value === true
    if (next === enabled) return getStatus()
    enabled = next
    if (enabled) {
      status = {
        ...baseStatus(platform),
        enabled: true,
        concealUsage: platform === 'darwin',
        message: platform === 'darwin'
          ? 'Checking for active screen capture; usage is hidden until the check completes.'
          : baseStatus(platform).message,
      }
      start()
    } else {
      stop()
      update({ ...status, enabled: false, captured: false, concealUsage: false })
    }
    return getStatus()
  }

  function update(next) {
    const changed = JSON.stringify(status) !== JSON.stringify(next)
    status = next
    if (changed) onChange(getStatus())
  }

  function getStatus() {
    return { ...status }
  }

  return { setEnabled, start, stop, check, getStatus }
}

function baseStatus(platform) {
  if (platform !== 'darwin') {
    return {
      enabled: false,
      supported: false,
      supportLevel: 'unsupported',
      captured: false,
      concealUsage: false,
      message: 'Screen-capture privacy is available only on macOS.',
      checkedAt: null,
    }
  }
  return {
    enabled: false,
    supported: false,
    supportLevel: 'unsupported',
    captured: false,
    concealUsage: false,
    message: 'Screen-capture support has not been checked yet.',
    checkedAt: null,
  }
}

function unsupported(message) {
  return { supported: false, supportLevel: 'unsupported', captured: false, message }
}

function positiveNumber(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : fallback
}

module.exports = { createCapturePrivacyMonitor, runNativeProbe, defaultProbePath, _private: { baseStatus } }
