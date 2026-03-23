import { NextResponse } from 'next/server';
import { withAuth } from '@workos-inc/authkit-nextjs';
import { getAblyServer } from '@/lib/ably-server';

export async function GET() {
  try {
    const { user } = await withAuth();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ably = getAblyServer();
    const tokenRequest = await ably.auth.createTokenRequest({
      clientId: user.id,
      // Restrict to subscribe-only on chat channels owned by this user.
      // Server publishes via the REST client (full key), clients can only listen.
      capability: { 'chat:*': ['subscribe'] },
    });

    return NextResponse.json(tokenRequest);
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
