import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarSync, Copy } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/feedback'
import { Input } from '@/components/ui/form-controls'
import { ensureOk, toUserMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

const KEY = ['calendar-feed'] as const

async function getFeedToken(): Promise<string | null> {
  const result = await supabase.from('calendar_feeds').select('token').maybeSingle()
  return (ensureOk(result, 'We could not load your calendar link.') as { token: string } | null)?.token ?? null
}

async function createFeed(): Promise<string> {
  return ensureOk(await supabase.rpc('create_calendar_feed'), 'We could not create your calendar link.') as string
}

async function deleteFeed(): Promise<null> {
  ensureOk(await supabase.rpc('delete_calendar_feed'), 'We could not turn off your calendar link.')
  return null
}

const calendarFeedUrl = (origin: string, token: string): string => `${origin}/api/calendar?token=${token}`

/** A private calendar subscription link for Google, Apple or Outlook Calendar, which keeps itself up to date. */
export function CalendarFeedCard() {
  const queryClient = useQueryClient()
  const feed = useQuery({ queryKey: KEY, queryFn: getFeedToken })
  const [confirming, setConfirming] = useState<'replace' | 'off' | null>(null)
  const onDone = (message: string) => (token: string | null) => {
    queryClient.setQueryData(KEY, token)
    setConfirming(null)
    toast.success(message)
  }
  const create = useMutation({ mutationFn: createFeed, onSuccess: onDone('Calendar link ready.'), onError: (e) => toast.error(toUserMessage(e)) })
  const replace = useMutation({ mutationFn: createFeed, onSuccess: onDone('New calendar link ready. The old link no longer works.'), onError: (e) => toast.error(toUserMessage(e)) })
  const off = useMutation({ mutationFn: deleteFeed, onSuccess: onDone('Calendar link turned off.'), onError: (e) => toast.error(toUserMessage(e)) })

  const url = feed.data ? calendarFeedUrl(window.location.origin, feed.data) : null
  const copy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copied.')
    } catch {
      toast.error('Copy the link from the box instead.')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarSync className="size-4 text-primary" aria-hidden /> Phone calendar
        </CardTitle>
        <CardDescription>
          Subscribe in Google, Apple or Outlook Calendar to see your lectures, planner blocks and examinations there. Your calendar app
          checks for changes itself, usually every few hours.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {feed.isPending ? (
          <Skeleton className="h-10" />
        ) : url ? (
          <>
            <div className="flex gap-2">
              <Input readOnly value={url} aria-label="Your calendar link" onFocus={(e) => e.target.select()} />
              <Button variant="secondary" onClick={() => void copy()}>
                <Copy /> Copy
              </Button>
            </div>
            <Button asChild variant="secondary" size="sm" className="self-start">
              <a href={url.replace(/^https?:/, 'webcal:')}>Open in my calendar app</a>
            </Button>
            <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              <li>Google Calendar (on a computer): Other calendars, then + and From URL. Paste the link.</li>
              <li>iPhone or iPad: tap Open in my calendar app, or Settings, Calendar, Accounts, Add Account, Other, Add Subscribed Calendar.</li>
              <li>Outlook: Add calendar, then Subscribe from web.</li>
            </ul>
            <p className="text-xs text-warning">Keep this link private: anyone who has it can see your timetable. Replace it if you shared it by mistake.</p>
            <div className="flex flex-wrap gap-2">
              {confirming === 'replace' ? (
                <Button size="sm" variant="danger" onClick={() => replace.mutate()} disabled={replace.isPending}>
                  Confirm: replace the link
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setConfirming('replace')}>
                  Replace link
                </Button>
              )}
              {confirming === 'off' ? (
                <Button size="sm" variant="danger" onClick={() => off.mutate()} disabled={off.isPending}>
                  Confirm: turn off
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setConfirming('off')}>
                  Turn off
                </Button>
              )}
            </div>
          </>
        ) : (
          <Button className="self-start" onClick={() => create.mutate()} disabled={create.isPending}>
            <CalendarSync /> Create my calendar link
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
