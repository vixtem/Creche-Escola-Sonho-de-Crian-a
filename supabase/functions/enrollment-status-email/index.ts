import { createClient } from 'npm:@supabase/supabase-js@2.119.1';

type Job = { id: number; email: string | null; attempt: number };

const endpoint = 'https://api.resend.com/emails';

Deno.serve(async request => {
  const dispatchToken = Deno.env.get('ENROLLMENT_NOTIFY_TOKEN');
  const sender = Deno.env.get('ENROLLMENT_EMAIL_FROM');
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const portal = Deno.env.get('ENROLLMENT_PORTAL_URL');
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  if (!dispatchToken || request.headers.get('x-enrollment-notify-token') !== dispatchToken) {
    return new Response(null, { status: 401 });
  }
  if (!sender || !apiKey || !portal?.startsWith('https://')) return new Response(null, { status: 503 });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.rpc('claim_enrollment_notifications');
  if (error) return new Response(null, { status: 500 });
  let failed = 0;

  for (const { id, email, attempt } of data as Job[]) {
    let result = email ? 'failed' : 'skip';
    if (email) {
      try {
        const sent = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': `enrollment-status/${id}`,
          },
          signal: AbortSignal.timeout(5000),
          body: JSON.stringify({
            from: sender,
            to: [email],
            subject: 'Há uma atualização na pré-matrícula',
            text: `A secretaria atualizou uma solicitação. Entre no Portal da família para consultar as orientações.\n\n${portal}`,
          }),
        });
        if (sent.ok) result = 'delivered';
      } catch {
        // The database lease makes this job available for another attempt.
      }
    }
    const { error } = await db.rpc('finish_enrollment_notification', { p_id: id, p_attempt: attempt, p_result: result });
    if (error || result === 'failed') failed += 1;
  }
  return Response.json({ processed: data.length, failed });
});
