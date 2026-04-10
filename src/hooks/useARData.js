/**
 * useARData
 *
 * Loads AR reminder history for the active org and exposes sendReminder().
 * AR invoice data itself comes from useAccountingData → financialData.ar_invoices.
 *
 * Requires OrgContext to be mounted above this hook.
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useOrg } from "../context/OrgContext";

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL + "/functions/v1";

export function useARData() {
  const { org, can } = useOrg();

  const [reminders, setReminders]           = useState([]);
  const [loading, setLoading]               = useState(true);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [reminderError, setReminderError]   = useState(null);

  const loadReminders = useCallback(async () => {
    if (!org) { setLoading(false); return; }
    setLoading(true);

    const { data, error } = await supabase
      .from("ar_reminders")
      .select("invoice_id, contact_email, sent_at, days_overdue")
      .eq("org_id", org.id)
      .order("sent_at", { ascending: false });

    if (!error) setReminders(data ?? []);
    setLoading(false);
  }, [org]);

  useEffect(() => { loadReminders(); }, [loadReminders]);

  // Returns the most recent reminder record for a given invoice_id, or null
  const lastReminderFor = useCallback((invoiceId) => {
    return reminders.find((r) => r.invoice_id === invoiceId) ?? null;
  }, [reminders]);

  // Send a reminder email via the Edge Function
  const sendReminder = useCallback(async (invoice, contactEmail) => {
    if (!can("integrations:sync")) {
      setReminderError("You need at least analyst role to send reminders.");
      return false;
    }

    setSendingReminder(true);
    setReminderError(null);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setSendingReminder(false);
      setReminderError("Not authenticated");
      return false;
    }

    const res = await fetch(`${FUNCTIONS_URL}/ar-send-reminder`, {
      method: "POST",
      headers: {
        Authorization:  `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        org_id:   org.id,
        org_name: org.name,
        invoice:  { ...invoice, contact_email: contactEmail },
      }),
    });

    const body = await res.json();

    if (!res.ok) {
      setReminderError(body.error ?? "Failed to send reminder");
      setSendingReminder(false);
      return false;
    }

    await loadReminders();
    setSendingReminder(false);
    return body;
  }, [can, org, loadReminders]);

  return {
    reminders,
    loading,
    sendingReminder,
    reminderError,
    sendReminder,
    lastReminderFor,
    clearReminderError: () => setReminderError(null),
  };
}
