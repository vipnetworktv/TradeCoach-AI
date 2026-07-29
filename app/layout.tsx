import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "TradeCoach AI",
    template: "%s | TradeCoach AI",
  },
  description:
    "AI-powered trading coach that imports your real trades, grades performance, and helps you trade with more discipline.",
  icons: {
    icon: "/brand/tradecoach-ai-icon.png",
    apple: "/brand/tradecoach-ai-icon.png",
  },
  openGraph: {
    title: "TradeCoach AI",
    description:
      "Turn every trade into a lesson with automatic tracking, AI coaching, and performance reports.",
    siteName: "TradeCoach AI",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
