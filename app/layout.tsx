import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Goals Game",
  description: "Win the week together.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Goals Game", statusBarStyle: "black-translucent" }
};

export const viewport: Viewport = {
  themeColor: "#101218",
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}