const logger = require('./logger')
const { snapshot } = require('./aggregate')
const { setProcessOverride } = require('./secrets')
const { setBrowserKeyStore, takeDiscoveredKeys } = require('./browser-cookies')

if (process.env.MAXXTOKEN_USER_DATA) {
  logger.init(process.env.MAXXTOKEN_USER_DATA)
}

process.on('message', async (message) => {
  if (!message || message.type !== 'snapshot') return
  try {
    setProcessOverride(message.secrets)
    setBrowserKeyStore(message.browserKeys)
    logger.info('worker', 'snapshot requested', { requestId: message.requestId, heavy: message.heavy !== false })
    const snap = await snapshot({ heavy: message.heavy !== false })
    safeSend({ type: 'snapshot-result', requestId: message.requestId, ok: true, snap, browserKeys: takeDiscoveredKeys() })
  } catch (err) {
    logger.error('worker', 'snapshot failed', {
      requestId: message.requestId,
      error: err && err.message ? err.message : String(err),
    })
    safeSend({
      type: 'snapshot-result',
      requestId: message.requestId,
      ok: false,
      error: err && err.message ? err.message : String(err),
    })
  }
})

function safeSend(message) {
  if (!process.send || process.connected === false) return
  try {
    process.send(message)
  } catch {
    /* main process may have quit while the worker was finishing */
  }
}

process.on('uncaughtException', (err) => {
  logger.error('worker', 'uncaught exception', { error: err && err.stack ? err.stack : String(err) })
  process.exit(1)
})

process.on('unhandledRejection', (err) => {
  logger.error('worker', 'unhandled rejection', { error: err && err.stack ? err.stack : String(err) })
  process.exit(1)
})
