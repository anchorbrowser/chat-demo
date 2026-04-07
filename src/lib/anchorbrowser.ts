import Anchorbrowser from 'anchorbrowser';

const ANCHORBROWSER_API_URL = process.env.ANCHORBROWSER_API_URL ?? 'https://api.anchorbrowser.io';

export function createClient(apiKey: string): Anchorbrowser {
  return new Anchorbrowser({
    apiKey,
    baseURL: ANCHORBROWSER_API_URL,
  });
}

/**
 * Resolve the logged-in user's own Anchorbrowser API key by forwarding
 * the WorkOS session cookie (`wos-session`) to the Anchorbrowser API.
 *
 *   1. GET /api/user/project  → project ID
 *   2. GET /v1/projects/:projectId/api-keys → user's API key
 *
 * The Anchorbrowser API authenticates via the same WorkOS session cookie
 * (not a Bearer token), so we read it from Next.js cookies and forward it.
 */
export async function resolveUserApiKey(wosCookie: string): Promise<string> {
  const headers: Record<string, string> = {
    Cookie: `wos-session=${wosCookie}`,
  };

  // Step 1: get the user's project ID
  const projectRes = await fetch(`${ANCHORBROWSER_API_URL}/api/user/project`, { headers });
  if (!projectRes.ok) {
    const body = await projectRes.text().catch(() => '');
    throw new Error(`[resolveUserApiKey] /api/user/project returned ${projectRes.status}: ${body}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const projectData: any = await projectRes.json();
  console.log('[resolveUserApiKey] /api/user/project response:', JSON.stringify(projectData));

  const projectId =
    projectData?.id ??
    projectData?.data?.project_id ??
    projectData?.data?.id ??
    projectData?.project_id ??
    projectData?.project?.id ??
    projectData?.projects?.[0]?.id;
  if (!projectId) {
    throw new Error(`[resolveUserApiKey] could not extract project id from response: ${JSON.stringify(projectData)}`);
  }

  // Step 2: get the API keys for that project
  const keysRes = await fetch(
    `${ANCHORBROWSER_API_URL}/v1/projects/${projectId}/api-keys`,
    { headers },
  );
  if (!keysRes.ok) {
    const body = await keysRes.text().catch(() => '');
    throw new Error(`[resolveUserApiKey] /v1/projects/${projectId}/api-keys returned ${keysRes.status}: ${body}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const keysData: any = await keysRes.json();
  console.log('[resolveUserApiKey] api-keys response:', JSON.stringify(keysData));

  const keysList: unknown[] =
    Array.isArray(keysData) ? keysData :
    Array.isArray(keysData?.data?.items) ? keysData.data.items :
    Array.isArray(keysData?.data) ? keysData.data :
    Array.isArray(keysData?.items) ? keysData.items :
    Array.isArray(keysData?.apiKeys) ? keysData.apiKeys :
    Array.isArray(keysData?.api_keys) ? keysData.api_keys :
    [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const firstEntry = keysList[0] as any;
  const apiKey: string | undefined =
    firstEntry?.apikey ?? firstEntry?.key ?? firstEntry?.apiKey ?? firstEntry?.api_key ?? firstEntry?.secret;

  if (!apiKey) {
    throw new Error(`[resolveUserApiKey] no api key found in response: ${JSON.stringify(keysData)}`);
  }

  console.log('[resolveUserApiKey] resolved user api key:', apiKey.slice(0, 8) + '...');
  return apiKey;
}

export async function listApplications(client: Anchorbrowser) {
  const response = await client.applications.list();
  return (response as unknown as { applications?: Array<{ id: string; name: string; url: string; description?: string; identity_count?: number }> }).applications ?? [];
}

export async function createApplication(client: Anchorbrowser, source: string, name?: string, description?: string) {
  const response = await client.applications.create({
    source,
    ...(name ? { name } : {}),
    ...(description ? { description } : {}),
  });
  return response as unknown as { id: string; name: string; url: string };
}

export async function listApplicationIdentities(client: Anchorbrowser, applicationId: string) {
  const response = await client.applications.listIdentities(applicationId, {});
  return response.identities ?? [];
}

/**
 * Deletes Anchorbrowser identities tagged with `metadata.userId` for this WorkOS user.
 * Requires the session cookie so the user's project API key can be resolved.
 */
export async function deleteAllUserIdentities(wosCookie: string, userId: string): Promise<void> {
  const userApiKey = await resolveUserApiKey(wosCookie);
  const client = createClient(userApiKey);
  const apps = await listApplications(client);
  const metadata = JSON.stringify({ userId });
  for (const app of apps) {
    if (!app.id) {
      continue;
    }
    const response = await client.applications.listIdentities(app.id, { metadata });
    const identities = response.identities ?? [];
    for (const identity of identities) {
      if (!identity.id) {
        continue;
      }
      try {
        await client.identities.delete(identity.id);
      } catch (err) {
        console.error('[deleteAllUserIdentities] failed to delete', identity.id, err);
      }
    }
  }
}

export async function createIdentityToken(client: Anchorbrowser, applicationId: string, callbackUrl: string) {
  const response = await client.applications.createIdentityToken(applicationId, {
    callbackUrl,
  });
  return response as unknown as { token?: string; expires_at?: unknown; token_hash?: string };
}

export async function tagIdentityWithUser(client: Anchorbrowser, identityId: string, userId: string) {
  try {
    await client.identities.update(identityId, {
      metadata: { userId },
    });
  } catch (err) {
    console.error('[tagIdentityWithUser] failed:', err);
  }
}

export async function createSession(client: Anchorbrowser, identityId: string) {
  const response = await client.sessions.create({
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

export async function getSession(client: Anchorbrowser, sessionId: string) {
  try {
    return await client.sessions.retrieve(sessionId);
  } catch {
    return null;
  }
}

export async function deleteSession(client: Anchorbrowser, sessionId: string) {
  try {
    await client.sessions.delete(sessionId);
  } catch {
    // Session may already be terminated
  }
}

export async function runTask(client: Anchorbrowser, taskId: string, sessionId: string, inputs: Record<string, unknown>) {
  const inputParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(inputs)) {
    inputParams[key] = typeof value === 'string' ? value : JSON.stringify(value);
  }

  const response = await client.tasks.run(taskId, {
    input_params: inputParams,
    session_id: sessionId,
  });
  return response;
}

export async function performWebTask(client: Anchorbrowser, sessionId: string, prompt: string, url?: string) {
  const response = await client.tools.performWebTask({
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
