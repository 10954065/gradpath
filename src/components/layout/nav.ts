import {
  Award,
  BarChart3,
  Bell,
  BookMarked,
  BookOpen,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  GraduationCap,
  Hourglass,
  Layers,
  LayoutDashboard,
  Library,
  ListChecks,
  Megaphone,
  NotebookPen,
  RefreshCcw,
  School,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Only active on this exact path (another item is nested under it). */
  end?: boolean
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Learn',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/courses', label: 'My Courses', icon: GraduationCap },
      { to: '/library', label: 'Learning Library', icon: Library },
      { to: '/resources', label: 'Resources', icon: BookMarked },
    ],
  },
  {
    label: 'Plan',
    items: [
      { to: '/planner', label: 'Study Planner', icon: CalendarClock },
      { to: '/timetable/official', label: 'Official Timetable', icon: School },
      { to: '/lectures', label: 'Lecture Check-ins', icon: ListChecks },
      { to: '/timetable', label: 'My Study Plan', icon: CalendarDays, end: true },
      { to: '/assignments', label: 'Assignments', icon: ClipboardList },
      { to: '/exams', label: 'Exam Countdown', icon: Hourglass },
    ],
  },
  {
    label: 'Practise',
    items: [
      { to: '/assessments', label: 'Assessments', icon: ClipboardCheck },
      { to: '/mock-exams', label: 'Mock Examinations', icon: BookOpen },
      { to: '/revision', label: 'Revision Centre', icon: RefreshCcw },
      { to: '/flashcards', label: 'Flashcards', icon: Layers },
    ],
  },
  {
    label: 'You',
    items: [
      { to: '/notes', label: 'My Notes', icon: NotebookPen },
      { to: '/progress', label: 'Academic Progress', icon: BarChart3 },
      { to: '/grades', label: 'My Grades', icon: Award },
      { to: '/announcements', label: 'Announcements', icon: Megaphone },
      { to: '/notifications', label: 'Notifications', icon: Bell },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
]

export const ADMIN_NAV: NavItem = { to: '/admin', label: 'Administration', icon: ShieldCheck }

export const MOBILE_PRIMARY: NavItem[] = [
  { to: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { to: '/courses', label: 'Courses', icon: GraduationCap },
  { to: '/planner', label: 'Planner', icon: CalendarClock },
  { to: '/revision', label: 'Revision', icon: RefreshCcw },
]
