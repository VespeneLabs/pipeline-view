import { useState } from 'react';

/** Code block with a copy button. */
export function Code({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(children).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="code">
      <button type="button" className="code-copy" onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre>
        <code>{children}</code>
      </pre>
    </div>
  );
}
