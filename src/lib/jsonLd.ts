/**
 * JSON-LD for a `<script type="application/ld+json">` tag.
 *
 * `JSON.stringify` leaves `<` as it is, so text that contains `</script>`
 * would close the tag and whatever follows would run as markup. Organizers
 * and vendors type some of the text that ends up in these graphs, so every
 * page serialises through here: `<`, `>`, `&` and the two line separators
 * JavaScript treats as newlines (U+2028, U+2029) become unicode escapes,
 * which is still the same JSON to any parser.
 */
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

function escapeCode(char: string): string {
  return `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`;
}

export function jsonLdHtml(value: unknown): string {
  return JSON.stringify(value)
    .replace(/[<>&]/g, escapeCode)
    .split(LINE_SEPARATOR)
    .join(escapeCode(LINE_SEPARATOR))
    .split(PARAGRAPH_SEPARATOR)
    .join(escapeCode(PARAGRAPH_SEPARATOR));
}
