import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import NavBar from "@/components/NavBar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Accounting System",
  description: "Enterprise project-based double-entry accounting system",
  icons: {
    icon: "/aura-logo.webp",
    shortcut: "/aura-logo.webp",
    apple: "/aura-logo.webp",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className} suppressHydrationWarning>
        <Providers>
          <div className="app-shell">
            <NavBar />
            <main>{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
