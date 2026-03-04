import "./globals.css";

export const metadata = {
  title: "Mushee Yield — Powered by Starkzap",
  description: "Mushee (UK incorporated) — Make yield feel like a button."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
