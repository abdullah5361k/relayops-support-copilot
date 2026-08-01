'use client';

import { useState } from 'react';

export interface SupportWidgetProps {
  organizationName?: string;
}

export function SupportWidget({ organizationName = 'your team' }: SupportWidgetProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relayops-widget">
      {open ? (
        <section className="relayops-widget__panel" aria-label="Support preview">
          <button className="relayops-widget__close" onClick={() => setOpen(false)} aria-label="Close support preview">×</button>
          <span className="relayops-widget__eyebrow">SUPPORT PREVIEW</span>
          <h2>Help for {organizationName}</h2>
          <p>The website support assistant arrives in a later milestone. For now, use the ticket view in your dashboard.</p>
          <a href="/demo#support">Open support tickets</a>
        </section>
      ) : null}
      <button className="relayops-widget__trigger" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span aria-hidden="true">?</span> Support
      </button>
    </div>
  );
}
