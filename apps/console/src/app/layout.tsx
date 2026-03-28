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
        <nav className="border-b border-gray-800 px-6 py-3 flex items-center gap-8 sticky top-0 z-50 bg-gray-950/95 backdrop-blur">
          <a href="/" className="text-indigo-400 font-bold tracking-widest text-sm uppercase">
            Bpollo
          </a>
          <div className="flex items-center gap-6 text-sm">
            <a href="/graph"            className="text-gray-400 hover:text-white transition-colors">Business Graph</a>
            <a href="/personal-graphs"  className="text-gray-400 hover:text-white transition-colors">Personal Graphs</a>
            <a href="/watches"          className="text-gray-400 hover:text-white transition-colors">Watches</a>
            <a href="/entities"         className="text-gray-400 hover:text-white transition-colors">Entities</a>
          </div>
        </nav>
        <main className="px-6 py-8 max-w-7xl mx-auto">
          {children}
        </main>
      </body>
    </html>
  )
}
