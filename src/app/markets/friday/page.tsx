import type { Metadata } from 'next';
import { DayTopicPage } from '@/components/DayTopicPage';
import { getDayTopicPage, topicMetadata } from '@/lib/topicPage';

export const revalidate = 86400;

/** `/markets/friday`: the markets that open on Friday, state by state. */
export async function generateMetadata(): Promise<Metadata> {
  return topicMetadata(await getDayTopicPage('Friday'));
}

export default function FridayTopicPage() {
  return <DayTopicPage day="Friday" />;
}
