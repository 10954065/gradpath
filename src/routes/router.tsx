import { lazy, Suspense, type ComponentType, type ReactNode } from 'react'
import { createBrowserRouter, Navigate } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { ErrorBoundary, NotFoundPage } from '@/components/system/SystemScreens'
import { Spinner } from '@/components/ui/feedback'
import { AdminRoute, GuestRoute, ProtectedRoute } from './guards'

/** Lazy-load a named export so each screen ships in its own chunk. */
function lazyNamed<M extends Record<string, unknown>>(loader: () => Promise<M>, name: keyof M) {
  return lazy(async () => ({ default: (await loader())[name] as ComponentType }))
}

function page(node: ReactNode) {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-dvh place-items-center">
          <Spinner label="Loading" />
        </div>
      }
    >
      <ErrorBoundary>{node}</ErrorBoundary>
    </Suspense>
  )
}

const auth = () => import('@/pages/auth/AuthPages')
const SignInPage = lazyNamed(auth, 'SignInPage')
const RegisterPage = lazyNamed(auth, 'RegisterPage')
const ForgotPasswordPage = lazyNamed(auth, 'ForgotPasswordPage')
const ResetPasswordPage = lazyNamed(auth, 'ResetPasswordPage')
const AuthCallbackPage = lazyNamed(auth, 'AuthCallbackPage')
const OnboardingPage = lazy(() => import('@/pages/OnboardingPage'))
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))
const CoursesPage = lazy(() => import('@/pages/CoursesPage'))
const CoursePage = lazy(() => import('@/pages/CoursePage'))
const LessonPage = lazy(() => import('@/pages/LessonPage'))
const LibraryPage = lazy(() => import('@/pages/LibraryPage'))
const ResourcesPage = lazy(() => import('@/pages/ResourcesPage'))
const NotesPage = lazy(() => import('@/pages/NotesPage'))

/** Screens rendered inside the authenticated application shell. */
const shellRoutes: { path: string; element: ReactNode }[] = [
  { path: 'courses', element: <CoursesPage /> },
  { path: 'courses/:courseSlug', element: <CoursePage /> },
  { path: 'courses/:courseSlug/lessons/:lessonSlug', element: <LessonPage /> },
  { path: 'library', element: <LibraryPage /> },
  { path: 'resources', element: <ResourcesPage /> },
  { path: 'notes', element: <NotesPage /> },
  { path: 'settings', element: <SettingsPage /> },
]

export const router = createBrowserRouter([
  {
    element: <GuestRoute />,
    children: [
      { path: '/sign-in', element: page(<SignInPage />) },
      { path: '/register', element: page(<RegisterPage />) },
      { path: '/forgot-password', element: page(<ForgotPasswordPage />) },
    ],
  },
  { path: '/reset-password', element: page(<ResetPasswordPage />) },
  { path: '/auth/callback', element: page(<AuthCallbackPage />) },
  {
    path: '/onboarding',
    element: <ProtectedRoute>{page(<OnboardingPage />)}</ProtectedRoute>,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppShell />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      ...shellRoutes.map((r) => ({ path: r.path, element: <ErrorBoundary>{r.element}</ErrorBoundary> })),
      { path: 'admin', element: <AdminRoute />, children: [] },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
