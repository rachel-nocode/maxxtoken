# Agent Instructions

## Public Repo Secret Safety

This repo is public. Treat any token, API key, cookie, session ID, OAuth credential, private key, `.env` value, copied request header, local app-state JSON, or provider credential JSON as sensitive.

Before every commit or push:

1. Inspect staged changes with `git diff --cached` and do not commit raw secrets.
2. Run a secret-pattern pass across the working tree, especially JSON, env-like, config, log, and adapter files.
3. Check for provider token shapes: `sk-*`, `sk-ant-*`, `gh[pousr]_`, `AIza*`, `AKIA*`, JWTs, Bearer tokens, cookies, refresh/access/session tokens, private key blocks, and long high-entropy literals.
4. Verify ignored local state stays ignored: `.claude/`, `.codex/`, `.playwright-mcp/`, `node_modules/`, `dist/`, `desktop/dist/`, debug logs, screenshots, and one-off private strategy files.
5. Never echo raw suspected secrets in chat, logs, commit messages, or reports. Redact them.
6. If a real secret is found in committed history or a pushed commit, stop and say so plainly. Recommend rotating the credential and cleaning history instead of only deleting it from the latest file.

Useful scan commands before committing:

```bash
rg -n --hidden --glob '!node_modules/**' --glob '!desktop/node_modules/**' --glob '!dist/**' --glob '!desktop/dist/**' --glob '!.git/**' --glob '!AGENTS.md' -i '(sk-[A-Za-z0-9_-]{24,}|sk-ant-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{30,}|AIza[0-9A-Za-z_-]{35}|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|BEGIN .*PRIVATE KEY|xox[baprs]-[A-Za-z0-9-]{20,}|sk_live_[A-Za-z0-9]{20,}|rk_live_[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}|Bearer [A-Za-z0-9._~+/-]{24,})'
rg -n --hidden --glob '!node_modules/**' --glob '!desktop/node_modules/**' --glob '!dist/**' --glob '!desktop/dist/**' --glob '!.git/**' --glob '!AGENTS.md' --glob '*.{json,env,toml,yml,yaml,js,ts}' -i '(api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|session[_-]?token|id[_-]?token|password|passwd|credential)\s*[:=]\s*["'\''][^"'\'']{20,}["'\'']'
```

Known fake test fixtures may still trigger these scans. Verify they are obvious fixtures like `abc`, `fake`, or `*-token` test strings before proceeding.

Prefer storing user credentials only through the app's Keychain-backed `safeStorage` path. Do not add plaintext credential fallbacks, JSON env dumps, or debug output that serializes all saved keys.
