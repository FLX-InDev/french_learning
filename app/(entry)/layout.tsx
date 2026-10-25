import "../globals.css";

export const viewport = { width: "device-width", initialScale: 1 };

export default function EntryLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
