/**
 * email-invoice-sync
 *
 * AI agent that reads emails from a connected Gmail or Outlook account,
 * uses Claude to identify and extract invoice data, and stores results
 * in extracted_invoices (deduped by email_message_id).
 *
 * POST /functions/v1/email-invoice-sync
 * Authorization: Bearer <supabase-jwt>
 * Body: { "org_id": "<uuid>", "provider": "gmail"|"outlook", "max_emails"?: 50 }
 *
 * Required Supabase secrets:
 *   ANTHROPIC_API_KEY
 *   GMAIL_EMAIL_CLIENT_ID / GMAIL_EMAIL_CLIENT_SECRET
 *   OUTLOOK_EMAIL_CLIENT_ID / OUTLOOK_EMAIL_CLIENT_SECRET
 *
 * Requires analyst or above role in the org.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

type EmailProvider = "gmail" | "outlook" | "zoho";

interface EmailConnection {
  provider:        EmailProvider;
  access_token:    string;
  refresh_token:   string | null;
  token_expires_at:string | null;
  zoho_mail_base:  string | null;  // only set for Zoho connections
}

interface EmailMessage {
  id:      string;
  subject: string;
  from:    string;
  body:    string;              // plain text
  pdfs:    { name: string; base64: string }[];  // PDF attachments
}

type ClassifiedEmail =
  | {
      type:                "invoice";
      vendor_name:         string | null;
      invoice_number:      string | null;
      invoice_date:        string | null;
      due_date:            string | null;
      amount:              number | null;
      currency:            string | null;
      line_items:          Array<{ description: string; qty?: number; unit_price?: number }> | null;
      confidence:          "high" | "medium" | "low";
    }
  | {
      type:                "remittance";
      payer_name:          string | null;
      amount_paid:         number | null;
      payment_date:        string | null;
      invoice_references:  string[] | null;  // invoice numbers mentioned
      payment_method:      string | null;
      confidence:          "high" | "medium" | "low";
    }
  | null;

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

// ── Token refresh ─────────────────────────────────────────────────────────────
async function ensureFreshToken(
  supabase: ReturnType<typeof createClient>,
  conn: EmailConnection,
  orgId: string,
): Promise<string> {
  if (!conn.token_expires_at || !conn.refresh_token) return conn.access_token;

  const bufferMs = 5 * 60 * 1000;
  if (new Date(conn.token_expires_at).getTime() - Date.now() > bufferMs) return conn.access_token;

  const p            = conn.provider;
  const clientId     = Deno.env.get(`${p.toUpperCase()}_EMAIL_CLIENT_ID`)!;
  const clientSecret = Deno.env.get(`${p.toUpperCase()}_EMAIL_CLIENT_SECRET`)!;

  const tokenUrl = p === "gmail"
    ? "https://oauth2.googleapis.com/token"
    : p === "zoho"
      ? "https://accounts.zoho.com/oauth/v2/token"
      : "https://login.microsoftonline.com/common/oauth2/v2.0/token";

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:    "refresh_token",
      refresh_token: conn.refresh_token,
      client_id:     clientId,
      client_secret: clientSecret,
    }),
  });

  const tokens = await res.json();
  if (!tokens.access_token) throw new Error("Token refresh failed");

  await supabase
    .from("email_connections")
    .update({
      access_token:     tokens.access_token,
      refresh_token:    tokens.refresh_token ?? conn.refresh_token,
      token_expires_at: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : null,
    })
    .eq("org_id", orgId)
    .eq("provider", p);

  return tokens.access_token as string;
}

// ── HTML → plain text (basic tag stripping) ───────────────────────────────────
function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/td>/gi, " | ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s{3,}/g, "\n\n")
    .trim();
}

// ── Gmail: fetch candidate emails ─────────────────────────────────────────────
async function fetchGmailMessages(token: string, since: string | null, max: number): Promise<EmailMessage[]> {
  const base = "https://gmail.googleapis.com/gmail/v1/users/me";
  const headers = { Authorization: `Bearer ${token}` };

  // Search for invoices AND remittances (payment confirmations from customers)
  let q = "subject:invoice OR subject:receipt OR subject:bill OR subject:statement OR subject:payment OR subject:paid OR subject:remittance OR (has:attachment filename:pdf)";
  if (since) q += ` after:${since}`;

  const listRes = await fetch(
    `${base}/messages?q=${encodeURIComponent(q)}&maxResults=${max}`,
    { headers },
  );
  if (!listRes.ok) throw new Error(`Gmail list failed: ${listRes.status}`);
  const listData = await listRes.json();

  const messages: EmailMessage[] = [];
  for (const { id } of (listData.messages ?? [])) {
    try {
      const msgRes = await fetch(`${base}/messages/${id}?format=full`, { headers });
      if (!msgRes.ok) continue;
      const msg = await msgRes.json();

      const hdrs: Array<{ name: string; value: string }> = msg.payload?.headers ?? [];
      const subject = hdrs.find((h: { name: string }) => h.name === "Subject")?.value ?? "";
      const from    = hdrs.find((h: { name: string }) => h.name === "From")?.value ?? "";

      // Recursively extract parts
      let body = "";
      const pdfs: { name: string; base64: string }[] = [];

      function walkParts(part: Record<string, unknown>) {
        const mime = part.mimeType as string ?? "";
        const data = (part.body as Record<string, string>)?.data;

        if (mime === "text/plain" && data) {
          body = atob(data.replace(/-/g, "+").replace(/_/g, "/"));
        } else if (mime === "text/html" && !body && data) {
          body = htmlToText(atob(data.replace(/-/g, "+").replace(/_/g, "/")));
        } else if (mime === "application/pdf" && data) {
          const filename = (part as Record<string, Record<string, string>>).filename as string ?? "attachment.pdf";
          pdfs.push({ name: filename, base64: data });
        }

        for (const sub of ((part.parts as Record<string, unknown>[]) ?? [])) {
          walkParts(sub);
        }
      }
      walkParts(msg.payload as Record<string, unknown>);

      if (body || pdfs.length > 0) {
        messages.push({ id, subject, from, body: body.slice(0, 8000), pdfs });
      }
    } catch (e) {
      console.warn(`Skipping message ${id}:`, e);
    }
  }
  return messages;
}

// ── Outlook: fetch candidate emails ──────────────────────────────────────────
async function fetchOutlookMessages(token: string, since: string | null, max: number): Promise<EmailMessage[]> {
  const base    = "https://graph.microsoft.com/v1.0/me/messages";
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };

  const subjectFilter = [
    "contains(subject,'invoice')",
    "contains(subject,'receipt')",
    "contains(subject,'bill')",
    "contains(subject,'statement')",
    "contains(subject,'payment')",
    "contains(subject,'paid')",
    "contains(subject,'remittance')",
    "hasAttachments eq true",
  ].join(" or ");

  let filter = `(${subjectFilter})`;
  if (since) filter += ` and receivedDateTime ge ${since}T00:00:00Z`;

  const listRes = await fetch(
    `${base}?$filter=${encodeURIComponent(filter)}&$top=${max}&$select=id,subject,from,hasAttachments,body`,
    { headers },
  );
  if (!listRes.ok) {
    const err = await listRes.text();
    throw new Error(`Outlook list failed: ${listRes.status} ${err}`);
  }
  const listData = await listRes.json();

  const messages: EmailMessage[] = [];
  for (const msg of (listData.value ?? [])) {
    const body  = msg.body?.contentType === "html"
      ? htmlToText(msg.body?.content ?? "")
      : (msg.body?.content ?? "");
    const from    = msg.from?.emailAddress?.address ?? "";
    const subject = msg.subject ?? "";
    const pdfs: { name: string; base64: string }[] = [];

    // Fetch PDF attachments if any
    if (msg.hasAttachments) {
      try {
        const attRes = await fetch(
          `https://graph.microsoft.com/v1.0/me/messages/${msg.id}/attachments?$filter=contentType eq 'application/pdf'`,
          { headers },
        );
        if (attRes.ok) {
          const attData = await attRes.json();
          for (const att of (attData.value ?? [])) {
            if (att.contentBytes) {
              pdfs.push({ name: att.name ?? "attachment.pdf", base64: att.contentBytes });
            }
          }
        }
      } catch (e) {
        console.warn("Could not fetch attachments for", msg.id, e);
      }
    }

    if (body || pdfs.length > 0) {
      messages.push({ id: msg.id, subject, from, body: body.slice(0, 8000), pdfs });
    }
  }
  return messages;
}

// ── Zoho Mail: fetch candidate emails ────────────────────────────────────────
// zohoMailBase is stored per-connection at OAuth time (derived from the api_domain
// in Zoho's token response), so each org's data center is respected automatically.
async function fetchZohoMessages(token: string, since: string | null, max: number, zohoMailBase: string): Promise<EmailMessage[]> {
  const base    = zohoMailBase;
  const headers = { Authorization: `Zoho-oauthtoken ${token}`, Accept: "application/json" };

  // Step 1: get the primary account ID
  const accountsRes = await fetch(`${base}/api/accounts`, { headers });
  if (!accountsRes.ok) throw new Error(`Zoho accounts fetch failed: ${accountsRes.status}`);
  const accountsData = await accountsRes.json();
  const accountId    = accountsData.data?.[0]?.accountId as string | undefined;
  if (!accountId) throw new Error("No Zoho Mail account found");

  // Step 2: search for invoice/remittance-related messages
  const keywords = ["invoice", "receipt", "bill", "statement", "payment", "paid", "remittance"];
  const messages: EmailMessage[] = [];
  const seenIds   = new Set<string>();

  for (const keyword of keywords) {
    if (messages.length >= max) break;
    const remaining = max - messages.length;

    let url = `${base}/api/accounts/${accountId}/messages/search?searchKey=${encodeURIComponent(keyword)}&limit=${remaining}&sortBy=date&sortOrder=desc`;
    if (since) url += `&since=${new Date(since).getTime()}`;

    const listRes = await fetch(url, { headers });
    if (!listRes.ok) continue;
    const listData = await listRes.json();

    for (const msg of (listData.data ?? [])) {
      if (seenIds.has(msg.messageId)) continue;
      seenIds.add(msg.messageId);

      try {
        // Fetch message content
        const contentRes = await fetch(
          `${base}/api/accounts/${accountId}/messages/${msg.messageId}/content`,
          { headers },
        );
        let body = "";
        if (contentRes.ok) {
          const contentData = await contentRes.json();
          const raw = contentData.data?.content ?? "";
          body = contentData.data?.isHtml ? htmlToText(raw) : raw;
        }

        // Fetch PDF attachments if any
        const pdfs: { name: string; base64: string }[] = [];
        if (msg.hasAttachment) {
          const attListRes = await fetch(
            `${base}/api/accounts/${accountId}/messages/${msg.messageId}/attachments`,
            { headers },
          );
          if (attListRes.ok) {
            const attListData = await attListRes.json();
            for (const att of (attListData.data ?? [])) {
              if (att.contentType !== "application/pdf") continue;
              try {
                const attRes = await fetch(
                  `${base}/api/accounts/${accountId}/messages/${msg.messageId}/attachments/${att.attachmentId}`,
                  { headers },
                );
                if (!attRes.ok) continue;
                const buf    = await attRes.arrayBuffer();
                const bytes  = new Uint8Array(buf);
                let binary   = "";
                bytes.forEach((b) => { binary += String.fromCharCode(b); });
                pdfs.push({ name: att.fileName ?? "attachment.pdf", base64: btoa(binary) });
              } catch (e) {
                console.warn("Could not download Zoho attachment", att.attachmentId, e);
              }
            }
          }
        }

        if (body || pdfs.length > 0) {
          messages.push({
            id:      msg.messageId,
            subject: msg.subject ?? "",
            from:    msg.fromAddress ?? "",
            body:    body.slice(0, 8000),
            pdfs,
          });
        }
      } catch (e) {
        console.warn(`Skipping Zoho message ${msg.messageId}:`, e);
      }
    }
  }

  return messages;
}

// ── Claude: classify and extract (invoice OR remittance OR null) ──────────────
async function classifyAndExtract(
  email: EmailMessage,
  apiKey: string,
): Promise<ClassifiedEmail> {
  const content: unknown[] = [];

  for (const pdf of email.pdfs) {
    content.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: pdf.base64 },
    });
  }

  const emailText = [
    `From: ${email.from}`,
    `Subject: ${email.subject}`,
    "",
    email.body || "(no body text)",
  ].join("\n");

  content.push({
    type: "text",
    text: `You are a financial email classifier. Analyse this email${email.pdfs.length ? " and the attached PDF(s)" : ""} and return EXACTLY ONE of these three JSON structures:

1. INVOICE — a bill or request for payment sent TO us by a vendor:
{ "type": "invoice", "vendor_name": string|null, "invoice_number": string|null, "invoice_date": "YYYY-MM-DD"|null, "due_date": "YYYY-MM-DD"|null, "amount": number|null, "currency": string|null, "line_items": [{"description":string,"qty":number|null,"unit_price":number|null}]|null, "confidence": "high"|"medium"|"low" }

2. REMITTANCE — a payment confirmation sent BY our customer TO us (they are telling us they have paid):
{ "type": "remittance", "payer_name": string|null, "amount_paid": number|null, "payment_date": "YYYY-MM-DD"|null, "invoice_references": ["INV-001",...]|null, "payment_method": string|null, "confidence": "high"|"medium"|"low" }

3. NEITHER — marketing, conversation, notification, or anything else:
null

Key distinction:
- An INVOICE comes from a vendor asking US to pay THEM.
- A REMITTANCE comes from a customer telling us THEY have paid US.

confidence: "high" = clear and complete data, "medium" = some fields missing, "low" = uncertain classification.

Return ONLY valid JSON, no markdown, no explanation.

Email:
${emailText}`,
  });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-opus-4-6", max_tokens: 1024,
      messages: [{ role: "user", content }],
    }),
  });

  if (!res.ok) throw new Error(`Claude API error ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const raw  = data.content?.[0]?.text?.trim() ?? "";

  try {
    return JSON.parse(raw) as ClassifiedEmail;
  } catch {
    console.warn("Claude returned non-JSON:", raw.slice(0, 200));
    return null;
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

  const { org_id, provider, max_emails = 50 } = await req.json() as {
    org_id: string; provider: EmailProvider; max_emails?: number;
  };

  if (!org_id)                                                   return json({ error: "org_id is required" }, 400);
  if (!["gmail", "outlook", "zoho"].includes(provider))         return json({ error: "provider must be gmail, outlook, or zoho" }, 400);
  if (max_emails < 1 || max_emails > 200)               return json({ error: "max_emails must be 1–200" }, 400);

  // Permission check: analyst or above
  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("org_id", org_id)
    .eq("user_id", user.id)
    .single();

  if (!membership || !roleGte(membership.role, "analyst")) {
    return json({ error: "You need at least analyst role to sync email" }, 403);
  }

  // Load email connection
  const { data: conn, error: connErr } = await supabase
    .from("email_connections")
    .select("*")
    .eq("org_id", org_id)
    .eq("provider", provider)
    .single();

  if (connErr || !conn) return json({ error: "Email account not connected for this organisation" }, 404);

  // Refresh token if needed
  let token: string;
  try {
    token = await ensureFreshToken(supabase, conn as EmailConnection, org_id);
  } catch {
    return json({ error: "Token refresh failed — please reconnect your email account" }, 401);
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);

  // Use last_synced_at as the "since" date so we only process new emails
  const since = conn.last_synced_at
    ? conn.last_synced_at.slice(0, 10)
    : null;

  // Fetch candidate emails
  let emails: EmailMessage[];
  try {
    if (provider === "gmail") {
      emails = await fetchGmailMessages(token, since, max_emails);
    } else if (provider === "zoho") {
      const mailBase = (conn as EmailConnection).zoho_mail_base ?? "https://mail.zoho.com";
      emails = await fetchZohoMessages(token, since, max_emails, mailBase);
    } else {
      emails = await fetchOutlookMessages(token, since, max_emails);
    }
  } catch (err) {
    console.error("Email fetch error", err);
    return json({ error: "Failed to fetch emails from provider" }, 502);
  }

  // Process each email through Claude — route to invoices or remittances table
  let invoicesExtracted    = 0;
  let remittancesExtracted = 0;
  let skipped              = 0;

  for (const email of emails) {
    try {
      const result = await classifyAndExtract(email, apiKey);
      if (!result) { skipped++; continue; }

      if (result.type === "invoice") {
        await supabase
          .from("extracted_invoices")
          .upsert(
            {
              org_id,
              email_message_id:      email.id,
              vendor_name:           result.vendor_name,
              invoice_number:        result.invoice_number,
              invoice_date:          result.invoice_date,
              due_date:              result.due_date,
              amount:                result.amount,
              currency:              result.currency ?? "USD",
              line_items:            result.line_items,
              raw_email_subject:     email.subject,
              raw_email_from:        email.from,
              extraction_confidence: result.confidence,
            },
            { onConflict: "org_id,email_message_id" },
          );
        invoicesExtracted++;
      } else if (result.type === "remittance") {
        await supabase
          .from("extracted_remittances")
          .upsert(
            {
              org_id,
              email_message_id:      email.id,
              payer_name:            result.payer_name,
              amount_paid:           result.amount_paid,
              payment_date:          result.payment_date,
              invoice_references:    result.invoice_references,
              payment_method:        result.payment_method,
              raw_email_subject:     email.subject,
              raw_email_from:        email.from,
              extraction_confidence: result.confidence,
            },
            { onConflict: "org_id,email_message_id" },
          );
        remittancesExtracted++;
      }
    } catch (err) {
      console.warn(`Failed to process email ${email.id}:`, err);
      skipped++;
    }
  }

  // Update last_synced_at
  await supabase
    .from("email_connections")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("org_id", org_id)
    .eq("provider", provider);

  return json({
    ok: true,
    provider,
    emails_processed:     emails.length,
    invoices_extracted:   invoicesExtracted,
    remittances_extracted: remittancesExtracted,
    skipped,
  });
});
