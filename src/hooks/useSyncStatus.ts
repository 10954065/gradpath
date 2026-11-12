import { useSyncExternalStore } from 'react'
import { getSyncStatus, subscribeSyncStatus, type SyncStatus } from '@/services/offline/sync'

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribeSyncStatus, getSyncStatus, getSyncStatus)
}
