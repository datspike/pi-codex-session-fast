# Fast Without Persistent State

## Status

Accepted. Verified on Pi 1.3.0: commands in the real TUI, session replacement through the SDK, and limited model requests.

## Context

Fast is a paid server preference. Persisting a global switch could silently carry higher usage into another session. Replacing the provider to add one field would take ownership of transport and cleanup that this extension does not need.

## Decision

Use one TypeScript entrypoint with public command, lifecycle, and request hooks. Keep state in a closure keyed by the session ID. Do not add runtime dependencies, state files, CLI flags, background resources, or provider registration. Not restoring Fast is intentional protection, not a missing feature.

Enable Fast only through `/fast` on `openai-codex`, including while a turn is active; the command changes only future requests. `session_start` and `session_shutdown` reset it. Leaving `openai-codex` resets it. A request must match the current session ID, provider, and model. Do not overwrite another tier; an external `priority` remains external. The hook does not confirm the served tier.

## Alternatives

- CLIProxyAPI provider: adds tier and transport ownership, while dynamic Pi adaptation and persisted state are unnecessary here.
- calesennett: provides a short injector and broad compatibility, but its commands write shared settings, which is not needed here.
- SI-RUI-ZHANG: separates core and state carefully, but persisted preferences, startup flags, and overwriting another tier do not fit this contract.
- dasomji: validates payload and model and avoids overwriting a tier, but its global state file is unnecessary.

The implementation is independent. It borrows verified ideas from the reference implementations rather than copying their code. A small new implementation avoids adapting their state, storage, and provider layers.

## Consequences

Fast must be enabled again after `new`, resume, fork, reload, or restart. Compaction and ordinary turns preserve it. Subagents receive a separate disabled instance. `/fast on` and `/fast off` affect only future requests owned by this extension; the backend and other hooks may have their own settings.

## Non-goals

Changing auth, transport, reasoning, the model, the default provider, guaranteed acceleration, or subscription spending controls.

## Verification

Lifecycle tests, Jiti loading, and a real TUI check are followed by a limited model check. Unit tests do not prove backend Fast behavior.
