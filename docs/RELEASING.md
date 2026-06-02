# Releasing

Packages are published to npm as **`@will-cppa/pinecone-read-only-mcp`**.

## Mechanism

1. Merge changes to `main` with an updated [`CHANGELOG.md`](../CHANGELOG.md).
2. Create a **GitHub Release** (publish event) with a version tag aligned with semver. When the release includes breaking changes, use the body from [templates/breaking-change-release-notes.md](./templates/breaking-change-release-notes.md) and follow [deprecation-policy.md](./deprecation-policy.md).
3. The [Publish workflow](../.github/workflows/publish.yml) runs the full CI suite (`workflow_call` to `ci.yml`), then executes `npm publish --provenance --access public` on Ubuntu with `NODE_AUTH_TOKEN`.

## Requirements

- **`NPM_TOKEN`** secret configured on the repository.
- **`prepublishOnly`** runs `npm run ci` — local `npm publish` must pass the same gates.

## Version source

`SERVER_VERSION` is read from `package.json` at runtime so MCP `serverInfo` matches the published package.
