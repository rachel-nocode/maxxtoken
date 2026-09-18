# Provider contribution protocol

MaxxToken application source is private. This protocol is for proposing and validating integrations without publishing source, credentials, private fixtures, or provider data.

## Proposal

Open a provider request containing only public facts:

- Provider/product name and public account/usage/status documentation links.
- Metric inventory with names, units, reset semantics, and whether each value is provider-reported, inferred, or local-only.
- Supported auth flow: provider-owned CLI/app sign-in, OAuth, API key, or browser session. Do not submit credentials.
- Platform and account-plan coverage, known regional/team differences, and expected failure states.
- A contact who can privately run a candidate build against an authorized account if live validation is needed.

Undocumented endpoints can be proposed, but they must be labeled unstable and may qualify only for experimental support. MaxxToken does not ask contributors to bypass access controls or capture another person's account traffic.

## Sanitized fixture format

A fixture may describe a request/response shape after all sensitive and identifying data has been replaced. Preserve types, nesting, nullability, boundary values, and time/unit semantics. Replace secrets and identities with obvious literals such as `fake-token`, `user@example.invalid`, `acct_test`, and fixed non-current timestamps.

Remove cookies, authorization headers, request signatures, OAuth material, account IDs, organization IDs, billing addresses, prompt/session text, file paths, and provider-generated opaque strings. Do not transform a real secret into a hash and call it anonymous; delete or replace it.

Fixtures must include provenance notes stating whether the schema came from public documentation, an authorized account, or a synthetic reconstruction. Do not include a raw capture alongside the sanitized copy.

## Adapter contract

A provider specification should define:

- Stable provider ID, display name, support status, tier, and auth mode.
- Discovery priority and platform behavior, including a clean “not configured” result.
- Normalized windows with label, kind, used percentage or raw used/limit values, real reset timestamp, and period only when known.
- Scalar balances and metadata that remain scalar when no denominator exists.
- Token history source, local calendar mapping, model identity, deduplication rules, and measured/estimated cost provenance.
- Freshness, timeout, retry/rate-limit behavior, actionable redacted errors, and whether partial endpoint failure preserves primary data.
- Forecast eligibility. Synthetic resets and inferred quotas must explicitly disable forecasting.

Credential persistence must use the app's encrypted credential path. Specifications must not propose plaintext JSON/env dumps, credential logging, or browser-wide cookie export.

## Validation package

Provide sanitized, deterministic tests for success, missing optional data, zero use, exhausted quota, missing reset, expired auth, malformed response, rate limit, timeout, and partial endpoint failure. Calendar data needs sparse days and a timezone-boundary case. Multi-account sources need identity and no-double-counting cases.

A live validation report may state pass/fail, provider plan, platform, metric names, reset behavior, and redacted discrepancies. It must not contain account data or screenshots with identity unless the account owner explicitly prepared them for publication.

Integration acceptance also requires registry/adapter parity, settings visibility, BURN metric rendering, CLI/API contract output, troubleshooting text, and a secret-pattern scan. “Adapter file exists” is not a support claim.

## Submission and disclosure

Submit public specs and fixtures through the public issue channel designated by the project. Private implementation patches are reviewed in the private application repository. Do not open pull requests containing reconstructed application source or extracted packaged code.

By submitting a fixture, confirm that you are authorized to share it and that it contains no real credentials or personal/provider-confidential data. If a secret is discovered after submission, remove the artifact where possible, rotate the credential, and notify the maintainer; deleting it from the latest revision is not enough when public history contains it.
