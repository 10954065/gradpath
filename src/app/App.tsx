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
      // Do not hammer the network while offline; cached data is served by the offline layer.
      retry: (count, error) => !isOfflineError(error) && count < 2,
    },
    mutations: { retry: false },
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
