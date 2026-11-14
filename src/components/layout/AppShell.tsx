import { Menu as MenuIcon, X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { Suspense, useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import { Spinner } from '@/components/ui/feedback'
import { cn } from '@/lib/utils'
import { BuiltBy } from './BuiltBy'
import { Logo } from './Logo'
import { MOBILE_PRIMARY } from './nav'
import { SidebarNav, Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { UpdatePrompt } from '@/components/system/UpdatePrompt'
import { useBackgroundSync } from '@/hooks/useBackgroundSync'
import { usePushSync } from '@/hooks/usePushSync'

function MobileDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-ink-950/60 lg:hidden" />
        <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 flex w-[min(20rem,85vw)] flex-col bg-sidebar text-sidebar-foreground shadow-raised focus:outline-none lg:hidden">
          <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">GradPath sections</DialogPrimitive.Description>
          <div className="flex h-16 items-center justify-between px-5">
            <Logo />
            <DialogPrimitive.Close className="rounded-md p-2 text-sidebar-muted hover:bg-white/5" aria-label="Close navigation">
              <X className="size-5" />
            </DialogPrimitive.Close>
          </div>
          <SidebarNav onNavigate={() => onOpenChange(false)} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function BottomNav({ onOpenMenu }: { onOpenMenu: () => void }) {
  return (
    <nav
      aria-label="Quick navigation"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      {MOBILE_PRIMARY.map((item) => {
        const Icon = item.icon
        return (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground', isActive && 'text-primary')
            }
          >
            <Icon className="size-5" aria-hidden />
            {item.label}
          </NavLink>
        )
      })}
      <button type="button" onClick={onOpenMenu} className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground">
        <MenuIcon className="size-5" aria-hidden />
        More
      </button>
    </nav>
  )
}

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  useBackgroundSync()
  usePushSync()
  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground">
        Skip to content
      </a>
      <Sidebar />
      <MobileDrawer open={menuOpen} onOpenChange={setMenuOpen} />
      <div className="lg:pl-64">
        <TopBar onOpenMenu={() => setMenuOpen(true)} />
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-7xl px-4 pt-6 pb-8 focus:outline-none sm:px-6 lg:px-8">
          <Suspense
            fallback={
              <div className="grid min-h-[40vh] place-items-center">
                <Spinner label="Loading page" />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
        <footer className="mx-auto w-full max-w-7xl border-t px-4 pt-4 pb-24 sm:px-6 lg:px-8 lg:pb-6">
          <BuiltBy />
        </footer>
      </div>
      <BottomNav onOpenMenu={() => setMenuOpen(true)} />
      <UpdatePrompt />
    </div>
  )
}
