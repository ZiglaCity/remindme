import type { Metadata, Viewport } from "next";
import { PwaProvider } from "@/components/pwa";
import localFont from "next/font/local";
import "./globals.css";
const bodyFont = localFont({
  src: "./fonts/dm-sans.ttf",
  variable: "--font-body",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "RemindMe",
  description:
    "A little less to keep in your head. Personal reminders, kept simple.",
  applicationName: "RemindMe",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "RemindMe" },
  icons: { icon: "/favicon.svg", apple: "/icons/apple-touch-icon.png" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f7f6f2",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={bodyFont.variable}>
      <body>
        <PwaProvider
          enabled={
            process.env.NODE_ENV === "production" ||
            process.env.REMINDME_E2E === "1"
          }
        >
          {children}
        </PwaProvider>
      </body>
    </html>
  );
}
