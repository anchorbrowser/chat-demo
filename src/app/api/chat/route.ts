import {
  streamText,
  stepCountIs,
  convertToModelMessages,
  type UIMessage,
} from 'ai';
import { after } from 'next/server';
import { withAuth } from '@workos-inc/authkit-nextjs';
import { createTools } from '@/lib/tools';
import { getModel } from '@/lib/models';
import { SYSTEM_PROMPT } from '@/lib/system-prompt';
import {
  getConversation,
  replaceConversationMessages,
  updateConversation,
  saveGeneratingMessage,
  updateMessageStatus,
  updateMessageParts,
} from '@/lib/db';
import { toCanonicalStoredMessages } from '@/lib/message-history';
import { publishToChat } from '@/lib/ably-server';
import { randomUUID } from 'node:crypto';

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const { user } = await withAuth();
    if (!user) {
      return new Response('Unauthorized', { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body?.conversationId || !Array.isArray(body.messages)) {
      return new Response('Invalid request: conversationId and messages array required', { status: 400 });
    }

    const { messages: rawMessages, conversationId } = body as {
      messages: UIMessage[];
      conversationId: string;
    };

    const conversation = await getConversation(conversationId, user.id);
    if (!conversation) {
      return new Response('Conversation not found', { status: 404 });
    }

    const modelMessages = await convertToModelMessages(rawMessages);
    const tools = createTools({ userId: user.id, conversationId });

    // Create a 'generating' placeholder for the assistant message in DB.
    const assistantMsgId = randomUUID();
    await saveGeneratingMessage(conversationId, assistantMsgId);

    // Notify the client that generation has started.
    await publishToChat(conversationId, 'generation-started', {
      assistantMsgId,
    });

    // Run the AI stream in the background using next/server `after()`.
    after(async () => {
      // Track parts as they accumulate so DB always has the latest state.
      const accumulatedParts: unknown[] = [];
      let pendingText = '';

      // Flush current parts to DB — called on meaningful events (tool call/result).
      const persistPartsNow = async () => {
        const parts = [...accumulatedParts];
        if (pendingText) parts.push({ type: 'text', text: pendingText });
        await updateMessageParts(assistantMsgId, parts).catch(() => {});
      };

      try {
        const result = streamText({
          model: getModel(),
          system: SYSTEM_PROMPT,
          messages: modelMessages,
          tools,
          stopWhen: stepCountIs(10),
          onChunk: async ({ chunk }) => {
            if (chunk.type === 'text-delta') {
              pendingText += chunk.text;
              await publishToChat(conversationId, 'text-delta', {
                text: chunk.text,
                messageId: assistantMsgId,
              });
              // Don't persist every text delta — too frequent
            }
            if (chunk.type === 'tool-call') {
              // Add tool call part as in-progress
              accumulatedParts.push({
                type: `tool-${chunk.toolName}`,
                toolCallId: chunk.toolCallId,
                state: 'input-available',
                input: chunk.input ?? {},
              });
              await publishToChat(conversationId, 'tool-call', {
                messageId: assistantMsgId,
                toolCallId: chunk.toolCallId,
                toolName: chunk.toolName,
                input: chunk.input,
              });
              // Persist immediately — user should see tool started
              await persistPartsNow();
            }
            if (chunk.type === 'tool-result') {
              // Update the matching tool part to completed
              for (let i = accumulatedParts.length - 1; i >= 0; i--) {
                const p = accumulatedParts[i] as { toolCallId?: string };
                if (p.toolCallId === chunk.toolCallId) {
                  accumulatedParts[i] = {
                    ...(accumulatedParts[i] as object),
                    state: 'output-available',
                    output: chunk.output,
                  };
                  break;
                }
              }
              await publishToChat(conversationId, 'tool-result', {
                messageId: assistantMsgId,
                toolCallId: chunk.toolCallId,
                toolName: chunk.toolName,
                output: chunk.output,
              });
              // Persist immediately — tool finished
              await persistPartsNow();
            }
          },
          onStepFinish: async () => {
            // Flush pending text into accumulated parts
            if (pendingText) {
              accumulatedParts.push({ type: 'text', text: pendingText });
              pendingText = '';
            }
            // Add step boundary
            accumulatedParts.push({ type: 'step-start' });
            await persistPartsNow();
            await publishToChat(conversationId, 'step-finish', {
              messageId: assistantMsgId,
            });
          },
        });

        // Build final UIMessages via the toUIMessageStream onFinish
        const uiStream = result.toUIMessageStream({
          originalMessages: rawMessages,
          onFinish: async ({ messages: uiMessages }) => {
            // Persist the canonical UIMessages to DB
            const canonicalRows = toCanonicalStoredMessages(uiMessages);
            if (canonicalRows.length > 0) {
              await replaceConversationMessages(conversationId, canonicalRows);
            }

            // Auto-title the conversation
            if (conversation.title === 'New Chat') {
              const firstUserMsg = uiMessages.find((m) => m.role === 'user');
              if (firstUserMsg) {
                const textPart = firstUserMsg.parts.find(
                  (p): p is { type: 'text'; text: string } =>
                    p.type === 'text' && typeof p.text === 'string'
                );
                const title = textPart?.text?.trim().slice(0, 100);
                if (title) {
                  await updateConversation(conversationId, user.id, { title });
                }
              }
            }

            // Notify client that generation is complete
            await publishToChat(conversationId, 'completed', {
              messageId: assistantMsgId,
            });
          },
        });

        // Drain the UI stream to trigger onFinish
        const reader = uiStream.getReader();
        let streamDone = false;
        while (!streamDone) {
          const { done } = await reader.read();
          streamDone = done;
        }
      } catch (err) {
        console.error('[chat] Background stream error:', err);
        // Persist whatever we have so far
        await persistPartsNow();
        await updateMessageStatus(assistantMsgId, 'completed');
        await publishToChat(conversationId, 'error', {
          messageId: assistantMsgId,
          error: err instanceof Error ? err.message : 'Generation failed',
        });
      }
    });

    // Return immediately — the stream runs in the background via after().
    return Response.json({ assistantMsgId });
  } catch (err) {
    console.error('[chat] POST error:', err);
    return new Response('Internal server error', { status: 500 });
  }
}
