# Requested Mode Receipt for Each Response

## Decision

Store a `codex-session-fast-response.v1` entry in Pi JSONL that links the requested mode to the exact `sessionId`, `responseId`, and model. Use the existing `pi.appendEntry()` and `provider_stream_event`; do not create another database or a restorable mode switch.

The receipt stores `requestedTier` when the extension processes the request and, separately, `serverTier` when the provider reports it. Request and model text are not copied. Bind the receipt at `response.created`; terminal events `response.done`, `response.completed`, `response.failed`, and `response.incomplete` close only that same response. A new session clears unfinished bindings.

To link receipts with existing SQLite telemetry, `context-compaction` preserves `flags_json.providerResponseId`. This removes ambiguity based on timing or message order. Old rows without an ID and responses without a receipt remain unknown.

## Boundaries

Fast means that priority was requested, not that the server honored it. A later hook may change the payload. The server-returned tier does not enable Fast and does not replace the requested tier. CLIProxyAPI responses are not marked by this extension.

## Alternatives

Matching by speed, time, or whole-session state was rejected: the mode can change between adjacent requests, while retries and errors disrupt ordering. A separate mode store is unnecessary because JSONL and SQLite already exist.
