const { DEFAULT_CONFIG, FILE, _private } = require('./config')

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function describe(config = {}, options = {}) {
  return {
    logLevel: _private.normalizeLogLevel(config.logLevel),
    logPath: options.logPath || null,
    configPath: options.configPath || FILE,
  }
}

function setLogLevel(config = {}, level) {
  return { ...config, logLevel: _private.normalizeLogLevel(level) }
}

function resetSettings(currentConfig = {}) {
  const reset = clone(DEFAULT_CONFIG)
  reset.onboardingComplete = currentConfig.onboardingComplete === true
  return reset
}

module.exports = { describe, setLogLevel, resetSettings }
