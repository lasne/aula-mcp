# Fork notes

This is [lasne/aula-mcp](https://github.com/lasne/aula-mcp), Lasse's fork of [Casperjuel/aula-mcp](https://github.com/Casperjuel/aula-mcp). Home Assistant installs the add-on `aula-mcp (lasne)` from this repository and rebuilds the image when `version` in [`homeassistant-addon/config.yaml`](homeassistant-addon/config.yaml) changes.

The npm package version follows upstream. The add-on version is separate, so Supervisor can see an update without waiting for an upstream add-on release.

## What differs from upstream

- **Separate add-on.** Name `aula-mcp (lasne)`, slug `aula_mcp_lasne`, panel title and `url` point here. It does not replace upstream's `aula_mcp` entry. Stop the other add-on if it is installed; both publish host port 7878. The image clones `https://github.com/lasne/aula-mcp.git` (`AULA_MCP_REPO` in `homeassistant-addon/build.yaml` and the Dockerfile).
- **MitID session on `/data`.** Upstream v1.6.2 ([#123](https://github.com/Casperjuel/aula-mcp/pull/123)) pins the `homeassistant_config` mount at `/config` and stores tokens at `/config/aula-mcp`. This fork keeps that mount pin, and keeps the live session on the add-on volume `/data/aula-mcp`, which is where the installed add-on already saved it. A bundle at host `/config/aula-mcp` is imported when `/data` has no `tokens.json`. Logout stays logged out until that bundle's fingerprint changes.
- **Read-only tools.** `AULA_MCP_WRITE` and `AULA_MCP_RAW` are unset, so these tools are not registered: `aula.presence.set_template`, `aula.presence.report_sick`, `aula.messages.mark_read`, `aula.raw_request`.
- **Add-on version** is `<upstream package>-lasne.<n>` (currently `1.6.2-lasne.1`). Supervisor compares versions with AwesomeVersion. That string is semver, and it is newer than the installed `1.1.0`. A hyphen suffix on the same `major.minor.patch` sorts *below* the plain release, so the counter stays on `-lasne.N` and moves to `<next release>-lasne.1` when upstream releases.

## Staying current

[`.github/workflows/upstream-sync.yml`](.github/workflows/upstream-sync.yml) runs every Monday at 06:15 UTC, and when started by hand (`workflow_dispatch`). It merges `Casperjuel/aula-mcp` `main` and bumps the add-on version.

- A clean merge is opened as a pull request. The workflow runs typecheck, lint, and tests, then merges with a **merge commit** when they pass. A push from the workflow token does not start the separate CI workflow.
- A merge with conflicts is opened as a pull request and **not** merged. Resolve it by hand. Keep the slug, the `/data` token store, and the read-only defaults, then run `bun homeassistant-addon/bump-addon-version.ts`.
- The add-on tests refuse a tree that drops the fork slug, points `AULA_MCP_DIR` at `/config/aula-mcp`, or exports `AULA_MCP_WRITE`. A sync that fails those tests is left open.

## More than one MCP client

Upstream already accepts concurrent MCP sessions. [#79](https://github.com/Casperjuel/aula-mcp/pull/79) (released in v1.5.0) gives each Streamable HTTP client its own transport, keyed by `Mcp-Session-Id`, with a cap of 16 and a 5 minute idle sweep. Legacy `/sse` sessions are separate and capped the same way. Home Assistant's MCP integration uses `/sse`. A second client can call `http://<home-assistant>:7878/mcp` at the same time.

Those sessions do not share one Aula client. Each `createMcpApp()` builds its own `AulaContext`: own token refresh, own `AulaClient`, own caches, own watcher on the token file. [PR #136](https://github.com/Casperjuel/aula-mcp/pull/136) (open, not merged; from issue [#125](https://github.com/Casperjuel/aula-mcp/issues/125)) would share one context. It is not in this fork. Two sessions that refresh at the same moment can both present the same refresh token; if Aula rotates it, the second refresh can fail. The author of that PR described it as reasoned from the code, not as a failure they had seen. Access tokens last on the order of an hour, and refresh is de-duplicated inside one context, so two household clients are usable. The sharp edge is both of them calling Aula in the minute the access token expires.

Closing a session does not call `AulaContext.dispose()`, so the token-file watcher for a finished session stays until the process exits. The session cap limits how many are active, not how many watchers have been left behind over a long uptime.

The HTTP server does not check an `Authorization` bearer. `AULA_MCP_KEY` is the key for the token file, not an API key. With `allow_remote: true` (the add-on default), any device that can open port 7878 can call the tools. A second app sending the same bearer is not authenticated by this server; it is simply another client of an open port.
