/**
 * Supabase Edge Function: log-audit
 *
 * Receives an audit log entry from the client, extracts the real client IP from
 * request headers (x-forwarded-for / x-real-ip), and inserts the record into
 * audit_logs using the caller's own JWT — so RLS still applies.
 *
 * This is the only way to capture a real IP in a Supabase-hosted app because
 * the browser has no access to its own public IP, and client-side inserts
 * always appear to come from 127.0.0.1 in Supabase's connection context.
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Capture real client IP from Cloudflare/reverse-proxy headers
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      req.headers.get('x-real-ip') ||
      '0.0.0.0';

    const body = await req.json();

    // Create Supabase client with the user's own JWT so RLS applies correctly.
    // The audit_insert policy checks user_id = auth_employee_id() for non-ERROR
    // actions, and the audit_error_insert policy allows action = 'ERROR' freely.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );

    const { error } = await supabase.from('audit_logs').insert({
      ...body,
      ip_address: ip,
      timestamp:  new Date().toISOString(),
    });

    if (error) throw error;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
