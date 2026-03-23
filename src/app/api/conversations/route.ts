import { NextResponse } from 'next/server';
import { withAuth } from '@workos-inc/authkit-nextjs';
import { listConversations, createConversation } from '@/lib/db';

export async function GET() {
  try {
    const { user } = await withAuth();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const conversations = await listConversations(user.id);
    return NextResponse.json(conversations);
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST() {
  try {
    const { user } = await withAuth();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const conversation = await createConversation(user.id);
    return NextResponse.json(conversation);
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
