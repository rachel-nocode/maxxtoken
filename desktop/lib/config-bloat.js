/* config-bloat — MAIN-PROCESS filesystem scan for the "bloated config" Optimize
   signal (#6). Reads the instruction files + MCP config that a coding agent
   re-sends on EVERY message, and estimates the per-turn token tax.

   This is the ONLY I/O half of the feature. It runs where the snapshot is built
   (aggregate.js) and attaches a plain `configScan` object to each provider. The
   detector that turns that into a Signal lives in optimize-detect.js and stays
   pure (no fs) so it still runs in the renderer + CLI.

   What we read (local only, never written):
     claude → $CLAUDE_CONFIG_DIR/CLAUDE.md (or ~/.claude/CLAUDE.md) + the global
              mcpServers map in ~/.claude.json
     codex  → ~/.codex/AGENTS.md + the [mcp_servers.*] tables in
              ~/.codex/config.toml

   Estimates are deliberately rough and labelled as such in the UI:
     - tokens ≈ chars / 4  (standard BPE rule of thumb)
     - each connected MCP server ≈ a flat per-turn overhead (server descriptor +
       typical tool schemas). Real cost varies wildly by tool count; we use a
       conservative flat number rather than connecting to count tools. */

const fs = require('fs')
const os = require('os')
const path = require('path')

const TOKENS_PER_CHAR = 0.25 // ~4 chars / token
// Flat per-turn overhead for one connected MCP server: server descriptor + a
// typical handful of tool schemas. Conservative; a 90-tool server is far worse.
const MCP_TOKENS_PER_SERVER = 1200

function homePath(...parts) {
  return path.join(os.homedir(), ...parts)
}

function safeRead(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8')
  } catch (_e) {
    return null
  }
}

// → { name, path, lines, chars, estTokens } or null when the file is absent.
function statInstrFile(filePath, name) {
  const text = safeRead(filePath)
  if (text == null) return null
  const lines = text.length ? text.split('\n').length : 0
  return {
    name,
    path: filePath,
    lines,
    chars: text.length,
    estTokens: Math.round(text.length * TOKENS_PER_CHAR),
  }
}

// global MCP servers Claude Code loads = top-level mcpServers in ~/.claude.json
function claudeMcpCount() {
  const text = safeRead(homePath('.claude.json'))
  if (!text) return 0
  try {
    const json = JSON.parse(text)
    return json && json.mcpServers && typeof json.mcpServers === 'object'
      ? Object.keys(json.mcpServers).length
      : 0
  } catch (_e) {
    return 0
  }
}

// MCP servers Codex loads = [mcp_servers.NAME] tables in config.toml
function codexMcpCount(text) {
  if (!text) return 0
  const matches = text.match(/^\s*\[mcp_servers\.[^\]]+\]/gm)
  return matches ? matches.length : 0
}

// Root-level Codex settings = the keys before the first [table] header (TOML
// puts root keys above all sections). These are the DEFAULTS every task uses.
// → { model, effort, planEffort } with absent keys left undefined.
function parseCodexRootSettings(text) {
  const out = { model: null, effort: null, planEffort: null }
  if (!text) return out
  const grab = (line, key) => {
    const m = line.match(new RegExp(`^\\s*${key}\\s*=\\s*["']?([\\w.-]+)["']?`))
    return m ? m[1] : null
  }
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*$/, '')
    if (/^\s*\[/.test(line)) break // reached the first [section] — root keys done
    out.model = out.model || grab(line, 'model')
    out.effort = out.effort || grab(line, 'model_reasoning_effort')
    out.planEffort = out.planEffort || grab(line, 'plan_mode_reasoning_effort')
  }
  return out
}

// Assemble a scan from an instruction file, MCP server count, and (optional)
// root settings. Returns null only when there's genuinely nothing to report.
function buildScan({ instr, mcpServers, settings }) {
  const hasBloat = !!instr || mcpServers > 0
  const hasSettings = !!(settings && (settings.effort || settings.planEffort))
  if (!hasBloat && !hasSettings) return null
  const instrTokens = instr ? instr.estTokens : 0
  const mcpTokens = mcpServers * MCP_TOKENS_PER_SERVER
  return {
    instrFile: instr ? instr.name : null,
    instrPath: instr ? instr.path : null,
    instrLines: instr ? instr.lines : 0,
    instrTokens,
    mcpServers,
    mcpTokens,
    estTokensPerTurn: instrTokens + mcpTokens,
    files: instr ? [instr] : [],
    settings: settings || null,
  }
}

function scanClaude() {
  const dir = process.env.CLAUDE_CONFIG_DIR || homePath('.claude')
  const instr = statInstrFile(path.join(dir, 'CLAUDE.md'), 'CLAUDE.md')
  return buildScan({ instr, mcpServers: claudeMcpCount(), settings: null })
}

function scanCodex() {
  const codexHome = process.env.CODEX_HOME || homePath('.codex')
  const instr = statInstrFile(path.join(codexHome, 'AGENTS.md'), 'AGENTS.md')
  const cfgText = safeRead(path.join(codexHome, 'config.toml'))
  return buildScan({
    instr,
    mcpServers: codexMcpCount(cfgText),
    settings: parseCodexRootSettings(cfgText),
  })
}

const SCANNERS = {
  claude: scanClaude,
  codex: scanCodex,
}

// scanConfigBloat(providerId) → scan object (attached to provider.configScan) or
// null when the provider has no scanner / nothing to report. Never throws.
function scanConfigBloat(providerId) {
  const fn = SCANNERS[providerId]
  if (!fn) return null
  try {
    return fn()
  } catch (_e) {
    return null
  }
}

module.exports = {
  scanConfigBloat,
  // exposed for tuning / tests
  MCP_TOKENS_PER_SERVER,
  TOKENS_PER_CHAR,
  _scanners: { scanClaude, scanCodex },
}
