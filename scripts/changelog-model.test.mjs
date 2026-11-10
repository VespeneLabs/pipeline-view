import assert from 'node:assert/strict';
import { test } from 'node:test';
import { liftModelNotes } from './changelog-model.mjs';

const changelog = `# @vespenelabs/pipeline-view

## 1.2.0

### Minor Changes

- abc1234: Per-node ports and refusals.

  Model: the saved model is now **version 2**. It adds the optional \`NodeModel.ports\`.
  v1 documents still load.

  Other details stay here.

- def4567: Model: \`LinkModel.locked\` is new.

### Patch Changes

- 0a1b2c3: A fix.

## 1.1.0

### Minor Changes

- Model: an old note that must not move.
`;

test('moves Model: paragraphs of the newest version into "### Model"', () => {
  const out = liftModelNotes(changelog);
  assert.equal(
    out,
    `# @vespenelabs/pipeline-view

## 1.2.0

### Model

- the saved model is now **version 2**. It adds the optional \`NodeModel.ports\`. v1 documents still load.
- \`LinkModel.locked\` is new.

### Minor Changes

- abc1234: Per-node ports and refusals.

  Other details stay here.

### Patch Changes

- 0a1b2c3: A fix.

## 1.1.0

### Minor Changes

- Model: an old note that must not move.
`,
  );
});

test('is idempotent and leaves changelogs without Model: notes alone', () => {
  const once = liftModelNotes(changelog);
  assert.equal(liftModelNotes(once), once);
  const plain = '# x\n\n## 1.0.0\n\n### Patch Changes\n\n- A fix.\n';
  assert.equal(liftModelNotes(plain), plain);
});

test('drops a heading left empty, and appends to an existing Model section', () => {
  const input = `# x

## 2.0.0

### Model

- Hand-written note.

### Patch Changes

- Model: only a model change.

## 1.0.0
`;
  assert.equal(
    liftModelNotes(input),
    `# x

## 2.0.0

### Model

- Hand-written note.
- only a model change.

## 1.0.0
`,
  );
});
