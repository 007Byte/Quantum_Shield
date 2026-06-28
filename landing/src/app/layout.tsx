import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { GlobalStarField } from "@/components/ui/GlobalStarField";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-inter",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Quantum_Shield | Post-Quantum Encrypted USB Vault",
  description:
    "Military-grade post-quantum encryption for your files, passwords, and messages. Zero-knowledge. Cross-platform. Hardware-isolated on USB.",
  keywords: [
    "post-quantum encryption",
    "USB vault",
    "zero-knowledge",
    "encrypted storage",
    "password manager",
    "FIDO2",
    "ML-KEM-1024",
    "AES-256-GCM-SIV",
  ],
  authors: [{ name: "USBVault" }],
  openGraph: {
    title: "Quantum_Shield | Post-Quantum Encrypted USB Vault",
    description:
      "Military-grade post-quantum encryption for your files, passwords, and messages.",
    type: "website",
    locale: "en_US",
    siteName: "USBVault",
  },
  twitter: {
    card: "summary_large_image",
    title: "Quantum_Shield",
    description:
      "Post-quantum encryption. Zero-knowledge. Hardware-isolated on USB.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable} antialiased`}>
      <body className="min-h-screen bg-vault-bg text-vault-text font-sans grain grid-bg">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-vault-accent focus:text-white focus:rounded-lg"
        >
          Skip to content
        </a>
        <GlobalStarField />
        {children}
      </body>
    </html>
  );
}
