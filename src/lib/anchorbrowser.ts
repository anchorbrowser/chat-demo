import Anchorbrowser from 'anchorbrowser';

let _client: Anchorbrowser | null = null;

function getClient() {
  if (!_client) {
    _client = new Anchorbrowser({
      apiKey: process.env.ANCHORBROWSER_API_KEY!,
      baseURL: process.env.ANCHORBROWSER_API_URL ?? 'https://api.anchorbrowser.io',
    });
  }
  return _client;
}

export async function listApplications() {
  const response = await getClient().applications.list();
  return (response as unknown as { applications?: Array<{ id: string; name: string; url: string; description?: string; identity_count?: number }> }).applications ?? [];
}

export async function createApplication(source: string, name?: string, description?: string) {
  const response = await getClient().applications.create({
    source,
    ...(name ? { name } : {}),
    ...(description ? { description } : {}),
  });
  return response as unknown as { id: string; name: string; url: string };
}

export async function listApplicationIdentities(applicationId: string) {
  const response = await getClient().applications.listIdentities(applicationId, {});
  return response.identities ?? [];
}

export async function createIdentityToken(applicationId: string, callbackUrl: string) {
  const response = await getClient().applications.createIdentityToken(applicationId, {
    callbackUrl,
  });
  return response as unknown as { token?: string; expires_at?: unknown; token_hash?: string };
}

export async function tagIdentityWithUser(identityId: string, userId: string) {
  try {
    await getClient().identities.update(identityId, {
      metadata: { userId },
    });
  } catch (err) {
    console.error('[tagIdentityWithUser] failed:', err);
  }
}

export async function createSession(identityId: string) {
  const response = await getClient().sessions.create({
    browser: {
      extra_stealth: { active: true },
      captcha_solver: { active: true },
    },
    session: {
      proxy: { active: true, type: 'anchor_proxy' as const },
      timeout: { max_duration: 30, idle_timeout: 10 },
    },
    identities: [{ id: identityId }],
  });
  return response.data;
}

export async function getSession(sessionId: string) {
  try {
    return await getClient().sessions.retrieve(sessionId);
  } catch {
    return null;
  }
}

export async function deleteSession(sessionId: string) {
  try {
    await getClient().sessions.delete(sessionId);
  } catch {
    // Session may already be terminated
  }
}

export async function runTask(taskId: string, sessionId: string, inputs: Record<string, unknown>) {
  const inputParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(inputs)) {
    inputParams[key] = typeof value === 'string' ? value : JSON.stringify(value);
  }

  const response = await getClient().tasks.run(taskId, {
    input_params: inputParams,
    session_id: sessionId,
  });
  return response;
}

export async function performWebTask(sessionId: string, prompt: string, url?: string) {
  const response = await getClient().tools.performWebTask({
    sessionId,
    prompt,
    ...(url ? { url } : {}),
  });
  return response;
}

export function getIdentityCreationUrl(token: string, userName?: string) {
  const baseUrl = process.env.ANCHORBROWSER_APP_URL ?? process.env.ANCHORBROWSER_DASHBOARD_API_URL ?? 'https://app.anchorbrowser.io';
  const params = new URLSearchParams({ token });
  if (userName) {
    params.set('userName', userName);
  }
  return `${baseUrl}/identity/create?${params.toString()}`;
}
