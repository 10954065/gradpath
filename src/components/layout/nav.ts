import {
  BarChart3,
  Bell,
  BookMarked,
  BookOpen,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  GraduationCap,
  Layers,
  LayoutDashboard,
  Library,
  Megaphone,
  NotebookPen,
  RefreshCcw,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
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
      { to: '/timetable', label: 'Timetable', icon: CalendarDays },
      { to: '/assignments', label: 'Assignments', icon: ClipboardList },
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
