# pipeline-view

TypeScript library for interactive P&ID and process diagrams, built for the gas industry and open to any process industry: SCADA-style live monitors and diagram editors in one component.

- **54 symbols**: the 50 gas-service P&ID symbols (valves, actuators, compressors, vessels, instruments, piping) plus tank, cone-bottom tank, pump and control valve, and `registerSymbol()` for your own packs
- **Orthogonal, node-avoiding pipe routing** with manual waypoints, line jumps and junction dots
- **Live values** through arbitrary HTML / React overlays, with no transport lock-in
- **Viewer and editor** modes: palette, connect, rotate, undo/redo, JSON save/load
- **Light and dark themes** via `--pv-*` CSS tokens; symbols follow `currentColor`
- Framework-agnostic core with **no runtime dependencies**, plus React bindings; safe to import during SSR

> **Status:** v1. Published to [GitHub Packages](https://github.com/orgs/VespeneLabs/packages) as the private package `@vespenelabs/pipeline-view`. Scope and decisions: [PRD.md](./PRD.md).

One package, with subpath exports:

| Import | What it is |
| --- | --- |
| `@vespenelabs/pipeline-view` | Core: model and JSON, commands/undo, router, viewport, SVG renderer, HTML overlay, editor, export |
| `@vespenelabs/pipeline-view/symbols` | Gas P&ID pack and process equipment (tree-shakable, one module per symbol) |
| `@vespenelabs/pipeline-view/react` | `<PipelineView/>`, `<SymbolPalette/>`, hooks (React 18 or later, an optional peer dependency) |
| `@vespenelabs/pipeline-view/styles.css` | The `--pv-*` theme tokens and base styles |

All subpaths share one core instance, so symbols registered through `/symbols` are visible to every `Diagram`.

## Installing from GitHub Packages

The package is published to GitHub Packages (`https://npm.pkg.github.com`) as a private package. To consume it:

1. Grant the consuming repository read access, once per repository: on GitHub, open **VespeneLabs → Packages → pipeline-view → Package settings → Manage Actions access**, click **Add repository**, pick the repository and give it the **Read** role. This lets that repository's GitHub Actions install the package with its own `GITHUB_TOKEN`.
2. Point the `@vespenelabs` scope at GitHub Packages in the consumer's `.npmrc`:

   ```ini
   @vespenelabs:registry=https://npm.pkg.github.com
   //npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
   ```

   Locally, set `NODE_AUTH_TOKEN` to a personal access token (classic) with the `read:packages` scope, from an account that can see the package. In GitHub Actions, give the job `permissions: packages: read` and set `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`.
3. Install it: `npm install @vespenelabs/pipeline-view` (or `pnpm add`), plus `react react-dom` if you use the React bindings.

Each GitHub Release also attaches the package tarball, for offline installs.

### Releasing

Releases follow semver. [VERSIONING.md](./VERSIONING.md) spells out what counts as public API, what goes in a major, minor or patch release, how deprecations work, and the compatibility rules for saved diagrams.

1. Every user-facing change needs a changeset (`pnpm changeset`) that **names `@vespenelabs/pipeline-view`**, the only published package. The `@pipeline-view/core|symbols|react` workspace packages are private and bundled into it, so a changeset that names only them does **not** bump the published package. Start a paragraph with `Model:` when the change affects the saved JSON.
2. To release, run `pnpm version-packages` in a version PR and merge it to `main`. That runs `changeset version`, which bumps `packages/pipeline-view/package.json` and writes its `CHANGELOG.md`, and then gathers the `Model:` notes into the entry's "Model" section.
3. Tag the merged version commit and push the tag: `git tag v1.2.0 && git push origin v1.2.0`. The tag triggers `publish.yml` (GitHub Packages) and `release.yml` (GitHub Release).

The `Publish package` workflow (`.github/workflows/publish.yml`) checks that the tag matches the package version. It then builds, runs the tests, checks the packed tarball (`pnpm check:packages`), installs it into a fresh consumer project (`pnpm smoke:consumer`), and runs `pnpm publish` to GitHub Packages. To retry a failed publish without re-tagging, run the workflow manually (**Actions → Publish package → Run workflow**) and pick the version tag under *Use workflow from*. A run started from a branch stops at the version check. The `Release` workflow (same tag) creates the GitHub Release with the changelog and the tarball.

## Quick start

React:

```tsx
import type { Diagram } from '@vespenelabs/pipeline-view';
import { PipelineView, type DiagramModel } from '@vespenelabs/pipeline-view/react';
import { gasSymbols, processSymbols } from '@vespenelabs/pipeline-view/symbols';
import { useEffect, useRef } from 'react';
import '@vespenelabs/pipeline-view/styles.css';

const symbols = [...gasSymbols, ...processSymbols];

const model: DiagramModel = {
  version: 1,
  nodes: [
    { id: 'T1', type: 'process/tank', position: { x: 0, y: 0 }, label: 'T-101', data: { level: 0.6 } },
    { id: 'P1', type: 'process/pump', position: { x: 240, y: 40 }, label: 'P-101' },
  ],
  links: [{ id: 'L1', kind: 'process', from: { node: 'T1', port: 'out' }, to: { node: 'P1', port: 'suction' } }],
};

export function Plant() {
  const diagram = useRef<Diagram | null>(null);

  // Your data source goes here (WebSocket, MQTT, polling, ...). Clean it up on unmount.
  useEffect(() => {
    const id = setInterval(() => diagram.current?.setNodeData('T1', { level: Math.random() }), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <PipelineView
      model={model}
      symbols={symbols}
      onReady={(d) => (diagram.current = d)}
      style={{ height: 400 }}
    />
  );
}
```

Without React, the same thing is `new Diagram({ symbols })`, then `diagram.mount(element)`, `diagram.load(model)` and `diagram.setNodeData(...)`. See [packages/core/README.md](./packages/core/README.md).

Live data never goes through undo or re-routing: push it with `setNodeData` / `setNodeDataBatch`. Edits go through `diagram.update(tx => …)`, one undo step each. `status` is a free-form string the library only writes to `data-status`; you style it.

## Demos and docs

The docs site with the demos runs locally:

```sh
pnpm install
pnpm build
pnpm dev        # http://localhost:5173
```

- `#/monitor`: **Process monitor**, the Figma reference diagram with live simulated data, reading cards and the four example statuses (add `?static` for the reference state)
- `#/editor`: **P&ID editor** with palette, port-to-port connect, link kinds, undo/redo and JSON save/load
- `#/review`: **Validation & compare**, problem markers from a host validator (badges, F8 navigation) and a comparison with a saved version (changes marked, removed items as ghosts)
- `#/stress`: **Stress test**, 500 nodes / 1,000 links / 2,000 values at 1 Hz with live perf metrics
- `#/gallery`: every symbol with its ports, in light and dark
- Guides: `#/getting-started`, `#/theming`, `#/custom-symbols`, `#/api`

## Performance

The strict NFR-1 budgets (data tick ≤ 4 ms, drag re-route ≤ 16 ms, ≥ 55 fps at 500 nodes / 1k links / 2k values) are verified locally and in the bench test (measured: 1.1 ms / 1.0 ms / 60 fps); on shared CI runners the e2e gate enforces 1.5× headroom. Try it yourself on the `#/stress` demo page.

## Development

pnpm workspace + Turborepo, Node 20 or later. `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm size` (bundle budgets) and `pnpm --filter docs e2e` (Playwright; visual baselines come from Linux CI). See [CLAUDE.md](./CLAUDE.md) for the full command list and conventions.

## License

[MIT](./LICENSE)
