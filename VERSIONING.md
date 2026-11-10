# Versioning and deprecation policy

`@vespenelabs/pipeline-view` is published privately to GitHub Packages. There is no public npm package. It follows [Semantic Versioning](https://semver.org/). The version covers the whole package: the root entry and every subpath.

## What the public API is

These are covered by semver:

- **Exports** of `@vespenelabs/pipeline-view`, `/symbols`, `/react` and `/testing`: their names, signatures and documented behaviour.
- **The saved model**, the JSON written by `diagram.toJSON()`. See [the saved model](#the-saved-model).
- **Symbol type ids and port ids**, such as `gas/gate-valve` with ports `in` and `out`. Saved links refer to them.
- **Events**: their names and payload fields.
- **CSS custom properties** (`--pv-*`) listed on the Theming page, and the light/dark `data-theme` switch.
- **Documented DOM attributes**: `data-status`, `data-mode`, the stable test ids `data-pv-node-id` / `data-pv-port-id` / `data-pv-link-id`, and any other `data-*` attribute that the docs describe as a styling or testing hook.
- **Runtime support**: Node ≥ 20, React ≥ 18 for `/react`, current evergreen browsers.

These are **not** covered, and may change in any release:

- Anything marked `@internal`, or not mentioned in the docs. This includes `diagram.renderer`, `diagram.overlay`, `diagram.internal` and `InternalEvents`.
- The private workspace packages `@pipeline-view/*`. They are bundled into the published package and never installed directly.
- `.pv-*` class names and the DOM structure. Style through the `--pv-*` tokens and the documented `data-*` attributes.
- Exact rendering: pixel output, the routes the router picks, symbol artwork details that keep the port ids and positions.
- Performance figures, as long as the PRD budgets still hold.

## What goes in which release

| Release | Contains |
| --- | --- |
| **Major** (`2.0.0`) | Removing or renaming public API. An incompatible behaviour change. Removing a symbol or renaming its ports. A model change that needs a manual conversion. Dropping a supported Node, React or browser version. Removing deprecated API. |
| **Minor** (`1.2.0`) | New features, options, events, symbols and tokens. New optional model fields. A new model version that older documents are migrated to automatically (see below). Deprecations. |
| **Patch** (`1.2.1`) | Bug fixes, documentation, performance work, and visual fixes that keep port ids and positions. |

Pre-releases (`1.3.0-next.0`) are for trying a feature early, and may break between pre-releases.

## Deprecation

1. A deprecated API gets a `@deprecated` JSDoc tag that names its replacement, so editors strike it through.
2. Its changeset says `Deprecated:` with the replacement and a migration hint.
3. Where the library can detect the deprecated use at runtime, such as a deprecated option, it calls `console.warn` once per page.
4. A deprecated API keeps working for **at least one minor release**, and is removed only in the **next major**. The major's changelog lists every removal together with its replacement.

## The saved model

Diagrams are long-lived data: hosts store them in databases and files. Changes to the saved model therefore get extra care.

- The model carries a `version`. Any later 1.x release can load a model saved by any 1.x release. Older versions are **migrated on load** by `migrateModel`, and `toJSON()` always writes the current version.
- Downgrades aren't supported. An older release refuses a model with a newer `version`, with a clear error, rather than guessing. If several apps share stored diagrams, upgrade them together.
- A new model version may ship in a minor release only when the migration is automatic and lossless. Anything else is a major.
- New model fields are optional. A model without them behaves exactly as before.
- Every change to the saved model is listed in the changelog's **Model** section, even when it is backwards compatible.

## Changelog convention

Each user-facing change gets a changeset that names `@vespenelabs/pipeline-view` (see [.changeset/README.md](./.changeset/README.md)). Start a line or paragraph in the changeset with **`Model:`** when the change affects the saved JSON:

```md
---
'@vespenelabs/pipeline-view': minor
---

Per-node ports.

Model: `NodeModel.ports` is new (optional). The model is now version 2; v1 documents are migrated on load.
```

`pnpm version-packages` runs `changeset version` and then `scripts/changelog-model.mjs`. The script gathers every `Model:` paragraph of the new release into a `### Model` section at the top of its CHANGELOG entry, which also appears in the GitHub Release notes. Integrators can then read that one section to see whether their stored diagrams are affected.

## Supported versions

Fixes go into the latest minor release. Older release lines don't get backports unless agreed case by case.
