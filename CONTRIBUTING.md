# Contributing

## Before making changes

1. Install Node.js 22 or newer.
2. Install dependencies without running third-party scripts:

   ```sh
   npm ci --ignore-scripts
   ```

3. Run the checks:

   ```sh
   npm run check
   npm pack --dry-run
   ```

Changes must preserve the extension boundaries: do not change auth, transport, reasoning, or Pi core. Fast lives only in memory for the active session and must not be enabled through files, environment variables, or startup settings.

## Pull requests

Describe the behavior before and after the change, add a regression test for every new scenario, and include the result of `npm run check`. Do not commit `.runtime/`, `.task_files/`, `.pi/`, `node_modules/`, credentials, or session JSONL.

Use Conventional Commits for commit messages.
