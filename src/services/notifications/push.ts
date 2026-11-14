import { AppError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

/**
 * Web Push for streak reminders. The browser subscribes with the public half of the VAPID key pair; the private
 * half lives only in the streak-reminders Edge Function's secrets. Subscriptions are saved per device.
 */
const VAPID_PUBLIC_KEY: string =
  import.meta.env.VITE_VAPID_PUBLIC_KEY || 'BFjE2tXY9ny1O8xsJ984wPPHcL9Rs-ELNkgLanHx7JUGSl1KAS2rGifvcN3kGQv_iwqTVQHq68Bcz_N4EDt-Jtc'
const SERVICE_WORKER_TIMEOUT_MS = 10_000

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i)
  return bytes
}

function sameKey(subscription: PushSubscription, key: Uint8Array): boolean {
  const current = subscription.options.applicationServerKey
  if (!current) return false
  const bytes = new Uint8Array(current)
  return bytes.length === key.length && bytes.every((b, i) => b === key[i])
}

async function serviceWorker(): Promise<ServiceWorkerRegistration> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AppError('Notifications need GradPath’s app files. Reload the page and try again.')), SERVICE_WORKER_TIMEOUT_MS)
  })
  try {
    return await Promise.race([navigator.serviceWorker.ready, timeout])
  } finally {
    clearTimeout(timer)
  }
}

async function saveSubscription(subscription: PushSubscription): Promise<void> {
  const { endpoint, keys } = subscription.toJSON()
  const { error } = await supabase.rpc('save_push_subscription', { p_endpoint: endpoint, p_p256dh: keys?.p256dh, p_auth: keys?.auth })
  if (error) {
    throw new AppError(error.code === 'P0001' ? error.message : 'We could not turn on notifications for this device. Try again.', { cause: error })
  }
}

/** Ask for permission if needed, subscribe this browser and save it for the signed-in student. */
export async function enablePush(): Promise<void> {
  if (!pushSupported()) {
    throw new AppError('This browser cannot show notifications. On an iPhone or iPad, add GradPath to your Home Screen first, then turn this on there.')
  }
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new AppError('Notifications were not allowed. You can still see every reminder inside GradPath.')
  }
  const registration = await serviceWorker()
  const key = keyBytes(VAPID_PUBLIC_KEY)
  let subscription = await registration.pushManager.getSubscription()
  if (subscription && !sameKey(subscription, key)) {
    await subscription.unsubscribe()
    subscription = null
  }
  subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
  await saveSubscription(subscription)
}

/** Stop notifications on this device, on the server and in the browser. */
export async function disablePush(): Promise<void> {
  if (!pushSupported()) return
  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
  await subscription.unsubscribe()
}

/** When the student wants notifications and this browser already allows them, make sure this device is subscribed. */
export async function syncPush(wanted: boolean): Promise<void> {
  if (!wanted || !pushSupported() || Notification.permission !== 'granted') return
  await enablePush()
}
