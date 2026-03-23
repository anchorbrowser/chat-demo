import { NextResponse } from 'next/server';
import { withAuth } from '@workos-inc/authkit-nextjs';
import { getConversation, updateConversation } from '@/lib/db';
import { createSession, listUserIdentities, tagIdentityWithUser } from '@/lib/anchorbrowser';

function browserRedirectUrl(path: string): string {
  const base = (
    process.env.NEXT_PUBLIC_REDIRECT_URL
    ?? process.env.NEXT_PUBLIC_APP_URL
    ?? 'http://localhost:3000'
  ).replace(/\/+$/, '');
  return `${base}${path}`;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  // Require authenticated user — prevents unauthenticated mutation
  const { user } = await withAuth();
  if (!user) {
    return NextResponse.redirect(browserRedirectUrl('/'));
  }

  const { conversationId } = await params;
  const { searchParams } = new URL(req.url);

  // Verify the conversation belongs to the authenticated user
  const conversation = await getConversation(conversationId, user.id);
  if (!conversation) {
    return NextResponse.redirect(browserRedirectUrl('/'));
  }

  // Anchorbrowser passes identity_id (underscore), but also check camelCase
  let identityId = searchParams.get('identity_id') ?? searchParams.get('identityId');

  if (!identityId) {
    try {
      const identities = await listUserIdentities(user.id);
      if (identities.length > 0) {
        identityId = identities[identities.length - 1].id as string;
      }
    } catch (err) {
      console.error('[identity-callback] listUserIdentities failed:', err);
    }
  }

  if (!identityId) {
    console.error('[identity-callback] No identityId found for conversation:', conversationId);
    return NextResponse.redirect(browserRedirectUrl(`/conversation/${conversationId}`));
  }

  // Tag identity with userId so it shows up in future metadata queries
  await tagIdentityWithUser(identityId, user.id);

  // Set identity and flag for frontend detection
  await updateConversation(conversationId, user.id, {
    identityId,
    pendingIdentityConnection: true,
  });

  // Best-effort session creation
  try {
    const sessionData = await createSession(identityId);
    if (sessionData?.id) {
      await updateConversation(conversationId, user.id, {
        sessionId: sessionData.id,
        liveViewUrl: sessionData.live_view_url ?? null,
      });
    }
  } catch {
    // AI can retry session creation when needed
  }

  return NextResponse.redirect(browserRedirectUrl(`/conversation/${conversationId}`));
}
