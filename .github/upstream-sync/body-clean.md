## Summary

Merges `Casperjuel/aula-mcp` `main` (`__SHA__`) and bumps the Home Assistant add-on to `__VERSION__`.

__CHECKS__

When the checks pass, this pull request is merged with a merge commit. It is not squashed, so the next sync does not replay the same upstream commits. It is not merged when the checks fail.

Fork defaults the add-on tests still require:

- slug `aula_mcp_lasne`, image cloned from `lasne/aula-mcp`
- MitID tokens on `/data/aula-mcp`
- `AULA_MCP_WRITE` and `AULA_MCP_RAW` unset
