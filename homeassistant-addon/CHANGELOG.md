# Changelog

## 1.6.2-lasne.1

- Merge upstream [v1.6.2](https://github.com/Casperjuel/aula-mcp/releases/tag/v1.6.2): Uint8Array request bodies are copied onto an `ArrayBuffer`, and Home Assistant's config directory is mounted at `/config`.
- Keep the MitID session on the add-on volume `/data/aula-mcp`, so a login already stored there survives this update. A bundle at `/config/aula-mcp` is imported when `/data` has no tokens.
- Write tools (`aula.presence.set_template`, `aula.presence.report_sick`, `aula.messages.mark_read`) and `aula.raw_request` stay off.
- `1.6.2-lasne.1` is a semver prerelease on a higher version than the installed `1.1.0`, so Supervisor offers an update. AwesomeVersion compares it above `1.1.0` and above `1.6.2-lasne.0`.

## 1.1.0

- Store the MitID session on `/data/aula-mcp` so it survives an add-on restart, an update, and a Home Assistant reboot.
- Publish this fork as its own add-on (`aula_mcp_lasne`) and build the image from `lasne/aula-mcp`.
