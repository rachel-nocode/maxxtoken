// Token Coach session collector — turns local agent logs into the rule input
// contract: { sessions, windowSamples, limitContext }.
//
// Sources (DATA_AUDIT.md):
//   Claude Code  ~/.claude/projects/**/*.jsonl  via adapters/claude._private
//   Codex        ~/.codex/sessions/**/rollout-*.jsonl  (own line scan: the
//                adapter's snapshot parser drops rate_limits, reasoning
//                tokens, and effort, all of which the rules need)
//   Claude windows  ~/.maxxtoken/usage-history.json samples (empty until
//                DATA_GAPS G3 is fixed — R4 is Codex-only meanwhile)
//
// Honesty notes:
//   - Claude turns carry no clean effort/prompt-length fields (G2), so they
//     are omitted; R2 then skips Claude sessions rather than guessing.
//   - limitContext.tokensPerPct is an observed median of token-delta over
//     weekly-percent-delta between Codex rate_limit samples (G7). If fewer
//     than MIN_RATE_PAIRS clean pairs exist, limitContext is null and
//     verdict cost lines fall back to plain token counts.

const fs = require('fs')

const claudeAdapter = require('../adapters/claude')
const codexAdapter = require('../adapters/codex')
const usageHistory = require('../usage-history')

const DAY_MS = 86_400_000
const MIN_RATE_PAIRS = 2
const MIN_PCT_DELTA = 0.5

function num(value) {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

// ---------- Claude ----------------------------------------------------------

function collectClaudeSessions({ files, sinceMs }) {
  const { parseClaudeTokenUsageFromText } = claudeAdapter._private
  const seen = new Map() // messageId:requestId -> true (cross-file dedupe)
  const sessions = new Map()

  for (const file of files) {
    let text
    try {
      text = fs.readFileSync(file, 'utf8')
    } catch {
      continue
    }
    for (const row of parseClaudeTokenUsageFromText(text, file)) {
      if (row.when < sinceMs) continue
      const key = row.messageId && row.requestId ? `${row.messageId}:${row.requestId}` : null
      if (key) {
        if (seen.has(key)) continue
        seen.set(key, true)
      }
      const sessionId = row.sessionId || `file:${file}`
      const session =
        sessions.get(sessionId) ||
        sessions.set(sessionId, { sessionId, agentType: 'claude-code', requests: [] }).get(sessionId)
      session.requests.push({
        when: row.when,
        inputTokens: num(row.uncachedInput),
        cacheReadTokens: num(row.cacheRead),
        cacheCreationTokens: num(row.cacheCreation),
        outputTokens: num(row.output),
        model: row.model,
        // effort/promptChars intentionally absent (G2) — R2 skips these turns.
      })
    }
  }
  return [...sessions.values()]
}

// ---------- Codex -----------------------------------------------------------

function effortFrom(payload) {
  const raw = payload?.effort ?? payload?.reasoning_effort ?? payload?.model_reasoning_effort
  if (typeof raw === 'string' && raw.trim()) return raw.trim().toLowerCase()
  if (raw && typeof raw === 'object' && typeof raw.level === 'string') return raw.level.toLowerCase()
  return null
}

function promptCharsFrom(payload) {
  if (payload?.type !== 'message' || payload?.role !== 'user') return null
  const content = Array.isArray(payload.content) ? payload.content : []
  let chars = 0
  for (const part of content) {
    if (part && typeof part.text === 'string') chars += part.text.length
  }
  return chars
}

function parseCodexRollout(text, fallbackSessionId) {
  let sessionId = null
  let effort = null
  let promptChars = null
  let prevTotal = null
  const requests = []
  const windowSamples = []
  const ratePoints = [] // { when, weeklyPct, cumTokens }
  let cumTokens = 0

  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line) continue
    let row
    try {
      row = JSON.parse(line)
    } catch {
      continue // corrupted line — skip, never abort the file
    }
    // Row kind lives on row.type for session_meta / turn_context /
    // response_item; token_count arrives as row.type=event_msg with
    // payload.type=token_count (verified against real rollouts).
    const payload = row.payload && typeof row.payload === 'object' ? row.payload : row

    if (row.type === 'session_meta') {
      sessionId = sessionId || payload.id || payload.session_id || null
      continue
    }
    if (row.type === 'turn_context') {
      const found = effortFrom(payload)
      if (found) effort = found
      continue
    }
    if (row.type === 'response_item') {
      const chars = promptCharsFrom(payload)
      if (chars != null) promptChars = chars
      continue
    }
    if (payload.type !== 'token_count') continue

    const when = Date.parse(row.timestamp || payload.timestamp || '')
    if (!Number.isFinite(when)) continue
    const info = payload.info && typeof payload.info === 'object' ? payload.info : {}

    const last = info.last_token_usage
    const total = info.total_token_usage
    let usage = null
    if (last && typeof last === 'object') {
      usage = last
    } else if (total && typeof total === 'object') {
      // Only cumulative totals on this event — derive the per-turn delta.
      const prev = prevTotal || { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0 }
      usage = {
        input_tokens: num(total.input_tokens) - num(prev.input_tokens),
        cached_input_tokens: num(total.cached_input_tokens) - num(prev.cached_input_tokens),
        output_tokens: num(total.output_tokens) - num(prev.output_tokens),
        reasoning_output_tokens: num(total.reasoning_output_tokens) - num(prev.reasoning_output_tokens),
      }
    }
    if (total && typeof total === 'object') prevTotal = total

    if (usage) {
      const cached = num(usage.cached_input_tokens)
      const input = Math.max(0, num(usage.input_tokens) - cached) // cached ⊂ input_tokens
      const output = num(usage.output_tokens)
      const reasoning = num(usage.reasoning_output_tokens)
      if (input + cached + output > 0) {
        requests.push({
          when,
          inputTokens: input,
          cacheReadTokens: cached,
          cacheCreationTokens: 0, // Codex emits no cache-write counter (G1)
          outputTokens: output,
          reasoningTokens: reasoning,
          effort,
          promptChars,
        })
        cumTokens += input + cached + output
        promptChars = null // consumed by this turn
      }
    }

    const limits = payload.rate_limits
    if (limits && typeof limits === 'object') {
      const windows = [
        { raw: limits.primary, windowKind: '5h' },
        { raw: limits.secondary, windowKind: '7d' },
      ]
      for (const { raw, windowKind } of windows) {
        if (!raw || typeof raw !== 'object') continue
        const usedPct = Number(raw.used_percent)
        if (!Number.isFinite(usedPct)) continue
        const resetsAt = Number(raw.resets_at)
        windowSamples.push({
          when,
          agentType: 'codex',
          windowKind,
          usedPct,
          resetAt: Number.isFinite(resetsAt) ? (resetsAt < 1e12 ? resetsAt * 1000 : resetsAt) : null,
        })
        if (windowKind === '7d') ratePoints.push({ when, weeklyPct: usedPct, cumTokens })
      }
    }
  }

  return { sessionId: sessionId || fallbackSessionId, requests, windowSamples, ratePoints }
}

function collectCodexSessions({ files, sinceMs }) {
  const sessions = []
  const windowSamples = []
  const ratePairs = []

  for (const file of files) {
    let text
    try {
      text = fs.readFileSync(file, 'utf8')
    } catch {
      continue
    }
    const fallback = `file:${file}`
    const parsed = parseCodexRollout(text, fallback)
    const requests = parsed.requests.filter((r) => r.when >= sinceMs)
    if (requests.length) {
      sessions.push({ sessionId: parsed.sessionId, agentType: 'codex', requests })
    }
    windowSamples.push(...parsed.windowSamples.filter((s) => s.when >= sinceMs))

    // Observed tokens-per-weekly-percent pairs (G7) from this rollout.
    const points = parsed.ratePoints
    for (let i = 1; i < points.length; i++) {
      const pctDelta = points[i].weeklyPct - points[i - 1].weeklyPct
      const tokenDelta = points[i].cumTokens - points[i - 1].cumTokens
      if (pctDelta >= MIN_PCT_DELTA && tokenDelta > 0) {
        ratePairs.push(tokenDelta / pctDelta)
      }
    }
  }
  return { sessions, windowSamples, ratePairs }
}

// ---------- Claude window samples (usage-history) ---------------------------

function collectClaudeWindowSamples({ sinceMs, historyFile }) {
  let history
  try {
    history = usageHistory.readHistory(historyFile || usageHistory.FILE)
  } catch {
    return []
  }
  const samples = []
  for (const sample of history.samples || []) {
    if (String(sample.providerId) !== 'claude') continue
    const when = Number(sample.capturedAt)
    if (!Number.isFinite(when) || when < sinceMs) continue
    const kind = sample.kind === '7d' || Number(sample.periodMs) > 6 * DAY_MS ? '7d' : '5h'
    samples.push({
      when,
      agentType: 'claude-code',
      windowKind: kind,
      usedPct: Number(sample.usedPct),
      resetAt: Number(sample.resetAt) || null,
    })
  }
  return samples
}

// ---------- limitContext (G7 empirics) --------------------------------------

function median(values) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function buildLimitContext(ratePairs, sessions, now) {
  if (ratePairs.length < MIN_RATE_PAIRS) return null
  const tokensPerPct = median(ratePairs)
  if (!tokensPerPct || tokensPerPct <= 0) return null

  let firstWhen = Infinity
  let lastWhen = 0
  let totalTokens = 0
  for (const session of sessions) {
    for (const request of session.requests) {
      firstWhen = Math.min(firstWhen, request.when)
      lastWhen = Math.max(lastWhen, request.when)
      totalTokens +=
        num(request.inputTokens) + num(request.cacheReadTokens) + num(request.cacheCreationTokens) + num(request.outputTokens)
    }
  }
  const hours = Math.max(1, (Math.min(lastWhen, now) - firstWhen) / 3_600_000)
  const tokensPerHour = totalTokens > 0 && Number.isFinite(hours) ? totalTokens / hours : null

  return {
    tokensPerPct: Math.round(tokensPerPct),
    tokensPerHour: tokensPerHour ? Math.round(tokensPerHour) : null,
    periodLabel: 'weekly limit',
    source: `observed from ${ratePairs.length} Codex rate-limit deltas`,
  }
}

// ---------- entry ------------------------------------------------------------

function collectCoachInput(options = {}) {
  const now = Number(options.now) || Date.now()
  const historyDays = Math.max(1, Math.min(30, Number(options.historyDays) || 7))
  const sinceMs = now - historyDays * DAY_MS

  const claudeFiles =
    options.claudeFiles ||
    claudeAdapter._private.claudeLogFiles(claudeAdapter._private.claudeProjectsRoots(), sinceMs)
  const codexFiles =
    options.codexFiles || codexAdapter._private.rolloutFiles({ limit: Infinity, sinceMs })

  const claudeSessions = collectClaudeSessions({ files: claudeFiles, sinceMs })
  const codex = collectCodexSessions({ files: codexFiles, sinceMs })
  const claudeSamples = collectClaudeWindowSamples({ sinceMs, historyFile: options.historyFile })

  const sessions = [...claudeSessions, ...codex.sessions]
  return {
    sessions,
    windowSamples: [...codex.windowSamples, ...claudeSamples],
    limitContext: buildLimitContext(codex.ratePairs, sessions, now),
    meta: {
      historyDays,
      claudeSessions: claudeSessions.length,
      codexSessions: codex.sessions.length,
      windowSamples: codex.windowSamples.length + claudeSamples.length,
      claudeFiles: claudeFiles.length,
      codexFiles: codexFiles.length,
    },
  }
}

module.exports = {
  collectCoachInput,
  _private: {
    collectClaudeSessions,
    collectCodexSessions,
    collectClaudeWindowSamples,
    parseCodexRollout,
    buildLimitContext,
    median,
  },
}
