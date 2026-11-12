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
const AssessmentsPage = lazy(() => import('@/pages/AssessmentsPage'))
const MockExamsPage = lazy(() => import('@/pages/MockExamsPage'))
const QuizPage = lazy(() => import('@/pages/QuizPage'))
const AttemptPage = lazy(() => import('@/pages/AttemptPage'))
const AttemptResultPage = lazy(() => import('@/pages/AttemptResultPage'))
const PlannerPage = lazy(() => import('@/pages/PlannerPage'))
const TimetablePage = lazy(() => import('@/pages/TimetablePage'))
const AssignmentsPage = lazy(() => import('@/pages/AssignmentsPage'))
const RevisionPage = lazy(() => import('@/pages/RevisionPage'))
const FlashcardsPage = lazy(() => import('@/pages/FlashcardsPage'))
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage'))
const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const ProgressPage = lazy(() => import('@/pages/ProgressPage'))
const AnnouncementsPage = lazy(() => import('@/pages/AnnouncementsPage'))
const SearchPage = lazy(() => import('@/pages/SearchPage'))
const AdminPage = lazy(() => import('@/pages/AdminPage'))

/** Screens rendered inside the authenticated application shell. */
const shellRoutes: { path: string; element: ReactNode }[] = [
  { path: 'dashboard', element: <DashboardPage /> },
  { path: 'progress', element: <ProgressPage /> },
  { path: 'announcements', element: <AnnouncementsPage /> },
  { path: 'search', element: <SearchPage /> },
  { path: 'courses', element: <CoursesPage /> },
  { path: 'courses/:courseSlug', element: <CoursePage /> },
  { path: 'courses/:courseSlug/lessons/:lessonSlug', element: <LessonPage /> },
  { path: 'library', element: <LibraryPage /> },
  { path: 'resources', element: <ResourcesPage /> },
  { path: 'notes', element: <NotesPage /> },
  { path: 'assessments', element: <AssessmentsPage /> },
  { path: 'assessments/:quizId', element: <QuizPage /> },
  { path: 'assessments/attempts/:attemptId', element: <AttemptResultPage /> },
  { path: 'assessments/attempts/:attemptId/take', element: <AttemptPage /> },
  { path: 'mock-exams', element: <MockExamsPage /> },
  { path: 'planner', element: <PlannerPage /> },
  { path: 'timetable', element: <TimetablePage /> },
  { path: 'assignments', element: <AssignmentsPage /> },
  { path: 'revision', element: <RevisionPage /> },
  { path: 'flashcards', element: <FlashcardsPage /> },
  { path: 'notifications', element: <NotificationsPage /> },
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
      { path: 'admin', element: <AdminRoute />, children: [{ index: true, element: <ErrorBoundary><AdminPage /></ErrorBoundary> }] },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
