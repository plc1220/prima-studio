"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Theme } from "@astryxdesign/core/theme";
import { AppShell } from "@astryxdesign/core/AppShell";
import { Badge } from "@astryxdesign/core/Badge";
import { SideNav, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { TopNav, TopNavHeading } from "@astryxdesign/core/TopNav";
import { Film, LayoutDashboard, Layers, Newspaper, WandSparkles } from "lucide-react";
import { primaTheme } from "@/lib/prima.js";

const primaryNav = [
  { href: "/workspaces", label: "Workspaces", icon: Layers },
  { href: "/workbench", label: "Workbench", icon: LayoutDashboard },
  { href: "/newsroom", label: "Newsroom", icon: Newspaper },
  { href: "/video-clipping", label: "Video Clipping", icon: Film },
  { href: "/shorts", label: "Shorts Generator", icon: WandSparkles }
];

export function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

  return (
    <Theme theme={primaTheme} mode="light">
      <AppShell
        height="auto"
        variant="elevated"
        contentPadding={6}
        topNav={
          <TopNav
            label="Prima Studio"
            heading={
              <TopNavHeading
                as={Link}
                heading="Prima Studio"
                headingHref="/workspaces"
                superheading="Media Prima"
                logo={
                  <span className="app-frame-logo" aria-hidden="true">
                    <Image src="/brand/media-prima-logo.png" alt="" width={92} height={43} priority />
                  </span>
                }
              />
            }
            endContent={
              <span className="app-frame-status">
                <Badge variant="red" label="AI video studio" />
                <span className="api-pill">API: {apiBaseUrl}</span>
              </span>
            }
          />
        }
        sideNav={
          <SideNav
            topContent={
              <Link className="app-frame-primary-link" href="/workbench">
                <LayoutDashboard size={16} /> Open unified workbench
              </Link>
            }
            footer={<span className="side-nav-footer">Media Prima colour system retained through the Prima Astryx theme.</span>}
            collapsible
          >
            <SideNavSection title="Production">
              {primaryNav.map((item) => (
                <SideNavItem
                  as={Link}
                  href={item.href}
                  icon={item.icon}
                  selectedIcon={item.icon}
                  isSelected={pathname === item.href || pathname.startsWith(`${item.href}/`)}
                  label={item.label}
                  key={item.href}
                />
              ))}
            </SideNavSection>
          </SideNav>
        }
      >
        <main className="main">{children}</main>
      </AppShell>
    </Theme>
  );
}
