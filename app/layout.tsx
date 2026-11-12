import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "REBUILD AI — Make surplus useful",
  description: "Identify, exchange, reuse, or responsibly dispose of surplus materials.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
