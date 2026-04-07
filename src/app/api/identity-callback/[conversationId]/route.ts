import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { withAuth } from '@workos-inc/authkit-nextjs';
import { getConversation, updateConversation } from '@/lib/db';
import { createSession, listApplicationIdentities, tagIdentityWithUser, resolveUserApiKey, createClient } from '@/lib/anchorbrowser';

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
  const { user } = await withAuth();
  if (!user) {
    return NextResponse.redirect(browserRedirectUrl('/'));
  }

  const cookieStore = await cookies();
  const wosCookie = cookieStore.get('wos-session')?.value;
  if (!wosCookie) {
    return NextResponse.redirect(browserRedirectUrl('/'));
  }

  const userApiKey = await resolveUserApiKey(wosCookie);
  const abClient = createClient(userApiKey);

  const { conversationId } = await params;
  const { searchParams } = new URL(req.url);

  const conversation = await getConversation(conversationId, user.id);
  if (!conversation) {
    return NextResponse.redirect(browserRedirectUrl('/'));
  }

  let identityId = searchParams.get('identity_id') ?? searchParams.get('identityId');

  if (!identityId && conversation.applicationId) {
    try {
      const identities = await listApplicationIdentities(abClient, conversation.applicationId);
      if (identities.length > 0) {
        identityId = identities[identities.length - 1].id as string;
      }
    } catch (err) {
      console.error('[identity-callback] listApplicationIdentities failed:', err);
    }
  }

  if (!identityId) {
    console.error('[identity-callback] No identityId found for conversation:', conversationId);
    return NextResponse.redirect(browserRedirectUrl(`/conversation/${conversationId}`));
  }

  await tagIdentityWithUser(abClient, identityId, user.id);

  await updateConversation(conversationId, user.id, {
    identityId,
    pendingIdentityConnection: true,
  });

  try {
    const sessionData = await createSession(abClient, identityId);
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
