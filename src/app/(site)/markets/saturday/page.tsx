import type { Metadata } from 'next';
import { DayTopicPage } from '@/components/DayTopicPage';
import { getDayTopicPage, topicMetadata } from '@/lib/topicPage';

export const revalidate = 86400;

/** `/markets/saturday`: the markets that open on Saturday, state by state. */
export async function generateMetadata(): Promise<Metadata> {
  return topicMetadata(await getDayTopicPage('Saturday'));
}

export default function SaturdayTopicPage() {
  return <DayTopicPage day="Saturday" />;
}
