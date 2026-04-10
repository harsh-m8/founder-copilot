/**
 * ar-send-reminder
 *
 * Uses Claude to draft a personalised payment reminder email, then sends it
 * via Resend. Records the sent reminder in ar_reminders.
 *
 * POST /functions/v1/ar-send-reminder
 * Authorization: Bearer <supabase-jwt>
 * Body: {
 *   org_id:        string,
 *   org_name:      string,            // shown in email signature
 *   invoice: {
 *     id:           string,           // invoice number / accounting ID
 *     contact:      string,           // customer / company name
 *     contact_email:string,
 *     amount:       number,
 *     currency:     string,           // e.g. "USD"
 *     due_date:     string,           // YYYY-MM-DD
 *   }
 * }
 *
 * Required Supabase secrets:
 *   ANTHROPIC_API_KEY
 *   RESEND_API_KEY
 *   RESEND_FROM_EMAIL   e.g. "billing@yourcompany.com"
 *
 * Requires analyst or above role in the org.
 * Rate-limited: rejects if a reminder was already sent for this invoice
 * within the last 7 days.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const REMINDER_COOLDOWN_DAYS = 7;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function roleGte(actual: string, required: string): boolean {
  const order = ["owner", "admin", "analyst", "viewer"];
  return order.indexOf(actual) <= order.indexOf(required);
}

function daysOverdue(dueDateStr: string): number {
  const due  = new Date(dueDateStr);
  const now  = new Date();
  const diff = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

// ── Claude: draft the reminder email ──────────────────────────────────────────
async function draftReminder(
  apiKey: string,
  orgName: string,
  contact: string,
  invoiceId: string,
  amount: number,
  currency: string,
  dueDateStr: string,
  overdueDays: number,
): Promise<{ subject: string; body: string }> {

  const urgency = overdueDays === 0
    ? "This invoice is due today."
    : overdueDays <= 7
    ? "This invoice was due very recently."
    : overdueDays <= 30
    ? "This invoice is moderately overdue."
    : overdueDays <= 60
    ? "This invoice is significantly overdue."
    : "This invoice is seriously overdue and requires urgent attention.";

  const tone = overdueDays <= 7
    ? "friendly and gentle"
    : overdueDays <= 30
    ? "polite but firm"
    : "firm and direct, while remaining professional";

  const formattedAmount = new Intl.NumberFormat("en-US", {
    style: "currency", currency: currency || "USD",
  }).format(amount);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key":         apiKey,
      "anthropic-version": "2023-06-01",
      "content-type":      "application/json",
    },
    body: JSON.stringify({
      model:      "claude-opus-4-6",
      max_tokens: 600,
      messages: [{
        role: "user",
        content: `Draft a ${tone} payment reminder email.

Context:
- Sender company: ${orgName}
- Customer: ${contact}
- Invoice number: ${invoiceId}
- Amount due: ${formattedAmount}
- Due date: ${dueDateStr}
- Days overdue: ${overdueDays}
- Urgency note: ${urgency}

Requirements:
- Keep it concise (3-5 short paragraphs)
- Include the invoice number and amount prominently
- End with a clear call to action
- Sign off from the ${orgName} billing team
- Do NOT include placeholder text like [your name] — write it as a complete, ready-to-send email

Return JSON only: { "subject": "...", "body": "..." }
The body should be plain text with \\n for line breaks.`,
      }],
    }),
  });

  if (!res.ok) throw new Error(`Claude API error: ${res.status}`);

  const data  = await res.json();
  const raw   = data.content?.[0]?.text?.trim() ?? "";
  const parsed = JSON.parse(raw);
  return { subject: parsed.subject, body: parsed.body };
}

// ── Resend: send the email ─────────────────────────────────────────────────────
async function sendEmail(
  apiKey: string,
  from: string,
  to: string,
  subject: string,
  body: string,
): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to:      [to],
      subject,
      text:    body,
      // Also send as HTML for better rendering
      html:    `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;line-height:1.6">${
        body.split("\n\n").map((p) =>
          `<p style="margin:0 0 16px">${p.replace(/\n/g, "<br>")}</p>`
        ).join("")
      }</div>`,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error ${res.status}: ${err}`);
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7));
  if (authErr || !user) return json({ error: "Unauthorized" }, 401);

  const { org_id, org_name, invoice } = await req.json() as {
    org_id:   string;
    org_name: string;
    invoice: {
      id:            string;
      contact:       string;
      contact_email: string;
      amount:        number;
      currency:      string;
      due_date:      string;
    };
  };

  if (!org_id || !invoice?.id || !invoice?.contact_email) {
    return json({ error: "org_id, invoice.id, and invoice.contact_email are required" }, 400);
  }

  // Permission check: analyst or above
  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("org_id", org_id)
    .eq("user_id", user.id)
    .single();

  if (!membership || !roleGte(membership.role, "analyst")) {
    return json({ error: "You need at least analyst role to send reminders" }, 403);
  }

  // Rate-limit: reject if a reminder was sent within REMINDER_COOLDOWN_DAYS
  const cooldownDate = new Date(Date.now() - REMINDER_COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await supabase
    .from("ar_reminders")
    .select("sent_at")
    .eq("org_id", org_id)
    .eq("invoice_id", invoice.id)
    .gte("sent_at", cooldownDate)
    .limit(1)
    .maybeSingle();

  if (recent) {
    return json({
      error: `A reminder was already sent for this invoice within the last ${REMINDER_COOLDOWN_DAYS} days.`,
      last_sent: recent.sent_at,
    }, 429);
  }

  // Required secrets
  const anthropicKey  = Deno.env.get("ANTHROPIC_API_KEY");
  const resendKey     = Deno.env.get("RESEND_API_KEY");
  const fromEmail     = Deno.env.get("RESEND_FROM_EMAIL");

  if (!anthropicKey) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);
  if (!resendKey)    return json({ error: "RESEND_API_KEY not configured" }, 500);
  if (!fromEmail)    return json({ error: "RESEND_FROM_EMAIL not configured" }, 500);

  const overdueDays = daysOverdue(invoice.due_date);

  // Draft email with Claude
  let subject: string;
  let body: string;
  try {
    ({ subject, body } = await draftReminder(
      anthropicKey,
      org_name,
      invoice.contact,
      invoice.id,
      invoice.amount,
      invoice.currency || "USD",
      invoice.due_date,
      overdueDays,
    ));
  } catch (err) {
    console.error("Claude draft failed", err);
    return json({ error: "Failed to draft reminder email" }, 500);
  }

  // Send via Resend
  try {
    await sendEmail(resendKey, fromEmail, invoice.contact_email, subject, body);
  } catch (err) {
    console.error("Resend failed", err);
    return json({ error: "Failed to send email" }, 502);
  }

  // Record in ar_reminders
  await supabase.from("ar_reminders").insert({
    org_id,
    invoice_id:    invoice.id,
    contact_name:  invoice.contact,
    contact_email: invoice.contact_email,
    amount:        invoice.amount,
    currency:      invoice.currency || "USD",
    due_date:      invoice.due_date,
    days_overdue:  overdueDays,
    email_subject: subject,
    email_body:    body,
    sent_by:       user.id,
  });

  return json({ ok: true, subject, days_overdue: overdueDays });
});
