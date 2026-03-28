import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Bpollo Console",
  description: "Internal state inspector for the Bpollo AI orchestration system",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 min-h-screen font-mono">
        <nav className="border-b border-gray-800 px-6 py-3 flex items-center gap-8">
          <span className="text-indigo-400 font-bold tracking-widest text-sm uppercase">Bpollo Console</span>
          <a href="/graph"    className="text-sm text-gray-400 hover:text-white transition-colors">Graph</a>
          <a href="/entities" className="text-sm text-gray-400 hover:text-white transition-colors">Entities</a>
        </nav>
        <main className="px-6 py-8 max-w-6xl mx-auto">
          {children}
        </main>
      </body>
    </html>
  )
}
