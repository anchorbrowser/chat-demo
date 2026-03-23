import { NextResponse } from 'next/server';
import { withAuth } from '@workos-inc/authkit-nextjs';
import { z } from 'zod';
import {
  getConversation,
  updateConversation,
  deleteConversation,
  getMessages,
} from '@/lib/db';
import { parseStoredMessages } from '@/lib/message-history';

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  pending_identity_connection: z.union([z.boolean(), z.literal(0), z.literal(1)]).optional(),
}).refine((data) => Object.keys(data).length > 0, { message: 'At least one field required' });

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await withAuth();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const conversation = await getConversation(id, user.id);
    if (!conversation) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const storedRows = await getMessages(id);
    const messages = parseStoredMessages(storedRows);

    // Check if any assistant message is still generating
    const isGenerating = storedRows.some(
      (r) => r.role === 'assistant' && r.status === 'generating'
    );

    return NextResponse.json({
      conversation,
      messages,
      isGenerating,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await withAuth();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const updates: Parameters<typeof updateConversation>[2] = {};
    if (parsed.data.title !== undefined) updates.title = parsed.data.title;
    if (parsed.data.pending_identity_connection !== undefined) {
      updates.pendingIdentityConnection = Boolean(parsed.data.pending_identity_connection);
    }

    await updateConversation(id, user.id, updates);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await withAuth();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    await deleteConversation(id, user.id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
