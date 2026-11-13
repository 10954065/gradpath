import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router'
import { Toaster } from 'sonner'
import { SetupRequired } from '@/components/system/SystemScreens'
import { AuthProvider } from '@/contexts/AuthContext'
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext'
import { isOfflineError } from '@/lib/errors'
import { isSupabaseConfigured } from '@/lib/supabase'
import { router } from '@/routes/router'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
      // Always run query functions, even offline: they fall back to the student's IndexedDB copy
      // (withOfflineCache). The default 'online' mode would pause them and leave screens loading forever.
      networkMode: 'always',
      // Do not hammer the network while offline; cached data is served by the offline layer.
      retry: (count, error) => !isOfflineError(error) && count < 2,
    },
    // Offline-capable writes queue themselves in the outbox; others fail fast with a clear message.
    mutations: { retry: false, networkMode: 'always' },
  },
})

function ThemedToaster() {
  const { resolved } = useTheme()
  return <Toaster theme={resolved} position="top-center" richColors closeButton />
}

export function App() {
  if (!isSupabaseConfigured) return <SetupRequired />
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
          <ThemedToaster />
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
