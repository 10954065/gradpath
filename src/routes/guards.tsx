import { ShieldAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, Navigate, Outlet, useLocation } from 'react-router'
import { Button } from '@/components/ui/button'
import { EmptyState, Spinner } from '@/components/ui/feedback'
import { useAuth } from '@/contexts/AuthContext'

function FullPageSpinner() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <Spinner label="Loading GradPath" />
    </div>
  )
}

/** Requires a signed-in user; new students are sent through onboarding first. */
export function ProtectedRoute({ children }: { children?: ReactNode }) {
  const { user, profile, isLoading } = useAuth()
  const location = useLocation()
  if (isLoading) return <FullPageSpinner />
  if (!user) return <Navigate to="/sign-in" replace state={{ from: location.pathname + location.search }} />
  if (profile && !profile.onboarding_completed_at && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />
  }
  return children ? <>{children}</> : <Outlet />
}

/** Pages for signed-out visitors (sign in, register). Signed-in users go to the dashboard. */
export function GuestRoute() {
  const { user, isLoading, isPasswordRecovery } = useAuth()
  if (isLoading) return <FullPageSpinner />
  if (user && !isPasswordRecovery) return <Navigate to="/dashboard" replace />
  return <Outlet />
}

/**
 * Hides administration screens from non-administrators. This is a convenience only: every admin
 * operation is enforced by Row Level Security and is_admin() in the database.
 */
export function AdminRoute() {
  const { isAdmin, isLoading } = useAuth()
  if (isLoading) return <FullPageSpinner />
  if (!isAdmin) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Administrators only"
        description="This area is for platform administrators. If you need access, ask an existing administrator to grant it."
        action={
          <Button asChild variant="secondary">
            <Link to="/dashboard">Back to dashboard</Link>
          </Button>
        }
      />
    )
  }
  return <Outlet />
}
