import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Job Tracker Pro",
  description: "Track jobs, tailor resumes, and apply smarter.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen">
        <header className="border-b border-slate-700/50 bg-slate-950/80 backdrop-blur">
          <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
            <h1 className="text-xl font-bold tracking-tight">
              Job Tracker <span className="text-blue-500">Pro</span>
            </h1>
            <nav className="flex gap-6 text-sm text-slate-400">
              <Link href="/" className="hover:text-white transition">
                Dashboard
              </Link>
              <Link href="/jobs" className="hover:text-white transition">
                Jobs
              </Link>
              <Link href="/resumes" className="hover:text-white transition">
                Resume
              </Link>
              <Link href="/experience" className="hover:text-white transition">
                Experience Bank
              </Link>
              <Link href="/applications" className="hover:text-white transition">
                Applications
              </Link>
              <Link href="/settings" className="hover:text-white transition">
                Settings
              </Link>
            </nav>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  );
}

