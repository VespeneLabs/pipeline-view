import type { ReactNode } from 'react';

/** The short "What to try" panel every demo page starts with: 3–6 concrete steps. */
export function WhatToTry({ steps }: { steps: ReactNode[] }) {
  return (
    <aside className="what-to-try" aria-label="What to try">
      <h2>What to try</h2>
      <ol>
        {steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
    </aside>
  );
}
