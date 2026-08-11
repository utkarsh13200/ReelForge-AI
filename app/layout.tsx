import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Creator's Bible — Your story, beautifully made",
  description: "The AI-powered YouTube content studio for original ideas.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
