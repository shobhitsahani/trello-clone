import type { Metadata } from "next";
import { Hanken_Grotesk, Inter, JetBrains_Mono, Manrope, Sora } from "next/font/google";
import "./globals.css";
import "./trello.css";
import "./theme.css";
import "./lagoon.css";
import { Providers } from "./providers";
import { Toaster } from "@/components/ui/toast";

const sans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const display = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

/* Lagoon joyful theme fonts (ported from treloo-joyful-design). */
const lagoonDisplay = Sora({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-lagoon-display",
  display: "swap",
});

const lagoonBody = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-lagoon-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Signal Board · TeamFlow",
  description:
    "Purple Trello-clone board — projects, kanban, members and live team chat.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sans.variable} ${display.variable} ${mono.variable} ${lagoonDisplay.variable} ${lagoonBody.variable}`}
    >
      <head>
        {/* Set .dark pre-paint to avoid a light flash (matches ThemeProvider key). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("tf.theme.v1");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}if(t==="dark"){document.documentElement.classList.add("dark")}document.documentElement.style.colorScheme=t}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}