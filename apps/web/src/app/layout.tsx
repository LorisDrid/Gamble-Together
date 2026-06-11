import type { Metadata } from "next";
import { Jost, Limelight } from "next/font/google";
import "./globals.css";

const display = Limelight({ weight: "400", subsets: ["latin"], variable: "--font-display" });
const body = Jost({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "Gamble Together",
  description: "Mini-jeux de casino entre amis — jetons fictifs, zéro argent réel.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className={`${display.variable} ${body.variable}`}>{children}</body>
    </html>
  );
}
