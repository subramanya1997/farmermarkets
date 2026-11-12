import type { Metadata } from 'next';
import { DayTopicPage } from '@/components/DayTopicPage';
import { getDayTopicPage, topicMetadata } from '@/lib/topicPage';

export const revalidate = 86400;

/** `/markets/thursday`: the markets that open on Thursday, state by state. */
export async function generateMetadata(): Promise<Metadata> {
  return topicMetadata(await getDayTopicPage('Thursday'));
}

export default function ThursdayTopicPage() {
  return <DayTopicPage day="Thursday" />;
}
