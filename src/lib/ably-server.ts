import Ably from 'ably';

let ablyRest: Ably.Rest | null = null;

export function getAblyServer(): Ably.Rest {
  if (!ablyRest) {
    const key = process.env.ABLY_API_KEY;
    if (!key) throw new Error('ABLY_API_KEY environment variable is not set');
    ablyRest = new Ably.Rest(key);
  }
  return ablyRest;
}

export function publishToChat(
  conversationId: string,
  event: string,
  data: unknown
) {
  const ably = getAblyServer();
  const channel = ably.channels.get(`chat:${conversationId}`);
  return channel.publish(event, data);
}
