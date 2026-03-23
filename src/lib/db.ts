import { prisma } from './prisma';
import type { ConversationModel } from '@/generated/prisma/models/Conversation';
import type { MessageModel } from '@/generated/prisma/models/Message';
import type { Prisma } from '@/generated/prisma/client';

export type Conversation = ConversationModel;
export type Message = MessageModel;

// Prisma JSON input type — avoids `as any` casts throughout.
type JsonInput = Prisma.InputJsonValue;

export async function createConversation(userId: string): Promise<Conversation> {
  return prisma.conversation.create({
    data: { userId },
  });
}

export async function getConversation(id: string, userId: string): Promise<Conversation | null> {
  return prisma.conversation.findFirst({
    where: { id, userId },
  });
}

export async function getConversationById(id: string): Promise<Conversation | null> {
  return prisma.conversation.findUnique({
    where: { id },
  });
}

export async function listConversations(userId: string): Promise<Conversation[]> {
  return prisma.conversation.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function updateConversation(
  id: string,
  userId: string,
  updates: Partial<Pick<Conversation, 'title' | 'identityId' | 'sessionId' | 'liveViewUrl' | 'pendingIdentityConnection'>>
) {
  await prisma.conversation.updateMany({
    where: { id, userId },
    data: updates,
  });
}

export async function deleteConversation(id: string, userId: string) {
  await prisma.conversation.deleteMany({
    where: { id, userId },
  });
}

export async function deleteAllUserData(userId: string) {
  await prisma.conversation.deleteMany({
    where: { userId },
  });
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  return prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
  });
}

export async function saveMessage(
  conversationId: string,
  role: string,
  parts: unknown[]
): Promise<string> {
  const message = await prisma.message.create({
    data: {
      conversationId,
      role,
      parts: parts as JsonInput,
    },
  });
  return message.id;
}

export async function replaceConversationMessages(
  conversationId: string,
  messages: Array<{ id: string; role: 'user' | 'assistant'; parts: unknown[] }>
) {
  const deduped = [...new Map(messages.map((m) => [m.id, m])).values()];
  const incomingIds = deduped.map((m) => m.id);

  await prisma.$transaction([
    // Only delete messages that are NOT in the incoming set (avoids full wipe).
    prisma.message.deleteMany({
      where: { conversationId, id: { notIn: incomingIds } },
    }),
    // Upsert each message — update if exists, create if not.
    ...deduped.map((msg) =>
      prisma.message.upsert({
        where: { id: msg.id },
        update: {
          role: msg.role,
          parts: msg.parts as JsonInput,
          status: 'completed',
        },
        create: {
          id: msg.id,
          conversationId,
          role: msg.role,
          parts: msg.parts as JsonInput,
          status: 'completed',
        },
      })
    ),
  ]);
}

export async function saveGeneratingMessage(
  conversationId: string,
  id: string
): Promise<void> {
  await prisma.message.create({
    data: {
      id,
      conversationId,
      role: 'assistant',
      parts: [],
      status: 'generating',
    },
  });
}

export async function updateMessageStatus(
  id: string,
  status: 'generating' | 'completed'
): Promise<void> {
  await prisma.message.updateMany({
    where: { id },
    data: { status },
  });
}

export async function updateMessageParts(
  id: string,
  parts: unknown[]
): Promise<void> {
  await prisma.message.updateMany({
    where: { id },
    data: { parts: parts as JsonInput },
  });
}
