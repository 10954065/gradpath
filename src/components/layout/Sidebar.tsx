import { NavLink } from 'react-router'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { Logo } from './Logo'
import { ADMIN_NAV, NAV_GROUPS, type NavItem } from './nav'

function SidebarLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium text-sidebar-muted transition-colors hover:bg-white/5 hover:text-sidebar-foreground',
          isActive && 'bg-sidebar-active text-sidebar-foreground shadow-[inset_2px_0_0_0_var(--color-primary)]',
        )
      }
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="truncate">{item.label}</span>
    </NavLink>
  )
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { isAdmin } = useAuth()
  return (
    <nav aria-label="Main navigation" className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 pb-4">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          <div className="mb-1.5 px-3 text-[10px] font-semibold tracking-[0.14em] text-sidebar-muted/70 uppercase">{group.label}</div>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <li key={item.to}>
                <SidebarLink item={item} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        </div>
      ))}
      {isAdmin ? (
        <div>
          <div className="mb-1.5 px-3 text-[10px] font-semibold tracking-[0.14em] text-sidebar-muted/70 uppercase">Admin</div>
          <SidebarLink item={ADMIN_NAV} onNavigate={onNavigate} />
        </div>
      ) : null}
    </nav>
  )
}

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-sidebar text-sidebar-foreground lg:flex">
      <div className="flex h-16 items-center px-6">
        <Logo />
      </div>
      <SidebarNav />
      <div className="border-t border-white/5 px-6 py-4 text-[11px] leading-relaxed text-sidebar-muted">
        Independent supplementary study platform. Not official University of Ghana material.
      </div>
    </aside>
  )
}
