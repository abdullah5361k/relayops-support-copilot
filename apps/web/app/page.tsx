import React from 'react';
import Link from 'next/link';

export default function HomePage() {
  return (
    <main>
      <nav><strong><span>R</span> RelayOps</strong><a href="https://github.com/abdullah5361k/relayops-support-copilot">Source</a></nav>
      <section className="hero">
        <p className="eyebrow">BACKEND FOUNDATION · MILESTONE 1</p>
        <h1>Field service work,<br /><em>clearly coordinated.</em></h1>
        <p>RelayOps is an original, fictional multi-tenant SaaS portfolio project for local service teams. This focused milestone establishes its API, data model, tenant boundary, and synthetic demo data.</p>
        <div className="actions"><Link href="/demo">View demo status</Link><a href="http://localhost:3001/api/health">API health</a></div>
      </section>
      <section className="facts" aria-label="Foundation details">
        <article><b>02</b><span>isolated synthetic tenants</span></article>
        <article><b>00</b><span>paid services or credentials</span></article>
        <article><b>API</b><span>NestJS + PostgreSQL + Prisma</span></article>
      </section>
    </main>
  );
}
