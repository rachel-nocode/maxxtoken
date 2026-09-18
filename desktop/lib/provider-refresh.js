function previousFor(entry, previousProviders = []) {
  const previous = previousProviders.find((provider) => provider.id === entry.id)
  if (!previous) return null
  if (entry.account) return previous.account?.identityStamp === entry.account.identityStamp ? previous : null
  return previous.account ? null : previous
}

function placeholder(entry) {
  return {
    id: entry.id, providerFamily: entry.family, name: entry.conf.name,
    plan: entry.conf.plan, monthly: entry.conf.monthly, connected: false,
    windows: [], tokenUsage: null, activity: 'none',
    ...(entry.account ? { account: { id: entry.id, label: entry.account.label, identityStamp: entry.account.identityStamp, isDefault: entry.account.isDefault } } : {}),
  }
}

async function collect(entries, options) {
  const startedAt = Date.now()
  const pending = new Set(entries.filter((entry) => entry.refresh !== false).map((entry) => entry.id))
  const rows = new Map(entries.map((entry) => {
    const previous = previousFor(entry, options.previousProviders)
    return [entry.id, { ...(previous || placeholder(entry)), refreshState: pending.has(entry.id) ? 'refreshing' : previous?.error ? 'error' : 'idle', refreshError: null }]
  }))
  const state = () => ({ providers: entries.map((entry) => rows.get(entry.id)), refresh: { startedAt, inProgress: pending.size > 0, pendingProviderIds: [...pending] } })
  const emit = () => {
    try { options.onProgress?.(state()) } catch {}
  }
  emit()
  await Promise.all(entries.filter((entry) => entry.refresh !== false).map(async (entry) => {
    let timer
    try {
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Provider refresh timed out.')), options.timeoutMs || 31000)
      })
      const provider = await Promise.race([Promise.resolve().then(() => options.build(entry)), timeout])
      rows.set(entry.id, { ...provider, refreshState: provider.error ? 'error' : 'idle', refreshError: provider.error || null })
    } catch (error) {
      rows.set(entry.id, { ...(previousFor(entry, options.previousProviders) || placeholder(entry)), refreshState: 'error', refreshError: error.message || 'Provider refresh failed.', error: error.message || 'Provider refresh failed.', stale: true })
    } finally {
      clearTimeout(timer)
      pending.delete(entry.id)
      emit()
    }
  }))
  return state()
}

function failPending(snapshot, message) {
  if (!snapshot?.refresh?.inProgress) return snapshot
  const pending = new Set(snapshot.refresh.pendingProviderIds || [])
  return { ...snapshot, refresh: { ...snapshot.refresh, inProgress: false, pendingProviderIds: [] }, providers: (snapshot.providers || []).map((provider) => pending.has(provider.id) ? { ...provider, refreshState: 'error', refreshError: message, error: message, stale: true } : provider) }
}

function restoreCachedRefresh(snapshot, nextRefreshAt) {
  if (!snapshot) return null
  const familyOf = (provider) => provider.providerFamily || provider.id.split('@')[0]
  const accountFamilies = new Set((snapshot.providers || []).filter((provider) => provider.id !== familyOf(provider)).map(familyOf))
  const providers = (snapshot.providers || [])
    .filter((provider) => !(provider.id === familyOf(provider) && accountFamilies.has(provider.id)))
    .map((provider) => ({ ...provider, refreshState: provider.error ? 'error' : 'idle', refreshError: provider.error || null }))
  return { ...snapshot, providers, enabledProviderIds: providers.map((provider) => provider.id), refresh: { inProgress: false, pendingProviderIds: [], nextRefreshAt } }
}

module.exports = { collect, previousFor, placeholder, failPending, restoreCachedRefresh }
