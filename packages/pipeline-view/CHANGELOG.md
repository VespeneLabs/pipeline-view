# @vespenelabs/pipeline-view

## 1.1.0

### Minor Changes

- First registry release, on GitHub Packages (private). pipeline-view now ships as one package, `@vespenelabs/pipeline-view`, with subpath exports: `.` (core), `./symbols`, `./react` and `./styles.css`. The subpaths share one core instance (one symbol registry), and their types share one declaration of each class. React is an optional peer dependency.
