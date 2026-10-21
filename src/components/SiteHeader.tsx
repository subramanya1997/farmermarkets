import { Header } from "@/components/Header";
import { getStateHubSummaries } from "@/lib/statePage";
import { TOPIC_LABELS, TOPIC_SLUGS, topicPath } from "@/lib/topicPage";

/** How many state hubs the mobile menu offers, biggest first. */
const MENU_STATE_LIMIT = 6;

/**
 * Server half of the header: reads the topic pages and the biggest state
 * hubs (server-only data) and hands them to the client header's menu.
 */
export async function SiteHeader() {
  const states = (await getStateHubSummaries())
    .slice(0, MENU_STATE_LIMIT)
    .map(({ name, href, marketCount }) => ({ name, href, marketCount }));
  const topics = TOPIC_SLUGS.map((slug) => ({ slug, label: TOPIC_LABELS[slug], href: topicPath(slug) }));
  return <Header states={states} topics={topics} />;
}
