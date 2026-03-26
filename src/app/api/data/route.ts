import { NextResponse } from 'next/server';
import { withAuth } from '@workos-inc/authkit-nextjs';
import { deleteAllUserData } from '@/lib/db';
import { deleteAllUserIdentities } from '@/lib/anchorbrowser';

export async function DELETE() {
  try {
    const { user } = await withAuth();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Delete anchorbrowser identities before wiping DB records
    await deleteAllUserIdentities(user.id).catch((err) => {
      console.error('[DELETE /api/data] Failed to delete identities:', err);
    });

    await deleteAllUserData(user.id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
