// Backend audit text (event.detail) always arrives lowercase - display
// formatting belongs here, at render time in the UI layer, not something to
// push back onto the backend's wire format.
export function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}
