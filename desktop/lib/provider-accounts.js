const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

const ACCOUNT_FAMILIES = new Set(['claude', 'codex'])

function clean(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || null
}

function expandHome(value, home = os.homedir()) {
  const text = clean(value)
  if (!text) return null
  if (text === '~') return home
  return text.startsWith('~/') ? path.join(home, text.slice(2)) : path.resolve(text)
}

function identityDigest(identityKey) {
  return crypto.createHash('sha256').update(String(identityKey).trim().toLowerCase()).digest('hex')
}

function instanceId(family, identityKey) {
  if (!ACCOUNT_FAMILIES.has(family) || !clean(identityKey)) return family
  return `${family}@${identityDigest(identityKey).slice(0, 12)}`
}

function providerFamily(id) {
  const family = String(id || '').split('@')[0]
  return ACCOUNT_FAMILIES.has(family) ? family : String(id || '')
}

function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function jwtPayload(token) {
  const parts = String(token || '').split('.')
  if (parts.length < 2) return null
  try {
    const encoded = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(Buffer.from(encoded + '='.repeat((4 - encoded.length % 4) % 4), 'base64').toString('utf8'))
  } catch {
    return null
  }
}

function claudeDefaultHome(env = process.env, home = os.homedir()) {
  const configured = clean(env.CLAUDE_CONFIG_DIR)
  if (configured && !configured.includes(',')) return expandHome(configured, home)
  return path.join(home, '.claude')
}

function claudeState(homeDir, home = os.homedir()) {
  const defaultHome = path.join(home, '.claude')
  const file = path.resolve(homeDir) === path.resolve(defaultHome)
    ? path.join(home, '.claude.json')
    : path.join(homeDir, '.claude.json')
  const account = readJSON(file)?.oauthAccount
  const accountId = clean(account?.accountUuid)?.toLowerCase()
  const organizationId = clean(account?.organizationUuid)?.toLowerCase()
  if (!accountId) return null
  const identityKey = organizationId ? `${accountId}|${organizationId}` : accountId
  return {
    identityKey,
    accountId,
    organizationId,
    organizationName: clean(account?.organizationName),
    email: clean(account?.emailAddress),
  }
}

function claudeSwapAccounts(home = os.homedir()) {
  const root = path.join(home, '.claude-swap-backup')
  const sequence = readJSON(path.join(root, 'sequence.json'))
  const accounts = sequence?.accounts && typeof sequence.accounts === 'object' ? sequence.accounts : {}
  return Object.keys(accounts).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).flatMap((slot) => {
    const raw = accounts[slot]
    const accountId = clean(raw?.uuid)?.toLowerCase()
    const organizationId = clean(raw?.organizationUuid)?.toLowerCase()
    const email = clean(raw?.email)
    if (!/^\d+$/.test(slot) || !accountId || !organizationId || !email || /[\/\\\0]/.test(email)) return []
    const slug = email.normalize().replace(/[^A-Za-z0-9._-]/g, '_')
    return [{
      identityKey: `${accountId}|${organizationId}`,
      accountId,
      organizationId,
      organizationName: clean(raw.organizationName),
      email,
      swapSlot: slot,
      swapRoot: root,
      authHome: path.join(root, 'sessions', `${slot}-${slug}`),
    }]
  })
}

function discoverClaudeAccounts(options = {}) {
  const env = options.env || process.env
  const home = options.home || os.homedir()
  const defaultHome = claudeDefaultHome(env, home)
  const observed = []
  const defaultState = claudeState(defaultHome, home)
  if (defaultState) observed.push({ ...defaultState, authHome: defaultHome, isDefault: true, sourceKinds: ['defaultHome'] })
  for (const swap of claudeSwapAccounts(home)) {
    const existing = observed.find((item) => item.identityKey === swap.identityKey)
    if (existing) {
      existing.sourceKinds.push('claudeSwap')
      existing.swap = swap
    } else {
      observed.push({ ...swap, isDefault: false, sourceKinds: ['claudeSwap'], swap })
    }
  }
  try {
    const desktop = require('./claude-desktop-auth')
    const desktopConfig = desktop.readConfig(home)
    const accountId = clean(desktopConfig?.lastKnownAccountUuid)?.toLowerCase()
    if (accountId && (desktopConfig?.['oauth:tokenCacheV2'] || desktopConfig?.['oauth:tokenCache'])) {
      for (const organizationId of desktop.desktopOrganizations(home, accountId)) {
        const identityKey = `${accountId}|${organizationId}`
        const existing = observed.find((item) => item.identityKey === identityKey)
        if (existing) {
          if (!existing.sourceKinds.includes('claudeDesktop')) existing.sourceKinds.push('claudeDesktop')
        } else {
          observed.push({ identityKey, accountId, organizationId, authHome: null, isDefault: false, sourceKinds: ['claudeDesktop'], desktopOnly: true })
        }
      }
    }
  } catch {
    /* Desktop is an optional read-only source. */
  }
  return observed.map((item) => {
    const id = instanceId('claude', item.identityKey)
    const label = item.organizationName || `Account ${id.slice(-6)}`
    return { ...item, id, family: 'claude', label, identityStamp: identityDigest(item.identityKey), allowsUnattributedHistory: observed.length === 1 }
  })
}

function codexAuthIdentity(auth) {
  const tokens = auth?.tokens || {}
  const claims = jwtPayload(tokens.id_token)
  const authClaim = claims?.['https://api.openai.com/auth'] || {}
  const accountId = clean(tokens.account_id || authClaim.chatgpt_account_id || claims?.chatgpt_account_id)?.toLowerCase()
  if (!accountId) return null
  return { identityKey: accountId, accountId, email: clean(claims?.email) }
}

function codexDefaultHomes(env = process.env, home = os.homedir()) {
  const configured = clean(env.CODEX_HOME)
  return configured ? [expandHome(configured, home)] : [path.join(home, '.config', 'codex'), path.join(home, '.codex')]
}

function codexSwapRoot(env = process.env, home = os.homedir()) {
  if (clean(env.XSWAP_HOME)) return expandHome(env.XSWAP_HOME, home)
  if (clean(env.XDG_DATA_HOME)?.startsWith('/')) return path.join(env.XDG_DATA_HOME, 'codex-swap')
  return path.join(home, '.local', 'share', 'codex-swap')
}

function codexSwapAccounts(env = process.env, home = os.homedir()) {
  const registry = readJSON(path.join(codexSwapRoot(env, home), 'accounts.json'))
  if (Number(registry?.schema_version ?? registry?.schemaVersion) !== 1 || !Array.isArray(registry?.accounts)) return []
  const mainHome = expandHome(registry.main_home || registry.mainHome, home)
  return registry.accounts.flatMap((raw) => {
    const accountId = clean(raw?.identity?.account_id || raw?.identity?.accountId)?.toLowerCase()
    const authHome = expandHome(raw?.home, home)
    if (!accountId || !authHome) return []
    return [{
      identityKey: accountId,
      accountId,
      email: clean(raw.identity?.email),
      alias: clean(raw.alias),
      plan: clean(raw.identity?.plan),
      authHome,
      mainHome,
    }]
  })
}

function codexKeychainIdentity() {
  try {
    let raw = execFileSync('security', ['find-generic-password', '-w', '-s', 'Codex Auth'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000,
    }).trim()
    if (/^[0-9a-f]+$/i.test(raw) && raw.length % 2 === 0) raw = Buffer.from(raw, 'hex').toString('utf8')
    return codexAuthIdentity(JSON.parse(raw))
  } catch {
    return null
  }
}

function discoverCodexAccounts(options = {}) {
  const env = options.env || process.env
  const home = options.home || os.homedir()
  const observed = []
  for (const authHome of codexDefaultHomes(env, home)) {
    const identity = codexAuthIdentity(readJSON(path.join(authHome, 'auth.json')))
    if (!identity) continue
    observed.push({ ...identity, authHomes: [authHome], logHomes: [authHome], isDefault: true, sourceKinds: ['defaultHome'] })
    break
  }
  const keychain = options.skipKeychain ? null : codexKeychainIdentity()
  if (keychain) {
    const existing = observed.find((item) => item.identityKey === keychain.identityKey)
    if (existing) {
      if (!existing.sourceKinds.includes('keychain')) existing.sourceKinds.push('keychain')
    } else {
      observed.push({ ...keychain, authHomes: [], logHomes: [], isDefault: observed.length === 0, sourceKinds: ['keychain'] })
    }
  }
  for (const swap of codexSwapAccounts(env, home)) {
    const existing = observed.find((item) => item.identityKey === swap.identityKey)
    if (existing) {
      existing.authHomes.push(swap.authHome)
      existing.logHomes.push(swap.authHome)
      existing.sourceKinds.push('codexSwap')
      existing.alias ||= swap.alias
      existing.plan ||= swap.plan
    } else {
      observed.push({ ...swap, authHomes: [swap.authHome], logHomes: [swap.authHome], isDefault: false, sourceKinds: ['codexSwap'] })
    }
  }
  return observed.map((item) => {
    const id = instanceId('codex', item.identityKey)
    return {
      ...item,
      id,
      family: 'codex',
      label: item.alias || `Workspace ${id.slice(-6)}`,
      identityStamp: identityDigest(item.identityKey),
      allowsUnattributedHistory: observed.length === 1,
    }
  })
}

function discoverProviderAccounts(options = {}) {
  return [...discoverClaudeAccounts(options), ...discoverCodexAccounts(options)]
}

function publicAccount(account) {
  if (!account) return null
  return {
    id: account.id,
    label: account.label || null,
    isDefault: account.isDefault === true,
    sourceKinds: [...new Set(account.sourceKinds || [])],
  }
}

function sameAccount(left, right) {
  return Boolean(left?.identityStamp && right?.identityStamp && left.identityStamp === right.identityStamp)
}

function guardCachedSnapshotAccounts(snapshot, discoveredAccounts) {
  if (!snapshot || typeof snapshot !== 'object') return null
  const freshById = new Map((Array.isArray(discoveredAccounts) ? discoveredAccounts : [])
    .filter((account) => account?.id && account?.identityStamp)
    .map((account) => [account.id, account]))
  for (const provider of Array.isArray(snapshot.providers) ? snapshot.providers : []) {
    const family = providerFamily(provider?.providerFamily || provider?.id)
    if (!ACCOUNT_FAMILIES.has(family)) continue
    const fresh = freshById.get(provider.id)
    if (!fresh || provider.account?.id !== provider.id || !sameAccount(provider.account, fresh)) return null
  }
  return snapshot
}

module.exports = {
  ACCOUNT_FAMILIES,
  instanceId,
  providerFamily,
  identityDigest,
  discoverClaudeAccounts,
  discoverCodexAccounts,
  discoverProviderAccounts,
  publicAccount,
  sameAccount,
  guardCachedSnapshotAccounts,
  _private: {
    claudeDefaultHome,
    claudeState,
    claudeSwapAccounts,
    codexAuthIdentity,
    codexDefaultHomes,
    codexSwapAccounts,
    codexKeychainIdentity,
    jwtPayload,
  },
}
