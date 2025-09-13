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
  title: "IWC Console",
  description: "Wedding consulting CRM application",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* Set theme early to avoid flash; hydration differences are suppressed on <html> */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var de=document.documentElement;de.classList.remove('dark');var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t='light';localStorage.setItem('theme','light');}de.setAttribute('data-theme',t);if(t==='dark')de.classList.add('dark');}catch{}",
          }}
        />
        {children}
      </body>
    </html>
  );
}
