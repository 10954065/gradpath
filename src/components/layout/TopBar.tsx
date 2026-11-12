import { useQuery } from '@tanstack/react-query'
import { Bell, LogOut, Menu, Monitor, Moon, Search, Settings, Sun, UserRound, WifiOff } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/menu'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useSyncStatus } from '@/hooks/useSyncStatus'
import { initials } from '@/lib/utils'
import { unreadCount } from '@/services/notifications'

function ThemeMenu() {
  const { theme, setTheme, resolved } = useTheme()
  const Icon = resolved === 'dark' ? Moon : Sun
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Theme: ${theme}`}>
          <Icon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Appearance</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => setTheme('light')}>
          <Sun /> Light {theme === 'light' ? '✓' : ''}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme('dark')}>
          <Moon /> Dark {theme === 'dark' ? '✓' : ''}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme('system')}>
          <Monitor /> System {theme === 'system' ? '✓' : ''}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ConnectivityIndicator() {
  const online = useOnlineStatus()
  const { pending } = useSyncStatus()
  if (online && pending === 0) return null
  return (
    <span
      role="status"
      className="hidden items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning sm:inline-flex"
    >
      {online ? null : <WifiOff className="size-3.5" aria-hidden />}
      {online ? `Syncing ${pending} change${pending === 1 ? '' : 's'}…` : pending > 0 ? `Offline · ${pending} pending` : 'Offline'}
    </span>
  )
}

export function TopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const { data: unread = 0 } = useQuery({
    queryKey: ['notifications', 'unread', user?.id],
    queryFn: unreadCount,
    enabled: Boolean(user),
    refetchInterval: 60_000,
  })

  const onSearch = (event: FormEvent) => {
    event.preventDefault()
    const q = query.trim()
    if (q.length >= 2) navigate(`/search?q=${encodeURIComponent(q)}`)
  }

  const name = profile?.full_name || user?.email || 'Student'

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onOpenMenu} aria-label="Open navigation menu">
        <Menu />
      </Button>
      <form onSubmit={onSearch} role="search" className="relative max-w-md flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          type="search"
          placeholder="Search lessons, topics, resources, notes…"
          aria-label="Search GradPath"
          className="h-9 w-full rounded-md border bg-surface pr-3 pl-9 text-sm shadow-xs placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-ring/30"
        />
      </form>
      <div className="ml-auto flex items-center gap-1">
        <ConnectivityIndicator />
        <ThemeMenu />
        <Button variant="ghost" size="icon" asChild>
          <Link to="/notifications" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} className="relative">
            <Bell />
            {unread > 0 ? (
              <span className="absolute top-1.5 right-1.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] leading-4 font-semibold text-white">
                {unread > 9 ? '9+' : unread}
              </span>
            ) : null}
          </Link>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="ml-1 grid size-9 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground ring-offset-2 hover:ring-2 hover:ring-border focus-visible:outline-2 focus-visible:outline-ring"
              aria-label="Account menu"
            >
              {initials(name)}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel>
              <span className="block truncate text-sm font-medium text-foreground">{name}</span>
              <span className="block truncate">{user?.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate('/settings')}>
              <UserRound /> Profile
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate('/settings?tab=preferences')}>
              <Settings /> Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={async () => {
                await signOut()
                navigate('/sign-in', { replace: true })
              }}
            >
              <LogOut /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
