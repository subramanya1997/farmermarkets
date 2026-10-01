import fs from 'node:fs/promises';

export const COST_PER_RUN = Object.freeze({ lite: 0.005, base: 0.01, core: 0.025, pro: 0.1 });
export const MAX_CAMPAIGN_BUDGET = 50;
export function validateSubmitOptions({ processor, limit, offset, maxCost, budget, label, campaign }) {
  if (!Object.hasOwn(COST_PER_RUN, processor)) throw new Error('Unknown processor');
  if (!Number.isSafeInteger(limit) || limit <= 0) throw new Error('--limit must be a positive safe integer');
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('--offset must be a nonnegative safe integer');
  for (const [name, value] of Object.entries({ maxCost, budget })) {
    if (!Number.isFinite(value) || value <= 0 || value > MAX_CAMPAIGN_BUDGET) throw new Error(`${name} must be positive and at most $${MAX_CAMPAIGN_BUDGET}`);
  }
  for (const value of [label, campaign]) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}$/.test(value || '')) throw new Error('Label and campaign must be simple identifiers');
  }
}
export function reserveCampaign(ledger, { label, processor, ids, budget, maxCost, now }) {
  if (!Object.hasOwn(COST_PER_RUN, processor) || !Array.isArray(ids) || ids.some(id => !['string', 'number'].includes(typeof id) || !String(id)) || new Set(ids.map(String)).size !== ids.length) throw new Error('Invalid reservation processor or IDs');
  if (![budget, maxCost].every(value => Number.isFinite(value) && value > 0 && value <= MAX_CAMPAIGN_BUDGET)) throw new Error('Invalid reservation cost caps');
  const costMills = ids.length * Math.round(COST_PER_RUN[processor] * 1000);
  if (!ids.length || costMills > Math.floor(maxCost * 1000)) throw new Error('Empty selection or submission exceeds --max-cost');
  const usedMills = ledger.reservations.reduce((sum, r) => {
    if (!Number.isSafeInteger(r.cost_mills) || r.cost_mills < 0 || !Array.isArray(r.market_ids)) throw new Error('Invalid ledger reservation');
    return sum + r.cost_mills;
  }, 0);
  if (ledger.reservations.some(r => r.label === label)) throw new Error('Label already reserved; collect or investigate it instead of resubmitting');
  const priorIds = new Set(ledger.reservations.flatMap(r => r.market_ids));
  if (ids.some(id => priorIds.has(String(id)))) throw new Error('Market already reserved in this campaign');
  if (usedMills + costMills > Math.min(ledger.budget_mills, Math.floor(budget * 1000))) throw new Error('Campaign cumulative budget exceeded');
  const reservation = { label, processor, cost_mills: costMills, market_ids: ids.map(String), reserved_at: now, state: 'reserved', group_id: null, run_ids: [] };
  ledger.reservations.push(reservation);
  return reservation;
}
export async function atomicJson(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  await fs.rename(tmp, file);
}
export function orderedCandidates(markets, excluded, explicitIds) {
  const eligible = markets.filter(m => !excluded.has(String(m.id)) && m.name && m.location?.city);
  if (explicitIds !== undefined) {
    if (!Array.isArray(explicitIds) || explicitIds.some(id => !['string', 'number'].includes(typeof id))) throw new Error('IDs file must contain an array of IDs or { ids: [...] }');
    const ids = explicitIds.map(String);
    if (new Set(ids).size !== ids.length) throw new Error('IDs file contains duplicate IDs');
    const byId = new Map(eligible.map(m => [String(m.id), m]));
    for (const id of ids) if (!byId.has(id)) throw new Error(`ID ${id} is missing, previously enriched, or lacks identity data`);
    return ids.map(id => byId.get(id));
  }
  const gapCount = m => [m.contact?.websites, m.contact?.phone_numbers, m.contact?.social_media, m.operations?.days].filter(v => !v?.length).length;
  return eligible.filter(m => !m.contact?.websites?.length).sort((a, b) => (b.country_code === 'US') - (a.country_code === 'US') || gapCount(b) - gapCount(a));
}
