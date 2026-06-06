# Token &amp; Context Saving Repos — Research for the Optimize Page

Research dump of the top GitHub repos, skills, plugins, and techniques that help people save tokens and reduce context with AI coding agents (Claude Code, Cursor, Codex, Gemini CLI, Aider, OpenCode, etc.).

Star counts are approximate mid-2026 snapshots — verify before quoting in product copy.

**Honesty note for the UI:** output-style tricks (caveman) cut output-token prose ~60% but only ~4–5% of a whole session. The big session-wide wins come from tool-output compression, MCP schema compression, and retrieval-instead-of-full-files. Distinguish "tokens saved" from "dollars saved" (caching/model-routing cut cost, not tokens).

---

## Quick map — the 8 distinct mechanisms


| Mechanism                       | Lead tools                                   | Realistic win                        |
| ------------------------------- | -------------------------------------------- | ------------------------------------ |
| Output-style terseness          | caveman, claude-token-efficient              | ~60% of output prose (~4–5% session) |
| Tool-output compression proxy   | RTK                                          | 60–90% on shell command output       |
| MCP schema compression          | mcp-compressor                               | 70–97% of tool-schema tokens         |
| Data-format swap                | TOON                                         | 30–60% vs JSON on tabular data       |
| Retrieval instead of full files | claude-context, Aider repo-map, Token Savior | ~40–80% active tokens                |
| Session memory / compaction     | claude-mem, Claude DCP, /compact             | 60–80% on warm-up                    |
| Prompt compression libs         | LLMLingua                                    | up to 20x on the compressed segment  |
| Repo packing                    | Repomix, code2prompt                         | ~70% via tree-sitter compression     |


---

## 1. Output styles / terse communication (the "caveman" genre)

- **caveman** — [https://github.com/juliusbrussee/caveman](https://github.com/juliusbrussee/caveman) (~41k★, the canonical example)

  Skill that forces terse primitive-speech output. Drops articles/filler/pleasantries, keeps code + errors + technical terms verbatim. Levels lite/full/ultra. Works with Claude Code, Codex, Gemini CLI, Cursor, Windsurf, Cline, Copilot, 30+ agents. **Type: skill/plugin.** (Rachel already ships this skill in this env.)
- **caveman-output-style-claude-code** — [https://github.com/carlosduplar/caveman-output-style-claude-code](https://github.com/carlosduplar/caveman-output-style-claude-code)

  Always-on Claude Code output style, ~40% fewer output tokens. **Type: output style.**
- **claude-token-efficient** — [https://github.com/drona23/claude-token-efficient](https://github.com/drona23/claude-token-efficient) (~4.6–5.4k★)

  Single drop-in CLAUDE.md that keeps responses terse on heavy workflows. ~63% avg output-token cut. Caveat: the file costs input tokens every turn; net positive only when output is high. **Type: config/CLAUDE.md.**
- **ClaudePluginHub output styles** — [https://www.claudepluginhub.com/output-styles](https://www.claudepluginhub.com/output-styles)

  Marketplace of community output styles ("ultra-concise expert brevity by default"). **Type: marketplace.**
- **Terse built-in style (proposed)** — [https://github.com/anthropics/claude-code/issues/58600](https://github.com/anthropics/claude-code/issues/58600)

  Proposed 4th built-in output style. Custom markdown output styles already work today.

## 2. Repo packing tools (codebase → one prompt)

- **Repomix** — [https://github.com/yamadashy/repomix](https://github.com/yamadashy/repomix) (~22k★, genre leader)

  Packs a whole repo into one AI-friendly file (XML optimized for Claude). Tree-sitter compression (~70% token cut), per-file/whole-repo token counting, .gitignore-aware, runs local. **Type: CLI + MCP server + GitHub Action + Node lib.**
- **code2prompt** — [https://github.com/mufeedvh/code2prompt](https://github.com/mufeedvh/code2prompt) (Rust CLI)

  Codebase → single prompt with source tree, Handlebars templating, built-in token counting, git diff/log. **Type: CLI.**
- **files-to-prompt** — [https://github.com/simonw/files-to-prompt](https://github.com/simonw/files-to-prompt)

  Concatenates files/dirs into one prompt with path headers; Claude XML mode. **Type: CLI (Python).**
- **gitingest** — [https://github.com/cyclotruc/gitingest](https://github.com/cyclotruc/gitingest)

  Any git repo/URL → prompt-friendly digest with token/size estimates (swap github.com → gitingest.com). **Type: CLI + web + lib.**
- **repo2prompt** — [https://github.com/andrewgcodes/repo2prompt](https://github.com/andrewgcodes/repo2prompt)

  GitHub repo contents → big single prompt for long-context models. **Type: script/CLI.**

## 3. Retrieval / repo-map (inject only relevant snippets)

- **claude-context (Zilliz)** — [https://github.com/zilliztech/claude-context](https://github.com/zilliztech/claude-context)

  Makes a whole codebase searchable as context. ~40% token reduction at equal retrieval quality. Embeds codebase into Milvus/Zilliz, hybrid BM25 + dense vector search, injects only relevant snippets. Works with Claude Code, Cursor, VS Code, Windsurf, any MCP client. **Type: MCP server.**
- **Aider repo-map** — [https://aider.chat/docs/repomap.html](https://aider.chat/docs/repomap.html) (built into [https://github.com/Aider-AI/aider](https://github.com/Aider-AI/aider))

  Tree-sitter extracts signatures across 130+ langs, builds a reference graph, ranks with PageRank, binary-search fills a fixed token budget. Best-in-class "code map instead of full files." ~4.2× token efficiency on incremental refactors. **Type: built-in feature/technique.**
- **RepoMapper** — [https://github.com/pdavis68/RepoMapper](https://github.com/pdavis68/RepoMapper)

  Standalone port of Aider's repo-map, also an MCP server. **Type: CLI + MCP server.**
- **Token Savior** — [https://mibayy.github.io/token-savior/](https://mibayy.github.io/token-savior/)

  Gives the agent a structural codebase map. −80% active tokens, 97.9% vs 78.3% task success. Any MCP client. **Type: MCP repo-map.**
- **context-rag** — [https://github.com/karote00/context-rag](https://github.com/karote00/context-rag)

  Lightweight CLI for semantic RAG over project context, branch-aware caching. **Type: CLI.**
- **Anthropic Contextual Retrieval** — [https://www.anthropic.com/news/contextual-retrieval](https://www.anthropic.com/news/contextual-retrieval)

  Technique: prepend chunk-specific context before embedding + prompt caching, so less context is needed. **Type: technique (good education copy).**

## 4. Tool-output &amp; MCP token reducers

- **RTK (Rust Token Killer)** — [https://github.com/rtk-ai/rtk](https://github.com/rtk-ai/rtk) (~31k★, most relevant to maxxToken)

  Single Rust binary proxy that compresses shell-command output before it hits context. Smart filtering + grouping + truncation + dedup. `cargo test` 200+ lines → ~20; `git push` ~200 tok → ~10. 60–90% on common dev commands, &lt;10ms overhead, hook-based. `rtk gain` reports tokens saved. Works with Claude Code, Copilot, Cursor, Gemini CLI, Codex, Windsurf, Cline. **Type: CLI proxy + hooks.**
- **mcp-compressor (Atlassian Labs)** — [https://github.com/atlassian-labs/mcp-compressor](https://github.com/atlassian-labs/mcp-compressor)

  MCP proxy wrapping any MCP server, strips tool-description/enum/nested-schema overhead. 70–97% tool-schema token reduction without changing how the agent calls tools. (Each connected MCP server can cost ~18K tokens/turn.) **Type: MCP proxy.**
- **TOON — Token-Oriented Object Notation** — [https://github.com/toon-format/toon](https://github.com/toon-format/toon)

  Compact JSON-equivalent encoding: declare keys once, stream values, YAML indent + CSV-style tabular arrays. 30–60% fewer tokens than JSON (up to 53%), best for uniform object arrays. Lossless drop-in for tool I/O and RAG payloads. Often wired into Claude Code via a JSON→TOON hook. **Type: format + SDKs.**
- **Code execution with MCP (Anthropic pattern)** — [https://www.anthropic.com/engineering/code-execution-with-mcp](https://www.anthropic.com/engineering/code-execution-with-mcp)

  Replace many tool schemas + raw responses with one `execute_code` tool. 90–99% reduction for bulk ops. **Type: pattern.**
- **Tool Search / lazy tool loading (MCP SEP-1576)** — [https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1576](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1576)

  Agent queries for needed tools on demand vs loading all schemas upfront (exactly the deferred-tool/ToolSearch pattern in this env). 80–95% schema-token cut. **Type: technique.**

## 5. Context management for Claude Code / agents

- **claude-mem** — [https://github.com/thedotmack/claude-mem](https://github.com/thedotmack/claude-mem)

  Captures session activity, AI-compresses it, re-injects only relevant context into future sessions. Works with Claude Code, OpenClaw, Codex, Gemini, Copilot, OpenCode. **Type: hooks/plugin.**
- **Claude DCP (Dynamic Context Pruning)** — [https://github.com/exploreborders/claude-dcp](https://github.com/exploreborders/claude-dcp)

  Prunes conversation context mid-session to cut tokens. Port of OpenCode's dynamic-context-pruning. **Type: plugin/hooks.**
- **ContextStream** — [https://github.com/contextstream/claude-code](https://github.com/contextstream/claude-code)

  Hooks auto-load context on session start, inject smart per-message context, preserve state before compaction. **Type: hooks.**
- **Continuous-Claude-v3** — [https://github.com/parcadei/Continuous-Claude-v3](https://github.com/parcadei/Continuous-Claude-v3)

  Ledgers + handoffs maintain state across sessions; isolated context windows per agent. **Type: hooks + orchestration.**
- **Native /compact + auto-compaction** — [https://code.claude.com/docs/en/costs](https://code.claude.com/docs/en/costs)

  Summarizes history at ~80% context. Common advice: manually compact at ~60% for better retention. **Type: built-in.**
- **Subagent context isolation** — [https://code.claude.com/docs/en/sub-agents](https://code.claude.com/docs/en/sub-agents)

  Verbose intermediate work (file reads, search, logs) stays in the subagent; only the distilled answer returns to the main thread. The biggest structural win alongside skills. **Type: built-in.**
- **Skills progressive disclosure** — [https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)

  3-tier loading: frontmatter always (~100 tok) → SKILL.md body on trigger (~2k) → reference files only when needed. 8 skills ≈ 500 tokens at startup vs ~70,000. **Type: built-in mechanism.**
- **Context Laziness / lazy loading** — [https://gist.github.com/johnlindquist/849b813e76039a908d962b2f0923dc9a](https://gist.github.com/johnlindquist/849b813e76039a908d962b2f0923dc9a)

  Move detail into on-demand SKILL.md. 54% cut in initial context (7,584 → 3,434 tokens). **Type: technique.**
- **.claudeignore** — [https://tipsforclaude.com/tips/claudeignore-save-context/](https://tipsforclaude.com/tips/claudeignore-save-context/)

  gitignore-syntax exclusion from auto context loading (one package-lock.json can be 50K+ tokens). **Type: technique.**
- **CLAUDE.md optimization** — [https://claudelog.com/faqs/how-to-optimize-claude-code-token-usage/](https://claudelog.com/faqs/how-to-optimize-claude-code-token-usage/)

  Lean scoped memory file; pre-optimized templates 800–1,500 tok vs ad-hoc 5,000+. **Type: technique.**

## 6. Prompt / context compression libraries (provider-agnostic)

- **LLMLingua / LongLLMLingua / LLMLingua-2 (Microsoft)** — [https://github.com/microsoft/LLMLingua](https://github.com/microsoft/LLMLingua) (~5.9k★)

  Small LM scores token importance, drops low-information tokens. Up to 20x compression, ~1.5pt accuracy drop. LLMLingua-2 distilled from GPT-4, 3–6x faster. **Type: library.**
- **500xCompressor** — [https://github.com/ZongqianLi/500xCompressor](https://github.com/ZongqianLi/500xCompressor)

  Compresses long context into as little as one special token, 6x–480x. Retains ~62–73% capability. **Type: library/research.**
- **PCToolkit** — [https://github.com/3DAgentWorld/Toolkit-for-Prompt-Compression](https://github.com/3DAgentWorld/Toolkit-for-Prompt-Compression)

  Plug-and-play toolkit bundling 5 compressors (Selective Context, LLMLingua, LongLLMLingua, SCRL, Keep-it-Simple). **Type: library.**
- **Selective Context** — [https://github.com/liyucheng09/Selective_Context](https://github.com/liyucheng09/Selective_Context)

  Removes redundant content by self-information (entropy); prunes low-surprise tokens. **Type: library.**
- **AutoCompressor** — [https://github.com/princeton-nlp/AutoCompressors](https://github.com/princeton-nlp/AutoCompressors)

  Soft-prompt compression of long sequences into summary vectors. **Type: library/research.**
- **prompt-optimizer** — [https://github.com/vaibkumr/prompt-optimizer](https://github.com/vaibkumr/prompt-optimizer)

  Lexical minimization — stop-word removal, redundancy stripping, lemmatization. **Type: library (Python).**
- **Awesome-Context-Compression-LLMs** — [https://github.com/broalantaps/Awesome-Context-Compression-LLMs](https://github.com/broalantaps/Awesome-Context-Compression-LLMs)

  Curated list for deeper mining. **Type: list.**

## 7. Token counting / budgeting

- **ccusage** — [https://github.com/ryoppippi/ccusage](https://github.com/ryoppippi/ccusage) (~13k★)

  Offline analysis of token usage/cost from local logs (Claude Code, Codex, Gemini, etc.). Measurement, not reduction. **Type: CLI.**
- **TokenCost (AgentOps)** — [https://github.com/AgentOps-AI/tokencost](https://github.com/AgentOps-AI/tokencost)

  USD cost estimation for 400+ LLMs via tiktoken. **Type: library.**
- **tiktoken (OpenAI)** — [https://github.com/openai/tiktoken](https://github.com/openai/tiktoken) — the underlying BPE tokenizer most counters use. **Type: library.**
- **llm-token-counter** — [https://github.com/sinansonmez/llm-token-counter](https://github.com/sinansonmez/llm-token-counter)

  TS lib counting tokens + cost across OpenAI/Anthropic/Google; `withinLimit`, `tokensRemaining`. **Type: library.**
- **Claude-Code-Usage-Monitor** — [https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor](https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor) (~7.7k★)

  Real-time usage with ML predictions + 30-min limit warnings. **Type: tracker.**
- **Token Guard (GitHub Action)** — enforces token budgets on prompt templates / RAG docs in CI. **Type: GitHub Action.**

## 8. Cost reducers (cut dollars, not tokens — flag the difference in UI)

- **claude-code-router** — [https://github.com/musistudio/claude-code-router](https://github.com/musistudio/claude-code-router) (~32.6k★)

  Routes requests to cheaper/local models (DeepSeek, Gemini, Groq, Ollama). 50–99% cost cuts. **Type: CLI proxy.**
- **Anthropic prompt caching** — [https://platform.claude.com/docs/en/build-with-claude/prompt-caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)

  Mark stable prefixes (system prompt, tool defs, CLAUDE.md) cacheable. Cache reads 0.10× input (90% off). Real deployments report 59–70% cost cuts. Claude Code does this automatically. **Type: technique.**
- **Model routing (Haiku/Sonnet/Opus split)** — route discovery/lookups to Haiku (~15× cheaper than Opus), implementation to Sonnet, deep reasoning to Opus. **Type: technique.**
- **SuperClaude_Framework** — [https://github.com/SuperClaude-Org/SuperClaude_Framework](https://github.com/SuperClaude-Org/SuperClaude_Framework) (~22.4k★)

  Compressed commands + personas + local file caching. **Type: framework.**

---

## Competitive landscape — other token trackers (reference for maxxToken)

These are measurement-only menubar/CLI trackers — direct competitors/reference points:

- **tokscale** — [https://github.com/junhoyeo/tokscale](https://github.com/junhoyeo/tokscale) — multi-CLI, global leaderboard, 2D/3D graphs.
- **TokenTracker** — [https://github.com/mm7894215/TokenTracker](https://github.com/mm7894215/TokenTracker) — 22 tools, macOS menu bar + widgets.
- **ai-token-monitor** — [https://github.com/soulduse/ai-token-monitor](https://github.com/soulduse/ai-token-monitor) — macOS/Windows tray, leaderboard + webhook alerts.
- **cccost** — [https://github.com/badlogic/cccost](https://github.com/badlogic/cccost) — instruments Claude Code for actual token/cost.
- **CodeBurn** (~3.1k★) — TUI multi-tool cost dashboard.
- **claude-tap** — [https://github.com/liaohch3/claude-tap](https://github.com/liaohch3/claude-tap) — intercepts/inspects API traffic across Claude Code, Codex, Gemini, Cursor, OpenCode (diagnose token waste).

---

## What this means for the Optimize page

Model these as detectors/recommendations, ranked by realistic session-wide leverage:

1. **Retrieval + repo-map** instead of full-file dumps (claude-context, Aider repo-map, Token Savior) — ~40–80%.
2. **Tool-output compression** (RTK) — 60–90% on shell output. Conceptually overlaps with maxxToken; could bundle or recommend.
3. **MCP schema compression** (mcp-compressor) + **lazy tool loading** — 70–97% on schemas.
4. **Subagent isolation + skills progressive disclosure** — 10–100× on startup/intermediate tokens.
5. **Session memory/compaction** (claude-mem, DCP, /compact at 60%) — 60–80% on warm-up.
6. **Output-style terseness** (caveman) — cheap ~60% prose cut, but be honest it's ~4–5% session-wide.
7. **Caching + model routing** — cut cost not tokens; show as a separate "$ saved" lane.



&nbsp;