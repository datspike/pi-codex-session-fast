# pi-codex-session-fast

Explicit Fast mode for one active native `openai-codex` session in Pi 1.3.0+. The extension adds `service_tier: "priority"`; the server may reject or downgrade the tier. This is not a guarantee of faster responses.

## Installation

Install the package with `pi install npm:@datspike/pi-codex-session-fast`, then start a new Pi session or run `/reload`.

Choose any `openai-codex` model through Pi's normal model picker. The extension does not change the default model, OAuth, CLIProxyAPI, transport, or reasoning. Do not load another extension that owns `/fast` or `service_tier` at the same time.

## Commands

- `/fast` — toggle the mode.
- `/fast on` — enable it explicitly.
- `/fast off` — disable it for future requests.
- `/fast status` — show the current state.

Fast can be enabled at any time: the command changes only future requests and does not modify a request that has already been sent. The command does nothing for other providers. The `priority requested` indicator means that the extension requested the tier; it does not confirm that the server applied it.

## State boundaries

Fast is disabled at startup, on `/new`, resume, fork, `/reload`, and session shutdown. Switching away from provider `openai-codex` also disables it; switching back does not re-enable it. The state survives model changes within `openai-codex` in the same session.

Normal responses, tools, retries, and compaction keep the state within the same session. New processes and subagents get a disabled instance. The extension does not use files, global preferences, environment variables, or startup flags to enable Fast. Response receipts are reporting data only and never restore Fast.

`/fast off` does not cancel a request that has already been sent or remove settings owned by another component. If another `service_tier` is present, the extension leaves the payload unchanged and disables its own mode. An external `priority` is preserved with a warning. A later hook may change the final payload; do not have multiple components own the tier.

## Models and cost

Fast is available for every model on provider `openai-codex`. There is no model ID allowlist; new models from this provider are supported automatically. Other providers are not supported.

Fast increases subscription credit usage, including banked credits. The extension does not set a spending limit. Check the current terms in the [Codex documentation](https://developers.openai.com/codex/speed).

## Development and checks

```sh
npm ci --ignore-scripts
npm run check
npm pack --dry-run
```

TypeScript checks and lifecycle tests do not replace live acceptance. Run real model checks separately with an explicit budget and receipts. The architecture decision is documented in `docs/adr/0001-volatile-session-priority.md`.

Private plans live in the ignored `.task_files/` directory, and local runs live in `.runtime/`. Neither is included in Git or the npm package.

## Publishing

The package is published through `.github/workflows/publish.yml` with npm Trusted Publishing and GitHub Actions OIDC. The first version must be published locally once so npm can create the package:

```sh
npm login --auth-type=web
npm publish --access public --provenance=false
```

After the package exists, configure **Settings → Publishing access → Trusted publishing** on npm for repository owner `datspike`, repository `pi-codex-session-fast`, workflow `publish.yml`, with no environment. Later releases bump the version, push `main`, and run the `Publish npm package` workflow.

## Response receipts

The extension writes metadata-only `codex-session-fast-response.v1` entries to Pi JSONL: the session, model, exact `responseId`, `requestedTier` at request-hook time, and `serverTier` when the provider reports it. Request and response text are not stored. The receipt is bound at `response.created`; later events from another response or session cannot inherit it.

`requestedTier: "priority"` means that Fast was requested, not that the server honored it. A later hook may change the payload. To match receipts with SQLite telemetry, `context-compaction` must preserve `flags_json.providerResponseId`. If an ID or receipt is missing, or receipts conflict, the report keeps the mode unknown. The change takes effect after `/reload` or a new Pi process; do not repeat paid requests just to populate history.

## Contributing and security

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for local checks and contribution boundaries. See [`SECURITY.md`](SECURITY.md) for handling vulnerabilities and sensitive data.
