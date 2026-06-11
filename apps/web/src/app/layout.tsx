import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gamble Together",
  description: "Mini-jeux de casino entre amis — jetons fictifs, zéro argent réel.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
