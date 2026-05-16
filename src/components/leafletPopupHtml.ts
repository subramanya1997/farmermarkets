type PopupText = string | null | undefined;

interface MarketPopupData {
  name: PopupText;
  city: PopupText;
  state: PopupText;
}

interface MarketPopupWithLinkData extends MarketPopupData {
  slug: PopupText;
}

const htmlEscapes: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: PopupText): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => htmlEscapes[character]);
}

function marketLocationLine(city: PopupText, state: PopupText): string {
  const separator = city && state ? ', ' : '';

  return `${escapeHtml(city)}${separator}${escapeHtml(state)}`;
}

export function buildMarketPopupHtml({
  name,
  city,
  state,
  slug,
}: MarketPopupWithLinkData): string {
  const marketPath = `/markets/${encodeURIComponent(slug ?? '')}`;

  return `
            <strong>${escapeHtml(name)}</strong><br>
            ${marketLocationLine(city, state)}<br>
            <a href="${escapeHtml(marketPath)}">View Details</a>
          `;
}

export function buildSingleMarketPopupHtml({
  name,
  city,
  state,
}: MarketPopupData): string {
  return `
          <strong>${escapeHtml(name)}</strong><br>
          ${marketLocationLine(city, state)}
        `;
}
