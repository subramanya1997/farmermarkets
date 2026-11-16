/** Roles a person claiming a market can pick. Shared by the claim form and its server action. */
export const CLAIM_ROLES = ['market_manager', 'board_member', 'staff', 'volunteer', 'vendor', 'other'] as const;
export type ClaimRole = (typeof CLAIM_ROLES)[number];

export const CLAIM_ROLE_LABELS: Record<ClaimRole, string> = {
  market_manager: 'Market manager',
  board_member: 'Board member',
  staff: 'Staff',
  volunteer: 'Volunteer',
  vendor: 'Vendor',
  other: 'Other',
};
