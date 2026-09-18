function bindLegacyLayouts(config, providers) {
  const next = { ...config, accountLayoutBindings: { ...config.accountLayoutBindings }, metricLayouts: { ...config.metricLayouts }, trayPins: [...(config.trayPins || [])], expandedProviderIds: [...(config.expandedProviderIds || [])], providerOrder: [...(config.providerOrder || [])] }
  let changed = false
  for (const family of ['claude', 'codex']) {
    if (next.accountLayoutBindings[family]) continue
    const candidates = (providers || []).filter((p) => p.providerFamily === family && new RegExp(`^${family}@[0-9a-f]{12}$`).test(p.id) && p.connected)
    const provider = candidates.find((p) => p.account?.isDefault) || (candidates.length === 1 ? candidates[0] : null)
    if (!provider) continue
    const id = provider.id
    const rewrite = (metricId) => typeof metricId === 'string' && metricId.startsWith(`${family}:`) ? `${id.replace('@', '-')}:${metricId.slice(family.length + 1)}` : metricId
    const layout = next.metricLayouts[family]
    if (layout && !next.metricLayouts[id]) next.metricLayouts[id] = Object.fromEntries(Object.entries(layout).map(([key, value]) => [key, Array.isArray(value) ? value.map(rewrite) : value]))
    delete next.metricLayouts[family]
    next.trayPins = next.trayPins.map((pin) => pin.providerId === family ? { ...pin, providerId: id, metricId: rewrite(pin.metricId) } : pin)
    next.expandedProviderIds = [...new Set(next.expandedProviderIds.map((value) => value === family ? id : value))]
    next.providerOrder = [...new Set(next.providerOrder.flatMap((value) => value === family ? [id, family] : [value]))]
    next.accountLayoutBindings[family] = id
    changed = true
  }
  return { config: next, changed }
}

module.exports = { bindLegacyLayouts }
