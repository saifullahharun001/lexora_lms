import "./globals.css";

import { appMetadata } from "@lexora/config";
import type { Metadata } from "next";
import { EB_Garamond } from "next/font/google";
import type { ReactNode } from "react";

import { AppProviders } from "@/components/providers/app-providers";

const ebGaramond = EB_Garamond({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-eb-garamond"
});

export const metadata: Metadata = {
  title: appMetadata.name,
  description: appMetadata.description
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className={ebGaramond.variable}>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
