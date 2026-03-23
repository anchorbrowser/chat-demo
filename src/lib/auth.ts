import { withAuth, getSignInUrl } from '@workos-inc/authkit-nextjs';
import { redirect } from 'next/navigation';

export { withAuth };

export async function requireUser() {
  const session = await withAuth();
  if (!session.user) {
    throw new Error('Unauthorized');
  }
  return session.user;
}

export async function getAuthUser() {
  const session = await withAuth({ ensureSignedIn: false });
  return session.user;
}

export async function getAuthenticatedUser(): Promise<{ id: string; email: string; name: string }> {
  const session = await withAuth();
  if (!session.user) {
    const signInUrl = await getSignInUrl();
    redirect(signInUrl);
  }

  const { user } = session;

  const fullName =
    [user.firstName, user.lastName].filter(Boolean).join(' ')
    || user.email?.split('@')[0]
    || user.email
    || 'User';

  const email = user.email || '';

  return { id: user.id, email, name: fullName };
}
