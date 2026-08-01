import React from 'react';

export default function DemoStatusPage() {
  return (
    <main className="status-page">
      <a href="/">← RelayOps</a>
      <p className="eyebrow">DEMO SURFACE</p>
      <h1>Backend ready.<br /><em>Dashboard UI next.</em></h1>
      <p>This PR intentionally contains only a minimal web shell. Use the documented demo-session API to explore tenant-scoped Northstar HVAC and PrimeFlow Plumbing records.</p>
      <code>POST http://localhost:3001/api/demo/session</code>
    </main>
  );
}
