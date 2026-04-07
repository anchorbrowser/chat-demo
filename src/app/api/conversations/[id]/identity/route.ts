import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { withAuth } from '@workos-inc/authkit-nextjs';
import { getConversation, updateConversation } from '@/lib/db';
import { createSession, resolveUserApiKey, createClient } from '@/lib/anchorbrowser';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await withAuth();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const cookieStore = await cookies();
    const wosCookie = cookieStore.get('wos-session')?.value;
    if (!wosCookie) {
      return NextResponse.json({ error: 'Session cookie missing' }, { status: 401 });
    }

    const userApiKey = await resolveUserApiKey(wosCookie);
    const abClient = createClient(userApiKey);

    const { id } = await params;
    const conversation = await getConversation(id, user.id);
    if (!conversation) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    if (!body?.identityId) {
      return NextResponse.json({ error: 'identityId required' }, { status: 400 });
    }

    const { identityId } = body;
    await updateConversation(id, user.id, { identityId });

    try {
      const sessionData = await createSession(abClient, identityId);
      if (!sessionData?.id) {
        return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
      }

      await updateConversation(id, user.id, {
        sessionId: sessionData.id,
        liveViewUrl: sessionData.live_view_url ?? null,
      });

      return NextResponse.json({
        sessionId: sessionData.id,
        liveViewUrl: sessionData.live_view_url,
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to create session' },
        { status: 500 }
      );
    }
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
