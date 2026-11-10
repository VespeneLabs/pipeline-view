import {
  getDiff,
  type Diagram,
  type DiagramModel,
  type Issue,
  type ItemRef,
} from '@pipeline-view/core';
import { PipelineView } from '@pipeline-view/react';
import { gateValve, processSymbols } from '@pipeline-view/symbols';
import { useMemo, useState } from 'react';
import { WhatToTry } from '../../components/WhatToTry';
import { describeItem, savedModel, validate, workingModel } from './model';
import '../demo.css';

const symbols = [...processSymbols, gateValve];

/** `?static`: validation and comparison on from the start, for the visual test. */
const STATIC = new URLSearchParams(location.search).has('static');

export function ReviewDemo() {
  const [diagram, setDiagram] = useState<Diagram | null>(null);
  const [model] = useState(workingModel);
  const [current, setCurrent] = useState<DiagramModel>(workingModel);
  const [saved, setSaved] = useState<DiagramModel>(savedModel);
  const [validated, setValidated] = useState(STATIC);
  const [comparing, setComparing] = useState(STATIC);

  // Validation is host logic: re-run it on every edit once switched on, and hand the result to the view.
  const issues = useMemo(() => (validated ? validate(current) : undefined), [validated, current]);
  const diff = useMemo(
    () => (comparing ? getDiff(saved, current) : null),
    [comparing, saved, current],
  );

  const issueRows = useMemo(() => {
    if (!issues) return [];
    const rows: { item: ItemRef; issue: Issue }[] = [];
    for (const [kind, byId] of [
      ['node', issues.nodes],
      ['link', issues.links],
    ] as const)
      for (const [id, list] of Object.entries(byId ?? {}))
        for (const issue of list) rows.push({ item: { kind, id }, issue });
    const rank = { error: 0, warning: 1, info: 2 };
    return rows.sort((a, b) => rank[a.issue.severity] - rank[b.issue.severity]);
  }, [issues]);

  const reveal = (item: ItemRef) => {
    if (!diagram) return;
    diagram.setSelection([item]);
    diagram.zoomToItem(item, { animate: true });
  };

  const onReady = (d: Diagram) => {
    setDiagram(d);
    (window as unknown as { __diagram?: Diagram }).__diagram = d; // for tests and the console
  };

  const reset = () => {
    diagram?.load(workingModel);
    setCurrent(workingModel);
    setSaved(savedModel);
    diagram?.zoomToFit({ padding: 32 });
  };

  const counts = issues
    ? (['error', 'warning', 'info'] as const).map(
        (s) => [s, issueRows.filter((r) => r.issue.severity === s).length] as const,
      )
    : [];

  return (
    <>
      <h1>Validation &amp; compare</h1>
      <p className="lede">
        Two kinds of review overlay that never touch the saved model.{' '}
        <strong>Problem markers</strong> show what a validator (yours) found, with a badge, a
        tooltip and keyboard navigation. <strong>Compare</strong> marks what changed since a saved
        version, with removed items drawn as ghosts.
      </p>
      <WhatToTry
        steps={[
          <>
            Click <b>Validate</b>. Hover a badge for its messages, then press <kbd>F8</kbd> /{' '}
            <kbd>Shift</kbd>+<kbd>F8</kbd> in the diagram to step through them.
          </>,
          <>Connect P-102&apos;s discharge to the cone tank: the error clears as you edit.</>,
          <>
            Turn on <b>Compare with saved version</b>: P-101 is moved, FCV-101A changed, P-102
            added, XV-201 is a ghost.
          </>,
          <>Drag a node or delete a link, and watch the change list update.</>,
          <>
            Click <b>Save this version</b>: the comparison is now clean.
          </>,
        ]}
      />
      <div className="demo-toolbar" role="toolbar" aria-label="Review">
        <button
          type="button"
          className="demo-btn"
          aria-pressed={validated}
          data-testid="validate"
          onClick={() => setValidated((v) => !v)}
        >
          {validated ? 'Validation on' : 'Validate'}
        </button>
        <button
          type="button"
          className="demo-btn"
          disabled={!issueRows.length}
          onClick={() => diagram?.nextIssue()}
        >
          Next problem (F8)
        </button>
        <span className="editor-sep" aria-hidden />
        <button
          type="button"
          className="demo-btn"
          aria-pressed={comparing}
          data-testid="compare"
          onClick={() => setComparing((v) => !v)}
        >
          Compare with saved version
        </button>
        <button type="button" className="demo-btn" onClick={() => setSaved(current)}>
          Save this version
        </button>
        <span className="editor-sep" aria-hidden />
        <button type="button" className="demo-btn" onClick={reset}>
          Reset demo
        </button>
      </div>
      <div className="demo-split">
        <div className="demo-canvas" data-testid="review-canvas">
          <PipelineView
            model={model}
            mode="edit"
            symbols={symbols}
            issues={issues}
            compareWith={comparing ? saved : null}
            options={{ ariaLabel: 'Process diagram under review' }}
            style={{ height: '100%' }}
            onReady={onReady}
            onModelChange={(e) => setCurrent(e.model)}
          />
        </div>
        <div className="demo-panel">
          <section aria-labelledby="issues-h" data-testid="issue-list">
            <h2 id="issues-h">Problems</h2>
            {!issues ? (
              <p>Not validated yet.</p>
            ) : issueRows.length === 0 ? (
              <p>No problems found.</p>
            ) : (
              <>
                <p>
                  {counts
                    .filter(([, n]) => n)
                    .map(([s, n]) => `${n} ${s}${n > 1 ? 's' : ''}`)
                    .join(', ')}
                </p>
                <ul className="demo-list">
                  {issueRows.map(({ item, issue }, i) => (
                    <li key={`${item.id}-${i}`}>
                      <button type="button" onClick={() => reveal(item)}>
                        <span className="chip" data-severity={issue.severity}>
                          {issue.severity}
                        </span>
                        <span>
                          <b>{describeItem(item.kind as 'node' | 'link', item.id, current)}</b>:{' '}
                          {issue.message}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
          <section aria-labelledby="changes-h" data-testid="change-list">
            <h2 id="changes-h">Changes since the saved version</h2>
            {!diff ? (
              <p>Comparison is off.</p>
            ) : diff.nodes.length + diff.links.length === 0 ? (
              <p>No changes.</p>
            ) : (
              <ul className="demo-list">
                {(['node', 'link'] as const).flatMap((kind) =>
                  diff[`${kind}s`].map(({ id, mark }) => (
                    <li key={`${kind}-${id}`}>
                      <button
                        type="button"
                        disabled={mark === 'removed'}
                        onClick={() => reveal({ kind, id })}
                      >
                        <span className="chip" data-mark={mark}>
                          {mark}
                        </span>
                        <span>
                          {kind === 'link' ? 'Line ' : ''}
                          {describeItem(kind, id, current, saved)}
                        </span>
                      </button>
                    </li>
                  )),
                )}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
