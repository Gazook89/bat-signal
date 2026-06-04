// @ts-nocheck
import { createClient } from 'jsr:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
const reauthMaxAgeMinutes = Number(Deno.env.get('DELETE_ACCOUNT_REAUTH_MAX_AGE_MINUTES') || '10')

const configuredOrigins = (Deno.env.get('DELETE_ACCOUNT_ALLOWED_ORIGINS') || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const defaultOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173']
const allowedOrigins = new Set([...defaultOrigins, ...configuredOrigins])

if (!supabaseUrl || !serviceRoleKey || !anonKey) {
  console.error('Missing required Supabase environment variables for delete_user function.')
}

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get('Origin')
  const corsHeaders = getCorsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders || baseCorsHeaders })
  }

  if (origin && !corsHeaders) {
    return jsonResponse({ error: 'Origin is not allowed.' }, 403, null)
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders)
  }

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return jsonResponse({ error: 'Server is missing required Supabase env vars.' }, 500, corsHeaders)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse({ error: 'Missing Authorization header' }, 401, corsHeaders)
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: authHeader
      }
    }
  })

  const { data: authData, error: authError } = await userClient.auth.getUser()
  if (authError || !authData?.user) {
    return jsonResponse({ error: 'Unauthorized request' }, 401, corsHeaders)
  }

  const lastSignInAt = authData.user.last_sign_in_at ? new Date(authData.user.last_sign_in_at) : null
  const maxAgeMs = reauthMaxAgeMinutes * 60_000
  const authAgeMs = lastSignInAt ? Date.now() - lastSignInAt.getTime() : Number.POSITIVE_INFINITY

  if (!lastSignInAt || Number.isNaN(lastSignInAt.getTime()) || authAgeMs > maxAgeMs) {
    return jsonResponse(
      { error: 'Recent sign-in required. Please sign out and sign back in, then try again.', code: 'reauth_required' },
      401,
      corsHeaders
    )
  }

  const userId = authData.user.id
  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  const { error: prepareError } = await adminClient.rpc('prepare_account_deletion', {
    p_user_id: userId
  })

  if (prepareError) {
    return jsonResponse({ error: prepareError.message }, 500, corsHeaders)
  }

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId)
  if (deleteError) {
    return jsonResponse({ error: deleteError.message }, 500, corsHeaders)
  }

  return jsonResponse({ ok: true }, 200, corsHeaders)
})

function getCorsHeaders(origin: string | null) {
  if (!origin) {
    return baseCorsHeaders
  }

  if (!allowedOrigins.has(origin)) {
    return null
  }

  return {
    'Access-Control-Allow-Origin': origin,
    ...baseCorsHeaders,
    Vary: 'Origin'
  }
}

const baseCorsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400'
}

function jsonResponse(payload: Record<string, unknown>, status = 200, corsHeaders: Record<string, string> | null = null) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...(corsHeaders || {}),
      'Content-Type': 'application/json'
    }
  })
}
