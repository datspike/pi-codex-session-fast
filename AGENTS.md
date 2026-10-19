# pi-codex-session-fast

The Pi extension requests `priority` only from the native `openai-codex` provider.

## Sources

- Public behavior is documented in `README.md` and `docs/adr/`.
- Before working on an initiative, read `.task_files/INDEX.md` and then the referenced brief.
- Update the index in the same change when an initiative changes status.
- Separate execution evidence from conclusions and unknowns.

## Boundaries

- Fast state lives only in memory for one active session. Never restore it from disk, the environment, or a startup flag.
- Do not register a provider or change auth, transport, reasoning, or Pi core.
- `.task_files/`, `.runtime/`, `.pi/`, credentials, and session JSONL are excluded from Git and the npm package.
- Record the budget and receipt before a model check; an unknown outcome does not permit an automatic retry.
- Use Conventional Commits; external pushes require a separate request.
