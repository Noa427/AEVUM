'use client'
import { useState } from 'react'
import { Sidebar } from '@/components/sidebar'
import { Menu, Zap } from 'lucide-react'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header mobile */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-border/60 bg-card/80 backdrop-blur-sm sticky top-0 z-20">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
            aria-label="Ouvrir le menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded bg-primary/15 flex items-center justify-center">
              <Zap className="w-3 h-3 text-primary" strokeWidth={2.5} />
            </div>
            <span className="font-semibold text-sm">Automate<span className="text-primary">Pro</span></span>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  )
}

