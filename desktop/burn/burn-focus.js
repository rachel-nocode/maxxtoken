/* Stable focus identity across BURN's string-template re-renders.
   UMD: browser global BurnFocus + CommonJS export for tests. */
(function (root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  if (root) root.BurnFocus = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const IDENTITY_ATTRIBUTES = [
    'data-burn-report-metric', 'data-burn-report-period', 'data-burn-report-models',
    'data-burn-display-toggle', 'data-burn-toggle', 'data-burn-collapse',
    'data-burn-select', 'data-burn-action', 'data-burn-provider-action',
    'data-burn-metric-action', 'data-burn-credit', 'data-burn-share',
    'data-burn-share-redact', 'data-burn-nav', 'data-burn-row',
    'data-burn-shortcut', 'data-burn-shortcut-clear', 'data-burn-cookie',
    'data-burn-license-key', 'data-burn-goal', 'data-coach-toggle',
  ]

  function scopeIdentity(element) {
    const provider = element?.closest?.('[data-burn-prov]')
    if (provider) return { attr: 'data-burn-prov', value: provider.getAttribute('data-burn-prov') || '' }
    const setting = element?.closest?.('[data-burn-drag]')
    if (setting) return { attr: 'data-burn-drag', value: setting.getAttribute('data-burn-drag') || '' }
    return null
  }

  function selectionIdentity(element) {
    if (!element || !['INPUT', 'TEXTAREA'].includes(String(element.tagName || '').toUpperCase())) return null
    if (!Number.isInteger(element.selectionStart) || !Number.isInteger(element.selectionEnd)) return null
    return {
      start: element.selectionStart,
      end: element.selectionEnd,
      direction: element.selectionDirection || 'none',
    }
  }

  function capture(container, element) {
    if (!container || !element || element === container || !container.contains?.(element)) return null
    const attr = IDENTITY_ATTRIBUTES.find((name) => element.hasAttribute?.(name)) || null
    const id = element.getAttribute?.('id') || null
    if (!id && !attr) return null
    const identity = {
      id,
      attr,
      value: attr ? element.getAttribute(attr) || '' : null,
      tag: String(element.tagName || '').toUpperCase(),
      scope: scopeIdentity(element),
      selection: selectionIdentity(element),
    }
    identity.ordinal = matchingCandidates(container, identity).indexOf(element)
    return identity
  }

  function sameScope(element, scope) {
    const actual = scopeIdentity(element)
    if (!scope) return !actual
    return !!actual && actual.attr === scope.attr && actual.value === scope.value
  }

  function matchingCandidates(container, identity) {
    if (!container || !identity) return []
    const candidates = identity.id
      ? Array.from(container.querySelectorAll?.('[id]') || []).filter((element) => element.getAttribute('id') === identity.id)
      : identity.attr
        ? Array.from(container.querySelectorAll?.(`[${identity.attr}]`) || []).filter((element) => (element.getAttribute(identity.attr) || '') === identity.value)
        : []
    return candidates.filter((element) => {
      if (identity.tag && String(element.tagName || '').toUpperCase() !== identity.tag) return false
      return sameScope(element, identity.scope)
    })
  }

  function find(container, identity) {
    const candidates = matchingCandidates(container, identity)
    const ordinal = Number.isInteger(identity?.ordinal) && identity.ordinal >= 0 ? identity.ordinal : 0
    const element = candidates[ordinal] || null
    if (!element || element.closest?.('[inert]') || element.closest?.('[aria-hidden="true"]') || element.disabled) return null
    return element
  }

  function restore(container, identity) {
    const element = find(container, identity)
    if (!element || typeof element.focus !== 'function') return false
    element.focus({ preventScroll: true })
    if (identity.selection && typeof element.setSelectionRange === 'function') {
      const length = String(element.value || '').length
      const start = Math.min(identity.selection.start, length)
      const end = Math.min(identity.selection.end, length)
      try { element.setSelectionRange(start, end, identity.selection.direction) } catch (error) {}
    }
    return true
  }

  return { capture, find, restore, IDENTITY_ATTRIBUTES }
})
