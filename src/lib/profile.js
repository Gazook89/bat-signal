export async function ensureProfileRecord(supabase, user) {
  if (!user) {
    return null
  }

  const { data: existing, error: existingError } = await supabase
    .from('profiles')
    .select('id, email, phone_number, display_name')
    .eq('id', user.id)
    .maybeSingle()

  if (existingError) {
    throw existingError
  }

  if (existing) {
    return existing
  }

  const email = String(user.email || '').trim().toLowerCase()
  const displayName = user.user_metadata?.display_name || null
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
    .select('id, email, phone_number, display_name')
    .single()

  if (createError) {
    throw createError
  }

  return created
}

export async function fetchProfileRecord(supabase, userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, phone_number, display_name')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
}

export async function saveProfileRecord(supabase, user, { displayName, phoneNumber }) {
  const normalizedEmail = String(user.email || '').trim().toLowerCase()
  const normalizedDisplayName = String(displayName || '').trim() || null
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
    .select('id, email, phone_number, display_name')
    .single()

  if (error) {
    throw error
  }

  return data
}