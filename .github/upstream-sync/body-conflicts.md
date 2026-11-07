## Summary

`Casperjuel/aula-mcp` `main` (`__SHA__`) does not merge cleanly into this fork. This branch is upstream `main`. GitHub will report the conflicts. Do not merge it while they remain, and do not take upstream's add-on name, slug, or token path when resolving `homeassistant-addon/config.yaml`.

After the conflicts are resolved:

- keep `name: aula-mcp (lasne)`, `slug: aula_mcp_lasne`, and the `lasne/aula-mcp` clone URL
- keep the MitID session on `/data/aula-mcp`
- keep `AULA_MCP_WRITE` and `AULA_MCP_RAW` unset
- bump the add-on with `bun homeassistant-addon/bump-addon-version.ts`

This workflow force-updates `chore/upstream-sync` on each run. Resolve on another branch if a manual fix needs to survive the next run.

### Conflicted files

```
__FILES__
```
