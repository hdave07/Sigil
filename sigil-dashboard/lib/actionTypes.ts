// Fixed v0 action-type vocabulary - checkAction() treats action.type as an
// opaque string, so any value here is automatically enforceable; this list
// is just which ones the dashboard offers/labels. Shared between the
// mission-setup checklist (app/setup) and anywhere allowedActions gets
// rendered (app/agents), so the two never drift into different label sets.
export const ACTION_TYPES: { type: string; label: string }[] = [
  { type: "web.read", label: "Read web pages" },
  { type: "email.draft", label: "Draft emails" },
  { type: "email.send", label: "Send emails" },
  { type: "file.write", label: "Write files" },
  { type: "crm.query", label: "Query CRM" },
  { type: "calendar.create", label: "Schedule calendar events" },
  { type: "payment.charge", label: "Process payments" },
  { type: "file.delete", label: "Delete files" },
  { type: "data.export", label: "Export data" },
];

export const ACTION_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  ACTION_TYPES.map((a) => [a.type, a.label]),
);
