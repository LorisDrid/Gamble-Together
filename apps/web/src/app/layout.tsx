import type { Metadata } from "next";
import { Jost, Limelight } from "next/font/google";
import "./globals.css";

import { ServerStatus } from "@/components/ServerStatus";

const display = Limelight({ weight: "400", subsets: ["latin"], variable: "--font-display" });
const body = Jost({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "Gamble Together",
  description: "Blackjack, roulette et poker en multijoueur par code de table.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className={`${display.variable} ${body.variable}`}>
        <ServerStatus />
        {children}
      </body>
    </html>
  );
}
