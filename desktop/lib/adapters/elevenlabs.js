const { getKey } = require('../secrets')
const { fetchWithTimeout } = require('../http')

const DEFAULT_BASE = 'https://api.elevenlabs.io'

function clean(value) {
  let text = String(value || '').trim()
  if (!text) return null
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim()
  }
  return text.trim() || null
}

function resolveKey() {
  return clean(process.env.ELEVENLABS_API_KEY) || clean(process.env.XI_API_KEY) || clean(getKey('elevenlabs'))
}

function baseURL() {
  const raw = clean(process.env.ELEVENLABS_API_URL)
  if (!raw) return DEFAULT_BASE
  try {
    const url = new URL(raw)
    return url.toString().replace(/\/$/, '')
  } catch {
    return DEFAULT_BASE
  }
}

function subscriptionURL(base = DEFAULT_BASE) {
  const normalized = String(base || DEFAULT_BASE).replace(/\/$/, '')
  return normalized.endsWith('/v1') ? `${normalized}/user/subscription` : `${normalized}/v1/user/subscription`
}

function num(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function parseUsage(json, now = Date.now()) {
  const characterCount = Math.max(0, num(json?.character_count ?? json?.characterCount) ?? 0)
  const characterLimit = Math.max(0, num(json?.character_limit ?? json?.characterLimit) ?? 0)
  const voiceSlotsUsed = num(json?.voice_slots_used ?? json?.voiceSlotsUsed)
  const voiceLimit = num(json?.voice_limit ?? json?.voiceLimit)
  const professionalVoiceSlotsUsed = num(json?.professional_voice_slots_used ?? json?.professionalVoiceSlotsUsed)
  const professionalVoiceLimit = num(json?.professional_voice_limit ?? json?.professionalVoiceLimit)
  const resetUnix = num(json?.next_character_count_reset_unix ?? json?.nextCharacterCountResetUnix)
  const overage = json?.current_overage ?? json?.currentOverage ?? null
  const usedPct = characterLimit > 0 ? Math.max(0, (characterCount / characterLimit) * 100) : 0

  return {
    connected: true,
    tier: clean(json?.tier),
    status: clean(json?.status),
    characterCount,
    characterLimit,
    remainingCharacters: Math.max(0, characterLimit - characterCount),
    usedPct,
    voiceSlotsUsed,
    voiceLimit,
    professionalVoiceSlotsUsed,
    professionalVoiceLimit,
    overageAmount: overage && typeof overage === 'object' ? clean(overage.amount) : null,
    overageCurrency: overage && typeof overage === 'object' ? clean(overage.currency) : null,
    resetAt: resetUnix ? resetUnix * 1000 : null,
    lastActive: now,
  }
}

async function read() {
  const key = resolveKey()
  if (!key) return { connected: false }
  try {
    const res = await fetchWithTimeout(
      subscriptionURL(baseURL()),
      {
        headers: {
          'xi-api-key': key,
          Accept: 'application/json',
        },
      },
      15000,
    )
    const text = await res.text()
    if (res.status === 401 || res.status === 403) return { connected: false, error: 'ElevenLabs API key rejected' }
    if (!res.ok) return { connected: false, error: `ElevenLabs HTTP ${res.status}` }
    try {
      return parseUsage(JSON.parse(text))
    } catch {
      return { connected: false, error: 'Could not parse ElevenLabs subscription response' }
    }
  } catch (err) {
    return { connected: false, error: err && err.message ? err.message : String(err) }
  }
}

module.exports = {
  read,
  _private: {
    parseUsage,
    resolveKey,
    subscriptionURL,
  },
}
