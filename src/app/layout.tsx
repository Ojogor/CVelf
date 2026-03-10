import type { Metadata } from "next";
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
              <a href="/" className="hover:text-white transition">
                Dashboard
              </a>
              <a href="/jobs" className="hover:text-white transition">
                Jobs
              </a>
              <a href="/resumes" className="hover:text-white transition">
                Resumes
              </a>
              <a href="/stats" className="hover:text-white transition">
                Statistics
              </a>
            </nav>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  );
}

