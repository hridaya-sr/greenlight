import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Greenlight",
  description: "Annual chapter compliance review for national headquarters",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
