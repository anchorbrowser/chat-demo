import { ChatApp } from '@/components/chat-app';
import { getAuthenticatedUser } from '@/lib/auth';

export default async function Home() {
  const user = await getAuthenticatedUser();
  return <ChatApp user={user} initialConversationId={null} />;
}
