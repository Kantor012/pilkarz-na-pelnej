import type { Metadata } from "next";
import { headers } from "next/headers";
import "@fontsource-variable/montserrat";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og.png`;
  const title = "Piłkarz: Na Pełnej — kariera, którą naprawdę grasz";
  const description = "Szybka i humorystyczna gra o karierze piłkarza z pełnym silnikiem meczu oraz minigrami bezpośrednio wpływającymi na wynik.";
  return {
    title,
    description,
    openGraph: { title, description, type: "website", images: [{ url: imageUrl, width: 1536, height: 1024, alt: "Piłkarz: Na Pełnej" }] },
    twitter: { card: "summary_large_image", title, description, images: [imageUrl] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pl"><body>{children}</body></html>;
}
