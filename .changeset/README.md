# Changesets

Every user-facing change needs a changeset (`pnpm changeset`) that names **`@vespenelabs/pipeline-view`**, the only published package:

```md
---
'@vespenelabs/pipeline-view': minor
---

What changed, for the CHANGELOG.
```

The `@pipeline-view/core`, `@pipeline-view/symbols` and `@pipeline-view/react` workspace packages are private and bundled into `@vespenelabs/pipeline-view`. A changeset that names only them does **not** bump the published package.

Releasing: version PR (`pnpm changeset version`) → merge → tag `vX.Y.Z` → `publish.yml` publishes to GitHub Packages and `release.yml` creates the GitHub Release. See the root README, section "Releasing".
