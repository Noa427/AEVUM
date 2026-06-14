'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, Users, ListChecks, Settings, LogOut, Zap, X, FileBarChart } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

const links = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/clients', label: 'Clients', icon: Users },
  { href: '/tasks', label: 'Tâches', icon: ListChecks },
  { href: '/reports', label: 'Rapports', icon: FileBarChart },
  { href: '/settings', label: 'Paramètres', icon: Settings },
]

interface SidebarProps {
  mobileOpen?: boolean
  onMobileClose?: () => void
}

export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <>
      {/* Overlay mobile */}
      {mobileOpen && (
        <div
          className="sidebar-overlay md:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          'flex-shrink-0 flex flex-col sidebar-glass',
          'fixed md:relative inset-y-0 left-0 z-40',
          'w-56',
          'transition-transform duration-200 ease-in-out',
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-4 py-[14px] border-b border-border/60">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-primary" strokeWidth={2.5} />
            </div>
            <span className="font-semibold text-sm tracking-tight text-foreground">
              AEVUM<span className="text-primary"> APP</span>
            </span>
          </div>
          {/* Bouton fermer sur mobile */}
          {onMobileClose && (
            <button
              onClick={onMobileClose}
              className="md:hidden p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
              aria-label="Fermer le menu"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2 pt-3 space-y-0.5">
          <p className="section-label mb-2">Navigation</p>
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={onMobileClose}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-all duration-150 overflow-hidden',
                pathname.startsWith(href)
                  ? 'sidebar-link-active'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{label}</span>
            </Link>
          ))}
        </nav>

        {/* Footer : avatar + déconnexion */}
        <div className="p-2 border-t border-border/60 space-y-1">
          {/* Avatar utilisateur */}
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-md">
            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
              <span className="text-[10px] font-semibold text-primary">A</span>
            </div>
            <span className="text-xs text-muted-foreground truncate">Mon compte</span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent/60 w-full transition-all duration-150"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            <span>Déconnexion</span>
          </button>
        </div>
      </aside>
    </>
  )
}

