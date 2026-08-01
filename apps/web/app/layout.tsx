import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: { default: "RelayOps — Field service, in rhythm", template: "%s · RelayOps" }, description: "A fictional field-service operations and support portfolio experience." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
