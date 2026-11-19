/**
 * The lines of the team email `/api/discovery` sends for each request.
 * Fields a form did not send are left out rather than printed as filler:
 * the operator form has no country filter or result count, so its email
 * says where it came from instead.
 */
export interface DiscoveryEmailInput {
  intent: string;
  helpTopics: string[];
  source?: string;
  country?: string;
  resultCount?: number;
  name: string;
  organization: string;
  email: string;
  phone: string;
  contactPermission: boolean;
  message: string;
}

export function discoveryEmailLines(submission: DiscoveryEmailInput, submittedAt: string): string[] {
  return [
    `Intent: ${submission.intent}`,
    `Help requested: ${submission.helpTopics.length ? submission.helpTopics.join(", ") : "None selected"}`,
    ...(submission.source ? [`Sent from: ${submission.source}`] : []),
    ...(submission.country ? [`Country filter: ${submission.country}`] : []),
    ...(submission.resultCount !== undefined ? [`Visible result count: ${submission.resultCount}`] : []),
    `Name: ${submission.name || "Not provided"}`,
    `Organization: ${submission.organization || "Not provided"}`,
    `Email: ${submission.email || "Not provided"}`,
    `Phone: ${submission.phone || "Not provided"}`,
    `Contact permission: ${submission.contactPermission ? "Yes" : "No"}`,
    `Message: ${submission.message || "Not provided"}`,
    `Submitted at: ${submittedAt}`,
  ];
}
