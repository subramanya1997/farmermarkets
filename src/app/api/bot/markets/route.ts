import { createBotMarket } from '@/lib/listingBot';
import { botError } from '@/lib/botRoute';
import { createBody, pastDateIssues, patchToEdits, scheduleToEdits } from '@/lib/listingBotRequests';
import { readJson, withListingBot, writeContext, writeResponse } from '@/lib/listingBotRoute';
import { listingEditsFromMarket } from '@/lib/organizerOverlay';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/bot/markets
 *
 * Creates a new market page (a holiday or winter market the site does not
 * list yet) and returns its slug and claim URL. Refuses with 409 when a
 * market with a similar name is already listed in the city, unless
 * `confirm_not_duplicate` is true. Creating the same market twice returns
 * the first one.
 */
export async function POST(request: Request) {
  return withListingBot(request, 'Bot market create', async (identity) => {
    const body = await readJson(request, createBody);
    if (!body.ok) return body.response;
    const input = body.data;
    if (input.schedule) {
      const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
      const past = pastDateIssues(input.schedule, yesterday);
      if (past.length) return botError(400, 'Invalid request.', { issues: past.map((issue) => ({ ...issue, path: `schedule.${issue.path}` })) });
    }
    const result = await createBotMarket(
      input,
      (market) => {
        const live = listingEditsFromMarket(market);
        return {
          ...patchToEdits(live, {
            name: input.name,
            ...(input.operator_name ? { operator_name: input.operator_name } : {}),
            ...(input.phone ? { phone: input.phone } : {}),
            ...(input.website ? { website: input.website } : {}),
            ...(input.payments ? { payments: input.payments } : {}),
            ...(input.description ? { description: input.description } : {}),
          }),
          ...(input.schedule ? scheduleToEdits(input.schedule) : {}),
        };
      },
      writeContext(request, identity, input),
    );
    return writeResponse(result);
  });
}
