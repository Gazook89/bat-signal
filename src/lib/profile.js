const HANDLE_SUFFIX_REGEX = /\s*#[0-9]{4}\s*$/u

export function sanitizeDisplayNameInput(value) {
  return String(value || '')
    .replace(HANDLE_SUFFIX_REGEX, '')
    .trim()
}

export function toDisplayHandle(profile, fallback = 'User') {
  const base = String(profile?.display_name || profile?.email || fallback || 'User').trim() || 'User'
  const hasNumericTag = Number.isInteger(profile?.display_tag)
  const tag = hasNumericTag ? String(profile.display_tag).padStart(4, '0') : null

  return {
    base,
    tag,
    full: tag ? `${base} #${tag}` : base
  }
}

export async function ensureProfileRecord(supabase, user) {
  if (!user) {
    return null
  }

  const { data: existing, error: existingError } = await supabase
    .from('profiles')
    .select('id, email, phone_number, display_name, display_tag')
    .eq('id', user.id)
    .maybeSingle()

  if (existingError) {
    throw existingError
  }

  if (existing) {
    return existing
  }

  const email = String(user.email || '').trim().toLowerCase()
  const displayName = sanitizeDisplayNameInput(user.user_metadata?.display_name) || null
  const phoneNumber = user.user_metadata?.phone_number || null

  const { data: created, error: createError } = await supabase
    .from('profiles')
    .upsert(
      {
        id: user.id,
        email,
        display_name: displayName,
        phone_number: phoneNumber
      },
      { onConflict: 'id' }
    )
    .select('id, email, phone_number, display_name, display_tag')
    .single()

  if (createError) {
    throw createError
  }

  return created
}

export async function fetchProfileRecord(supabase, userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, phone_number, display_name, display_tag')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
}

export async function saveProfileRecord(supabase, user, { displayName, phoneNumber }) {
  const normalizedEmail = String(user.email || '').trim().toLowerCase()
  const normalizedDisplayName = sanitizeDisplayNameInput(displayName) || null
  const normalizedPhoneNumber = phoneNumber?.trim() || null

  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      {
        id: user.id,
        email: normalizedEmail,
        display_name: normalizedDisplayName,
        phone_number: normalizedPhoneNumber
      },
      { onConflict: 'id' }
    )
    .select('id, email, phone_number, display_name, display_tag')
    .single()

  if (error) {
    throw error
  }

  return data
}