import type { Metadata } from 'next';
import { DayTopicPage } from '@/components/DayTopicPage';
import { getDayTopicPage, topicMetadata } from '@/lib/topicPage';

export const revalidate = 86400;

/** `/markets/wednesday`: the markets that open on Wednesday, state by state. */
export async function generateMetadata(): Promise<Metadata> {
  return topicMetadata(await getDayTopicPage('Wednesday'));
}

export default function WednesdayTopicPage() {
  return <DayTopicPage day="Wednesday" />;
}
