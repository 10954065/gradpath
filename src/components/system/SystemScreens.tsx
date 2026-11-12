import { Compass, Settings2 } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/feedback'

/** Shown when the public Supabase configuration is missing (see .env.example). */
export function SetupRequired() {
  return (
    <div className="grid min-h-dvh place-items-center p-6">
      <div className="max-w-lg rounded-2xl border bg-surface p-8 shadow-card">
        <Settings2 className="size-7 text-primary" aria-hidden />
        <h1 className="mt-3 text-xl font-semibold">GradPath needs configuration</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Set <code className="rounded bg-muted px-1">VITE_SUPABASE_URL</code> and{' '}
          <code className="rounded bg-muted px-1">VITE_SUPABASE_ANON_KEY</code> (see <code>.env.example</code> and{' '}
          <code>docs/DEPLOYMENT.md</code>), then rebuild the app.
        </p>
      </div>
    </div>
  )
}

export function NotFoundPage() {
  return (
    <EmptyState
      icon={Compass}
      title="Page not found"
      description="The page you were looking for does not exist or has moved."
      action={
        <Button asChild variant="secondary">
          <Link to="/dashboard">Go to dashboard</Link>
        </Button>
      }
      className="mt-10"
    />
  )
}

interface BoundaryState {
  error: Error | null
}

/** Catches render errors so a single broken screen never blanks the whole app. */
export class ErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled UI error', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div className="grid min-h-[60vh] place-items-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-lg font-semibold">Something went wrong on this screen</h1>
          <p className="mt-2 text-sm text-muted-foreground">Your saved work is safe. Reload the page to continue.</p>
          <Button className="mt-4" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      </div>
    )
  }
}
