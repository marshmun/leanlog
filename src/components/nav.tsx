'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  ClipboardList,
  Dumbbell,
  TrendingUp,
  Camera,
  UserCircle,
  LogOut,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const items = [
  { href: '/',           label: 'Dashboard', icon: LayoutDashboard },
  { href: '/check-in',  label: 'Check-In',  icon: ClipboardList   },
  { href: '/activity',  label: 'Activity',  icon: Dumbbell        },
  { href: '/analytics', label: 'Analytics', icon: TrendingUp      },
  { href: '/photos',    label: 'Photos',    icon: Camera          },
  { href: '/profile',   label: 'Profile',   icon: UserCircle      },
]

const AUTH_PATHS = ['/login', '/signup']

export function Nav() {
  const pathname = usePathname()
  const router   = useRouter()

  // Don't render on auth pages
  if (AUTH_PATHS.includes(pathname)) return null

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      {/* ── Desktop sidebar ──────────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col fixed left-0 top-0 bottom-0 w-56 bg-neutral-900 border-r border-neutral-800 z-50">
        {/* Logo */}
        <div className="px-6 py-5 border-b border-neutral-800">
          <p className="text-lg font-bold tracking-tight text-white">LeanLog</p>
          <p className="text-[11px] text-emerald-400 tracking-widest uppercase mt-0.5">
            Body Comp Tracker
          </p>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {items.map(({ href, label, icon: Icon }) => {
            const active = pathname === href
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                }`}
              >
                <Icon size={17} strokeWidth={active ? 2.5 : 2} />
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Sign out */}
        <div className="px-3 py-3 border-t border-neutral-800">
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-neutral-500 hover:text-red-400 hover:bg-neutral-800 transition-colors"
          >
            <LogOut size={17} strokeWidth={2} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Mobile bottom tab bar ─────────────────────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-neutral-900/95 backdrop-blur border-t border-neutral-800">
        <div className="flex items-center justify-around h-16 px-1">
          {items.map(({ href, label, icon: Icon }) => {
            const active = pathname === href
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-col items-center gap-0.5 px-2 py-2 rounded-xl min-w-0 transition-colors ${
                  active ? 'text-emerald-400' : 'text-neutral-500'
                }`}
              >
                <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                <span className="text-[9px] font-medium truncate">{label}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
