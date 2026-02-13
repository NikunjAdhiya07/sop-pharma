import type { Metadata } from "next";
import { Inter, Noto_Sans_Gujarati } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });
const gujarati = Noto_Sans_Gujarati({ 
  subsets: ["gujarati"],
  weight: ['400', '700'],
  variable: '--font-gujarati'
});

export const metadata: Metadata = {
  title: "SOP MCQ Bank Generator",
  description: "Generate high-quality MCQs from SOP documents using Gemini AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} ${gujarati.variable}`}>{children}</body>
    </html>
  );
}
