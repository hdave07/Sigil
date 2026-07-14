// Deterministic keyword lookup that resolves a plain-language mission description
// to a structured allowlist. Not NLP — a fixed set of patterns, per the brief's v0
// scope decision. The mission text is the only input a human provides; this is the
// "middleware decides the scope" step, not the human.

const RULES: { pattern: RegExp; scope: string }[] = [
  { pattern: /\b(search|research|look ?up|browse|competitor|scrape)\b/i, scope: "web_search" },
  { pattern: /\bread\b/i, scope: "read_file" },
  { pattern: /\b(report|file|save|export|compile|write|log)\b/i, scope: "write_file" },
  { pattern: /\bemail\b/i, scope: "draft_email" },
];

// "send" only unlocks send_email when paired with "email" — sending is the
// action the demo scenario expects to be flagged, so it isn't granted by default.
const SEND_EMAIL_PATTERN = /\bsend\b/i;
const EMAIL_PATTERN = /\bemail\b/i;

export function inferScope(description: string): string[] {
  const scope = new Set<string>();
  for (const rule of RULES) {
    if (rule.pattern.test(description)) scope.add(rule.scope);
  }
  if (SEND_EMAIL_PATTERN.test(description) && EMAIL_PATTERN.test(description)) {
    scope.add("send_email");
  }
  return Array.from(scope);
}

export const SCOPE_LABELS: Record<string, string> = {
  web_search: "Search the web",
  read_file: "Read files",
  write_file: "Write files",
  draft_email: "Draft emails",
  send_email: "Send emails",
};
