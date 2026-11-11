/**
 * The answers offered by "What were you hoping to find?", shared by the
 * popup (src/components/VisitorPrompts.tsx) and the in-page question
 * (src/components/PageQuestion.tsx) so both report the same `answer` ids.
 *
 * `followUp` is the optional second question asked after a chip is tapped.
 * The chip says which kind of fact was missing; the follow-up says which one.
 */

export interface VisitorNeed {
  id: string;
  label: string;
  followUp?: string;
}

export const MARKET_NEEDS: readonly VisitorNeed[] = [
  { id: "open_this_week", label: "If it's open this week" },
  { id: "vendors", label: "What the vendors sell", followUp: "Which vendor or product?" },
  { id: "payment", label: "SNAP/EBT or payment" },
  { id: "getting_there", label: "Parking or getting there" },
  { id: "other", label: "Something else" },
];

export const CITY_NEEDS: readonly VisitorNeed[] = [
  { id: "open_today", label: "A market open today" },
  { id: "snap", label: "Markets taking SNAP/EBT" },
  { id: "winter", label: "Winter or indoor markets" },
  { id: "produce", label: "Specific produce", followUp: "What are you looking for?" },
  { id: "other", label: "Something else" },
];
