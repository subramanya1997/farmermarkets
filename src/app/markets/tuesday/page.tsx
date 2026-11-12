import type { Metadata } from 'next';
import { DayTopicPage } from '@/components/DayTopicPage';
import { getDayTopicPage, topicMetadata } from '@/lib/topicPage';

export const revalidate = 86400;

/** `/markets/tuesday`: the markets that open on Tuesday, state by state. */
export async function generateMetadata(): Promise<Metadata> {
  return topicMetadata(await getDayTopicPage('Tuesday'));
}

export default function TuesdayTopicPage() {
  return <DayTopicPage day="Tuesday" />;
}
