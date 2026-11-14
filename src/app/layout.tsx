import { GoogleTagManager } from "@next/third-parties/google";
import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro, Geist_Mono } from "next/font/google";
import "highlight.js/styles/github-dark.css";
import "./globals.css";

import { ThemeSync } from "@/components/theme-sync";
import { APP_NAME, GTM_ID, STORAGE_KEY } from "@/lib/config";

// Be Vietnam Pro is designed for Vietnamese, so diacritics never fall back to another font.
const beVietnam = Be_Vietnam_Pro({
  variable: "--font-be-vietnam",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
});
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Private family chat, powered by 9router.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#131317" },
  ],
};

// Applies the saved theme before first paint so dark mode doesn't flash white.
const themeScript = `try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(
  STORAGE_KEY,
)}));document.documentElement.dataset.theme=(s&&s.state&&s.state.settings&&s.state.settings.theme)||"system"}catch(e){document.documentElement.dataset.theme="system"}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="system" suppressHydrationWarning className={`${beVietnam.variable} ${geistMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      {process.env.NODE_ENV === "production" && GTM_ID && <GoogleTagManager gtmId={GTM_ID} />}
      <body className="bg-bg font-sans text-text antialiased">
        <ThemeSync />
        {children}
      </body>
    </html>
  );
}
