import type { Metadata } from "next";
import type { ReactNode } from "react";

import { appMetadata } from "@lexora/config";

import { AppProviders } from "@/components/providers/app-providers";

import "./globals.css";

export const metadata: Metadata = {
  title: appMetadata.name,
  description: appMetadata.description
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body><AppProviders>{children}</AppProviders></body>
    </html>
  );
}
