import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { toUserMessage } from '@/lib/errors'
import { adminCatalogue } from '@/services/admin'

export const CATALOGUE_KEY = ['admin', 'catalogue']

export function useAdminCatalogue() {
  return useQuery({ queryKey: CATALOGUE_KEY, queryFn: adminCatalogue })
}

/** Mutation wrapper for admin screens: toasts on success/failure and refreshes the given queries. */
export function useAdminAction<T>(fn: (input: T) => Promise<unknown>, options: { success?: string; invalidate: string[][] }) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      if (options.success) toast.success(options.success)
      await Promise.all(options.invalidate.map((queryKey) => queryClient.invalidateQueries({ queryKey })))
    },
    onError: (e) => toast.error(toUserMessage(e)),
  })
}
