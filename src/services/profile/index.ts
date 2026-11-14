import { z } from 'zod'
import { AppError, ensureOk } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { setElectiveChoice } from '@/services/courses'
import { withOfflineCache } from '@/services/offline/cache'
import type { Profile, StudentPreferences } from '@/types/database'

export const profileSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter your full name').max(120),
  academic_year: z.string().trim().max(20),
  semester: z.string().trim().min(1, 'Enter your semester').max(40),
  programme: z.string().trim().min(2, 'Enter your programme').max(120),
  institution: z.string().trim().min(2, 'Enter your institution').max(120),
  weekly_study_target_hours: z.coerce.number<number>().min(1, 'At least 1 hour').max(80, 'At most 80 hours'),
  preferred_study_times: z.array(z.string().max(40)).max(8),
  time_zone: z.string().trim().min(3).max(64),
  /** yyyy-mm-dd, or empty to follow the day official lectures begin. */
  study_started_on: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Enter a date').optional(),
})
export type ProfileInput = z.infer<typeof profileSchema>

export function getProfile(userId: string): Promise<Profile> {
  // Cached per user so the signed-in app shell (and saved lessons) still open offline.
  return withOfflineCache(`profile:${userId}`, async () => {
    const result = await supabase.from('profiles').select('*').eq('id', userId).single()
    return ensureOk(result, 'We could not load your profile.') as Profile
  })
}

export async function updateProfile(
  userId: string,
  input: Partial<ProfileInput> & { onboarding_completed_at?: string; avatar_path?: string | null },
): Promise<Profile> {
  const values = 'study_started_on' in input ? { ...input, study_started_on: input.study_started_on || null } : input
  const result = await supabase.from('profiles').update(values).eq('id', userId).select('*').single()
  return ensureOk(result, 'We could not save your profile.') as Profile
}

export async function isAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_admin')
  if (error) return false
  return data === true
}

const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const AVATAR_MAX_BYTES = 2 * 1024 * 1024

export async function uploadAvatar(userId: string, file: File): Promise<string> {
  if (!AVATAR_TYPES.includes(file.type)) throw new AppError('Use a PNG, JPEG or WebP image.')
  if (file.size > AVATAR_MAX_BYTES) throw new AppError('The image must be 2 MB or smaller.')
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${userId}/avatar-${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type })
  if (error) throw new AppError('We could not upload the photo.', { cause: error })
  await updateProfile(userId, { avatar_path: path })
  return path
}

export async function avatarUrl(path: string | null): Promise<string | null> {
  if (!path) return null
  const { data } = await supabase.storage.from('avatars').createSignedUrl(path, 60 * 60)
  return data?.signedUrl ?? null
}

export async function getPreferences(userId: string): Promise<StudentPreferences> {
  const result = await supabase.from('student_preferences').select('*').eq('user_id', userId).maybeSingle()
  const prefs = ensureOk(result, 'We could not load your preferences.') as StudentPreferences | null
  if (prefs) return prefs
  const created = await supabase.from('student_preferences').insert({ user_id: userId }).select('*').single()
  return ensureOk(created) as StudentPreferences
}

export async function updatePreferences(
  userId: string,
  patch: Partial<Omit<StudentPreferences, 'user_id' | 'updated_at'>>,
): Promise<StudentPreferences> {
  const result = await supabase.from('student_preferences').update(patch).eq('user_id', userId).select('*').single()
  return ensureOk(result, 'We could not save your preferences.') as StudentPreferences
}

/**
 * Onboarding side effects: enrol in the compulsory courses, record the elective choice (if made), then optionally
 * create the provisional study plan, which only includes courses the student takes.
 */
export async function completeOnboarding(
  userId: string,
  input: { weeklyTarget: number; createTimetable: boolean; electiveIds: readonly string[]; chosenElectiveIds: readonly string[] },
): Promise<void> {
  ensureOk(await supabase.rpc('enrol_default_courses'), 'We could not set up your courses.')
  await setElectiveChoice(input.electiveIds, input.chosenElectiveIds)
  if (input.createTimetable) ensureOk(await supabase.rpc('seed_default_timetable'), 'We could not create your study timetable.')
  await updateProfile(userId, {
    weekly_study_target_hours: input.weeklyTarget,
    onboarding_completed_at: new Date().toISOString(),
  })
}
