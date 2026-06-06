import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Proctor — Agent QA",
  description: "Proctor: the agent that QAs other agents",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
