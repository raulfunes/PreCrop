import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  title: 'PreCrop · Evidencia del cultivo para decidir anticipos',
  description:
    'PreCrop convierte información satelital y climática en una lectura clara de la condición del lote, para ayudar a cooperativas y financiadores a decidir sobre anticipos durante la campaña.',
  keywords: ['PreCrop', 'cultivo', 'lote', 'anticipo', 'cooperativa', 'agro', 'satélite'],
  authors: [{ name: 'PreCrop' }],
  robots: 'noindex, nofollow', // MVP de hackathon
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-AR" className={inter.className}>
      <head>
        {/* Favicon provisional con letra P en verde */}
        <link
          rel="icon"
          href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%23175e36'/><text x='50%25' y='54%25' dominant-baseline='middle' text-anchor='middle' font-family='Inter,sans-serif' font-weight='700' font-size='20' fill='white'>P</text></svg>"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
