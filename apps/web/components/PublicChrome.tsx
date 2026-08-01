import Link from "next/link";

export function Brand({ inverse = false }: { inverse?: boolean }) {
  return <Link className="logo" href="/" aria-label="RelayOps home" style={inverse ? { color: "white" } : undefined}><span className="logo-mark" aria-hidden="true" />RelayOps</Link>;
}
export function PublicHeader() {
  return <header className="public-header"><div className="container public-nav"><Brand /><nav className="nav-links" aria-label="Primary navigation"><Link href="/#features">Product</Link><Link href="/#pricing">Pricing</Link><Link href="/help">Help centre</Link><Link className="btn btn-secondary" href="/demo">View demo</Link></nav></div></header>;
}
export function Footer() {
  return <footer className="site-footer"><div className="container"><div className="footer-grid"><div><Brand inverse /><p style={{ maxWidth: 330, lineHeight: 1.6, marginTop: 18 }}>A fictional operations workspace for independent field-service teams. Built as an honest local portfolio demo.</p></div><div><b>Explore</b><Link href="/#features">Product</Link><Link href="/#pricing">Pricing</Link><Link href="/demo">Demo workspace</Link></div><div><b>Resources</b><Link href="/help">Help centre</Link><Link href="/help/data-controls">Security overview</Link><Link href="/dashboard/support">Support states</Link></div></div><div className="footer-bottom"><span>© 2026 RelayOps — fictional portfolio product</span><span>No payment details · No external account required</span></div></div></footer>;
}
