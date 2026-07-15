import type { Metadata } from "next";
import { AppFrame } from "@/components/AppFrame";
import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";
import "@/lib/prima.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Prima Studio",
  description: "AI video clipping and social-short generation studio"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="light">
      <body>
        <AppFrame>{children}</AppFrame>
      </body>
    </html>
  );
}
