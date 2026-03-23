import { NextResponse } from 'next/server';
import { withAuth } from '@workos-inc/authkit-nextjs';
import { z } from 'zod';
import { getConversation, saveMessage } from '@/lib/db';

const messageSchema = z.object({
  conversationId: z.string().uuid(),
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const { user } = await withAuth();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const parsed = messageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const { conversationId, role, content } = parsed.data;

    const conversation = await getConversation(conversationId, user.id);
    if (!conversation) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const id = await saveMessage(conversationId, role, [
      { type: 'text', text: content },
    ]);
    return NextResponse.json({ id });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
