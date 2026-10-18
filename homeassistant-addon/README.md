# aula-mcp (lasne) — Home Assistant add-on

Runs the `aula-mcp` server (the MCP interface for the Danish school platform
Aula) inside your Home Assistant supervisor, exposing the standard endpoints
at `http://homeassistant.local:7878/`. HA's official
[`mcp` (client) integration](https://www.home-assistant.io/integrations/mcp/)
points at `/sse`, and Assist + your chosen LLM (Anthropic, OpenAI, Ollama,
etc.) gets every `aula.*` tool — including for voice queries like
*"hvad er lektien i dag?"*.

## Install

[![Open your Home Assistant instance and add the aula-mcp add-on repository.](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https://github.com/lasne/aula-mcp)

1. **Click the badge above** (or manually: Settings → Add-ons → Add-on Store
   → ⋮ (top-right) → Repositories → paste `https://github.com/lasne/aula-mcp`).
2. **Install `aula-mcp (lasne)`** from the repository section of the same
   name. If the upstream `aula-mcp` add-on is still installed, stop it
   first — both publish host port 7878.
3. **Start it** and log in from the sidebar (next section). The options are
   the ones you already know (`allow_remote`, `aula_mcp_key`, `log`) and
   the defaults are unchanged. This is a separate add-on from the upstream
   store entry, so Supervisor does not copy its saved options across: set
   `aula_mcp_key` again only if you had changed it from empty, and set
   `log` / `allow_remote` again only if you had changed them from the
   defaults (`false` / `true`).

## First-time: log in via the add-on's web UI

1. Start the add-on.
2. Open the **aula-mcp (lasne)** entry in your HA sidebar (added automatically
   via the add-on's Ingress panel). You should see *"Ikke logget ind"*.
3. Type your **MitID username** and click **Start login**.
4. Two QR codes appear. Open your **MitID app**, scan either of them (they
   alternate as an anti-phishing check), and approve the login on your phone.
5. If MitID returns multiple identities (rare — typically only parents with
   several login routes), pick the one your school knows you by.
6. On success the page flips to *"Logget ind"* and the tokens are persisted
   encrypted under `/data/aula-mcp/` (`tokens.json` plus the `.key`
   encryption key). `/data` is the add-on's private volume, so the session
   survives a restart, an update, a rebuild, and a Home Assistant reboot.
   Uninstalling the add-on deletes that volume. Add-on backups include it,
   key file and all — treat those backups as secrets.

The whole flow happens inside HA's Ingress proxy — your browser never leaves
the HA UI, and the MitID-app talks to nemlog-in.dk directly. The add-on only
sees the resulting OAuth tokens.

### Fallback: workstation export

If you'd rather not type your MitID username into HA's UI (or you're hardening
a setup with no browser access), the original workstation flow still works:

```sh
git clone https://github.com/lasne/aula-mcp.git && cd aula-mcp
pnpm install
pnpm aula login                            # MitID QR-code flow on workstation
pnpm aula tokens export ./aula-bundle      # writes tokens.json + .key
ssh homeassistant 'mkdir -p /config/aula-mcp'
scp aula-bundle/tokens.json aula-bundle/.key homeassistant:/config/aula-mcp/
```

Restart the add-on. On startup it copies that bundle into `/data/aula-mcp/`
when the private store has no `tokens.json`. The copy is not repeated after
you log out (logout deletes `tokens.json` on purpose). To import a newer
bundle, replace the two files in `/config/aula-mcp` and restart.

A session that only ever lived in the old container path `/config/aula-mcp`
was on the container's writable layer. Supervisor removes that container on
stop, so those files are already gone and this update cannot recover them.
Log in once through the sidebar; that login is the one that sticks.

## Configure

In the add-on's Configuration tab:

| Option | Default | Notes |
| --- | --- | --- |
| `aula_mcp_key` | `""` | Encryption key for the token store. Leave empty unless you set one when exporting tokens. |
| `log` | `false` | Verbose logs (auth flow, HTTP calls). Useful when something's stuck. |
| `allow_remote` | `true` | Bind to `0.0.0.0` so HA + other LAN devices can reach the server. Disable only if you front the addon with Ingress / reverse proxy. |

Start the add-on. Check the log — should see `aula-mcp listening on http://0.0.0.0:7878/mcp`.

## Connect HA's MCP client

1. Settings → Devices & Services → Add Integration → **Model Context Protocol**.
2. **SSE Server URL:** `http://homeassistant.local:7878/sse` (or `http://<container-host>:7878/sse` if HA isn't on `homeassistant.local`).
3. Save. HA discovers the tool surface (`aula.discover`, `aula.ugeplan.*`,
   `aula.lektier.easyiq`, `aula.messages.*`, …) and exposes it to whatever
   conversation agent you've configured (Settings → Voice assistants).

## Verify

Open Settings → Voice assistants → your Assist pipeline → ask:

> *Hvad står der på ugeplanen for [barn] næste uge?*

The LLM should call `aula.discover` once, then a ugeplan-tool. If you see
"tool not found" or auth errors, check the add-on log.

## Update

The image clones `https://github.com/lasne/aula-mcp` at branch `main` during
the build (see `homeassistant-addon/build.yaml`). It does not clone
`Casperjuel/aula-mcp`. Reinstall or update the add-on to rebuild against
the latest commit on this fork. The entrypoint (`run.sh`) is taken from
the add-on directory Supervisor checked out, so the persistent token path
is the one in that checkout.

## Limitations

- **No OAuth on the MCP endpoint yet.** The server is single-user — anyone
  with LAN access to `:7878` can drive your Aula tokens. Inside a household
  on a trusted LAN this is generally fine; if your network has untrusted
  peers, set `allow_remote: false` and front the add-on with HA Ingress.
- **MitID re-login is the sidebar again.** Access tokens refresh on their
  own. When Aula rejects the refresh token, open the sidebar panel and log
  in again; the new `tokens.json` and `.key` stay on `/data`. The
  workstation export above is only a fallback.
- **One arch image per build.** Pre-built multi-arch images aren't published;
  Supervisor builds the image locally on install. First start can take a
  minute or two on a Raspberry Pi.
