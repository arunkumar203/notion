'use client';

import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { NotebookProvider } from "@/context/NotebookContext";
import GlobalDragOverlay from "@/components/Files/GlobalDragOverlay";
import dynamic from 'next/dynamic';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Dynamically import the FirstTimeSetup component with no SSR
const FirstTimeSetup = dynamic(
  () => import('@/components/onboarding/FirstTimeSetup'),
  { ssr: false }
);

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AuthProvider>
          <NotebookProvider>
            {children}
            <FirstTimeSetup />
            <GlobalDragOverlay />
          </NotebookProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
