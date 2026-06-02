# Breaking-change release notes (template)

Copy the section below into the **GitHub Release** description when a version includes breaking changes. Replace placeholders in `ALL_CAPS` or angle brackets.

---

## `vX.Y.Z` — Breaking changes

**Summary:** One or two sentences describing why this release matters and the main upgrade action (for example “MCP tool errors now use `ToolError`; update clients that parsed `{ status: 'error' }`.”).

### What changed

| Change | Affected consumers | Action |
| ------ | ------------------ | ------ |
| _Short title_ | MCP clients / library embedders / operators | _Concrete step (pin version, update schema, set env var)_ |
| … | … | … |

### Upgrade checklist

- [ ] Pin `@will-cppa/pinecone-read-only-mcp@X.Y.Z` in `package.json`, MCP config, and Docker image tags (avoid floating `latest` until validated).
- [ ] Read [CHANGELOG.md](https://github.com/cppalliance/pinecone-read-only-mcp-typescript/blob/vX.Y.Z/CHANGELOG.md#xyz---YYYY-MM-DD) for the full list.
- [ ] Follow [docs/MIGRATION.md](https://github.com/cppalliance/pinecone-read-only-mcp-typescript/blob/vX.Y.Z/docs/MIGRATION.md) for before/after examples.
- [ ] Review [docs/deprecation-policy.md](https://github.com/cppalliance/pinecone-read-only-mcp-typescript/blob/vX.Y.Z/docs/deprecation-policy.md) for ongoing deprecations.
- [ ] Run your integration tests against the new version.

### npm

- Package: `@will-cppa/pinecone-read-only-mcp`
- Version: `X.Y.Z`
- Install: `npm install @will-cppa/pinecone-read-only-mcp@X.Y.Z`

If you rely on reproducible builds, pin the exact version rather than a range until you have verified compatibility.

### Links

- [CHANGELOG — vX.Y.Z](https://github.com/cppalliance/pinecone-read-only-mcp-typescript/releases/tag/vX.Y.Z)
- [MIGRATION.md](https://github.com/cppalliance/pinecone-read-only-mcp-typescript/blob/vX.Y.Z/docs/MIGRATION.md)
- [Deprecation policy](https://github.com/cppalliance/pinecone-read-only-mcp-typescript/blob/vX.Y.Z/docs/deprecation-policy.md)

---

**Maintainers:** delete this heading and the instructions above when publishing; keep only the release body. See [RELEASING.md](../RELEASING.md).
