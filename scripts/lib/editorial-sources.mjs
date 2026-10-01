/** Title corrections must retain newer evidence and referenced source IDs. */
export function applySourceCorrections(current, corrections) {
  const byUrl = new Map(current.map(source => [new URL(source.url).href, source]));
  for (const correction of corrections) {
    const url = new URL(correction.url).href;
    const source = byUrl.get(url);
    byUrl.set(url, source ? {
      ...source, ...correction,
      ...(source.id ? { id: source.id } : {}),
      fields: [...new Set([...source.fields, ...correction.fields])],
    } : correction);
  }
  return [...byUrl.values()];
}
