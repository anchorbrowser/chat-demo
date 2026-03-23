import type { UIMessage } from 'ai';
import { randomUUID } from 'node:crypto';

export function parseStoredMessages(
  rows: Array<{ id: string; role: string; parts: unknown }>
): UIMessage[] {
  return rows
    .filter((row) => row.role === 'user' || row.role === 'assistant')
    .filter((row) => Array.isArray(row.parts) && row.parts.length > 0)
    .map((row) => ({
      id: row.id || randomUUID(),
      role: row.role as 'user' | 'assistant',
      parts: row.parts as UIMessage['parts'],
    }));
}

export function toCanonicalStoredMessages(
  messages: UIMessage[]
): Array<{ id: string; role: 'user' | 'assistant'; parts: unknown[] }> {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .filter((m) => Array.isArray(m.parts) && m.parts.length > 0)
    .map((m) => ({
      id: m.id || randomUUID(),
      role: m.role as 'user' | 'assistant',
      parts: m.parts as unknown[],
    }));
}
