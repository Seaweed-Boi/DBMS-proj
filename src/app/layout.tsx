import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DRRMS — Disaster Relief Resource Management",
  description: "Coordinate disaster relief inventory, requests, allocations and volunteers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
