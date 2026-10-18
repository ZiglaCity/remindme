import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RemindMe",
  description:
    "A little less to keep in your head. Personal reminders, kept simple.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
