import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Film, Home, Layers, Newspaper, WandSparkles } from "lucide-react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Prima Studio",
  description: "AI video clipping and social-short generation studio"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <header className="site-header">
            <Link href="/" className="brand" aria-label="Prima Studio home">
              <Image src="/brand/media-prima-logo.png" alt="Media Prima" width={153} height={72} priority />
              <span className="brand-lockup">
                <span className="brand-title">Prima Studio</span>
              </span>
            </Link>
            <nav className="nav" aria-label="Primary navigation">
              <Link href="/">
                <Home size={18} /> Dashboard
              </Link>
              <Link href="/workspaces">
                <Layers size={18} /> Workspaces
              </Link>
              <Link href="/newsroom">
                <Newspaper size={18} /> Newsroom
              </Link>
              <Link href="/video-clipping">
                <Film size={18} /> Video Clipping
              </Link>
              <Link href="/shorts">
                <WandSparkles size={18} /> Shorts Generator
              </Link>
            </nav>
            <div className="api-pill">
              API: {process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080"}
            </div>
          </header>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
