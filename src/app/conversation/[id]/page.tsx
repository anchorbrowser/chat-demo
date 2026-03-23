import { redirect } from 'next/navigation';
import { ChatApp } from '@/components/chat-app';
import { getAuthenticatedUser } from '@/lib/auth';
import { getConversation } from '@/lib/db';

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getAuthenticatedUser();
  const { id } = await params;

  const conversation = await getConversation(id, user.id);
  if (!conversation) {
    redirect('/');
  }

  return <ChatApp user={user} initialConversationId={id} />;
}
