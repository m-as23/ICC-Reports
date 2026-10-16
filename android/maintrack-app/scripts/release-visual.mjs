// One visible release marker; locked reference assets remain unchanged.
export function removePilotNote(html) {
  const marker = /<div role="note" aria-label="Pilot demo system"[^>]*>🧪 PILOT — بلاغات تجريبية فقط<\/div>/g;
  if ([...html.matchAll(marker)].length !== 1) throw Error('EXPECTED_SINGLE_PILOT_NOTE');
  return html.replace(marker, '');
}
