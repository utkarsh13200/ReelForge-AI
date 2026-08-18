import type { Metadata } from "next";
import { Inter, Syne } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const syne = Syne({ subsets: ["latin"], variable: "--font-syne" });

export const metadata: Metadata = {
  title: "ReelForge AI — Topic to finished video",
  description: "Turn a topic or YouTube video into a fully produced short or long-form video.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="stylesheet" href="/theme.css" />
        <link rel="stylesheet" href="/app.css" />
      </head>
      <body className={`${inter.variable} ${syne.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
