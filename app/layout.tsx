import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Piłkarz: Na Pełnej — kariera, którą naprawdę grasz",
  description: "Szybka i humorystyczna gra o karierze piłkarza z pełnym silnikiem meczu oraz minigrami bezpośrednio wpływającymi na wynik.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pl"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>;
}
