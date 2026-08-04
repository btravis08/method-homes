import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

/*
  Root layout: fonts + tokens only. The SDR site chrome (navigation,
  footer) lives in the (site) route group so /studio stays bare.

  Licensed brand fonts, self-hosted from src/fonts:
  - Feature Deck — the display serif for all titles
  - Maison Neue Book (400) + Medium (500) — Medium carries the label
    style everywhere the mono cut used to
  - Maison Neue Mono — kept as the alternative via the font-mono
    utility
*/
const featureDeck = localFont({
  src: "../fonts/FeatureDeck-Regular-Trial.woff2",
  weight: "400",
  variable: "--font-feature-deck",
  display: "swap",
});

const maison = localFont({
  src: [
    { path: "../fonts/MaisonNeue-Book.woff2", weight: "400" },
    { path: "../fonts/MaisonNeue-Medium.woff2", weight: "500" },
  ],
  variable: "--font-maison",
  display: "swap",
});

const maisonMono = localFont({
  src: "../fonts/MaisonNeue-Mono.woff2",
  weight: "400",
  variable: "--font-maison-mono",
  display: "swap",
  /* only the PDP mini-cards use the mono cut — don't spend 22KB of
     high-priority preload bandwidth on it on every page; it lazy-
     fetches where font-mono is actually rendered */
  preload: false,
});

export const metadata: Metadata = {
  title: {
    default: "Sun Day Red",
    template: "%s | Sun Day Red",
  },
  description: "SDR design library implementation.",
};

/* viewport-fit=cover exposes env(safe-area-inset-*) on iOS, so
   bottom-fixed chrome can hold an exact 16px above the home
   indicator instead of measuring from the physical screen edge */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${featureDeck.variable} ${maison.variable} ${maisonMono.variable} h-full antialiased`}
    >
      <head>
        {/* every catalog image comes from the Sanity CDN — warm the
            connection before the first image request */}
        <link rel="preconnect" href="https://cdn.sanity.io" crossOrigin="" />
        {/* Speculation Rules: Chrome fully prerenders product pages
            when their links are hovered/touched (moderate), making
            those navigations instant; other browsers ignore this */}
        <script
          type="speculationrules"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              prerender: [
                { where: { href_matches: "/products/*" }, eagerness: "moderate" },
              ],
              prefetch: [
                { where: { href_matches: "/collections/*" }, eagerness: "moderate" },
              ],
            }),
          }}
        />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
