import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarX2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/form-controls";
import { Select, SelectItem } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useOfficialTimetable } from "@/hooks/useOfficialTimetable";
import { useSemesterCalendar } from "@/hooks/useSemesterCalendar";
import { toUserMessage } from "@/lib/errors";
import { lectureDateLabel } from "@/lib/lectureLog";
import {
  ghanaNow,
  ghanaRange,
  localDay,
  mayAttend,
  sessionLabel,
  type LectureException,
} from "@/lib/officialTimetable";
import {
  deleteLectureException,
  exceptionSchema,
  LECTURE_EXCEPTIONS_KEY,
  saveLectureException,
  type ExceptionInput,
} from "@/services/timetable/lectureExceptions";

const WEEKS_AHEAD = 10;
const DAY_MS = 86_400_000;

/** The next dates (yyyy-mm-dd) a weekly session is held, from today or the day lectures begin. */
function upcomingDates(
  dayOfWeek: number,
  from: string,
  count: number,
): string[] {
  const start = Date.parse(`${from}T12:00:00Z`);
  const shift = (dayOfWeek - new Date(start).getUTCDay() + 7) % 7;
  return Array.from({ length: count }, (_, i) =>
    new Date(start + (shift + i * 7) * DAY_MS).toISOString().slice(0, 10),
  );
}

function useChanges() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const done = (message: string) => () => {
    toast.success(message);
    void queryClient.invalidateQueries({ queryKey: LECTURE_EXCEPTIONS_KEY });
  };
  const save = useMutation({
    mutationFn: (input: ExceptionInput) =>
      saveLectureException(user?.id as string, input),
    onSuccess: done(
      "Change saved. Your reminders, planner and calendar follow it.",
    ),
    onError: (e) => toast.error(toUserMessage(e)),
  });
  const remove = useMutation({
    mutationFn: deleteLectureException,
    onSuccess: done("Change removed."),
    onError: (e) => toast.error(toUserMessage(e)),
  });
  return { save, remove };
}

function ChangeDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? undefined : onClose())}>
      {open ? (
        <DialogContent
          title="Cancel or move one lecture"
          description="For a single week only. The published timetable is not changed; this is your own record."
        >
          <ChangeForm onClose={onClose} />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function ChangeForm({ onClose }: { onClose: () => void }) {
  const tt = useOfficialTimetable();
  const { lecturesStartOn } = useSemesterCalendar();
  const { save } = useChanges();
  const sessions = tt.sessions.filter((s) => mayAttend(s, tt.attendance));
  const [entryId, setEntryId] = useState("");
  const [heldOn, setHeldOn] = useState("");
  const [status, setStatus] = useState<"cancelled" | "moved">("cancelled");
  const [moved, setMoved] = useState({
    date: "",
    start: "",
    end: "",
    venue: "",
  });
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const session = sessions.find((s) => s.id === entryId);
  const today = ghanaNow().date;
  const from =
    lecturesStartOn && localDay(lecturesStartOn) > today
      ? localDay(lecturesStartOn)
      : today;
  const dates = session
    ? upcomingDates(session.dayOfWeek, from, WEEKS_AHEAD)
    : [];

  const submit = () => {
    const input = {
      entry_id: entryId,
      held_on: heldOn,
      status,
      moved_date: moved.date,
      moved_start: moved.start,
      moved_end: moved.end,
      moved_venue: moved.venue,
      note,
    };
    const parsed = exceptionSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((i) => [String(i.path[0]), i.message]),
        ),
      );
      return;
    }
    setErrors({});
    save.mutate(parsed.data, { onSuccess: onClose });
  };

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Field label="Lecture" htmlFor="change-entry" error={errors.entry_id}>
        <Select
          id="change-entry"
          value={entryId}
          placeholder="Choose the lecture"
          onValueChange={(v) => {
            setEntryId(v);
            setHeldOn("");
          }}
        >
          {sessions.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {sessionLabel(s)}
            </SelectItem>
          ))}
        </Select>
      </Field>
      <Field label="Which week" htmlFor="change-week" error={errors.held_on}>
        <Select
          id="change-week"
          value={heldOn}
          placeholder="Choose the date"
          onValueChange={setHeldOn}
          disabled={!session}
        >
          {dates.map((d) => (
            <SelectItem key={d} value={d}>
              {lectureDateLabel(d)}
            </SelectItem>
          ))}
        </Select>
      </Field>
      <fieldset>
        <legend className="text-sm font-medium">What happened</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {(["cancelled", "moved"] as const).map((value) => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent/40"
            >
              <input
                type="radio"
                name="change-status"
                checked={status === value}
                onChange={() => setStatus(value)}
                className="size-4 accent-primary"
              />
              {value === "cancelled"
                ? "Cancelled that week"
                : "Moved to another day, time or room"}
            </label>
          ))}
        </div>
      </fieldset>
      {status === "moved" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field
            label="New day"
            htmlFor="change-date"
            error={errors.moved_date}
          >
            <Input
              id="change-date"
              type="date"
              value={moved.date}
              onChange={(e) => setMoved({ ...moved, date: e.target.value })}
            />
          </Field>
          <Field label="Room (if it changed)" htmlFor="change-venue">
            <Input
              id="change-venue"
              value={moved.venue}
              maxLength={120}
              onChange={(e) => setMoved({ ...moved, venue: e.target.value })}
            />
          </Field>
          <Field
            label="Starts (Ghana time)"
            htmlFor="change-start"
            error={errors.moved_start}
          >
            <Input
              id="change-start"
              type="time"
              value={moved.start}
              onChange={(e) => setMoved({ ...moved, start: e.target.value })}
            />
          </Field>
          <Field label="Ends" htmlFor="change-end" error={errors.moved_end}>
            <Input
              id="change-end"
              type="time"
              value={moved.end}
              onChange={(e) => setMoved({ ...moved, end: e.target.value })}
            />
          </Field>
        </div>
      ) : null}
      <Field
        label="Note"
        htmlFor="change-note"
        hint="For example who announced it."
      >
        <Input
          id="change-note"
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending}>
          Save change
        </Button>
      </DialogFooter>
    </form>
  );
}

function describe(x: LectureException): string {
  if (
    x.status === "cancelled" ||
    !x.moved_date ||
    !x.moved_start ||
    !x.moved_end
  )
    return "Cancelled";
  return `Moved to ${lectureDateLabel(x.moved_date)}, ${ghanaRange(x.moved_start, x.moved_end)}${x.moved_venue ? `, ${x.moved_venue}` : ""}`;
}

/** The student's one-off changes to single lectures, with a way to add one. */
export function LectureChanges() {
  const tt = useOfficialTimetable();
  const { remove } = useChanges();
  const [adding, setAdding] = useState(false);
  const today = ghanaNow().date;
  const upcoming = tt.exceptions.filter(
    (x) => x.held_on >= today || (x.moved_date ?? "") >= today,
  );
  return (
    <div className="flex flex-col gap-3">
      <Button
        variant="secondary"
        className="self-start"
        onClick={() => setAdding(true)}
        disabled={!tt.sessions.length}
      >
        <Plus /> Cancel or move a lecture
      </Button>
      {upcoming.length ? (
        <ul
          className="flex flex-col gap-2"
          aria-label="Changes to single lectures"
        >
          {upcoming.map((x) => {
            const s = tt.sessions.find((session) => session.id === x.entry_id);
            return (
              <li
                key={x.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
                data-testid="lecture-change"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2 font-medium">
                    <CalendarX2 className="size-4 text-warning" aria-hidden />
                    {s?.code ?? "Lecture"} · {lectureDateLabel(x.held_on)}
                    <Badge
                      tone={x.status === "cancelled" ? "warning" : "primary"}
                    >
                      {x.status === "cancelled" ? "Cancelled" : "Moved"}
                    </Badge>
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {describe(x)}
                    {x.note ? ` · ${x.note}` : ""}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => remove.mutate(x.id)}
                >
                  Remove
                </Button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          No changes. If a lecturer cancels or moves a lecture for one week,
          record it here.
        </p>
      )}
      <ChangeDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
