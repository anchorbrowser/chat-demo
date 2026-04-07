import { tool, type Tool } from 'ai';
import { z } from 'zod';
import type Anchorbrowser from 'anchorbrowser';
import {
  listApplications,
  createApplication,
  listApplicationIdentities,
  createIdentityToken,
  createSession,
  getSession,
  runTask,
  performWebTask,
  getIdentityCreationUrl,
} from './anchorbrowser';
import { getConversation, updateConversation } from './db';

function getTaskIds() {
  return {
    searchPeople: process.env.TASK_ID_LINKEDIN_SEARCH_PEOPLE,
    viewProfile: process.env.TASK_ID_LINKEDIN_VIEW_PROFILE,
    sendConnectionRequest: process.env.TASK_ID_LINKEDIN_SEND_CONNECTION_REQUEST,
    sendMessage: process.env.TASK_ID_LINKEDIN_SEND_MESSAGE,
    searchJobs: process.env.TASK_ID_LINKEDIN_SEARCH_JOBS,
    createPost: process.env.TASK_ID_LINKEDIN_CREATE_POST,
    reactToPost: process.env.TASK_ID_LINKEDIN_REACT_TO_POST,
    commentOnPost: process.env.TASK_ID_LINKEDIN_COMMENT_ON_POST,
    getFeed: process.env.TASK_ID_LINKEDIN_GET_FEED,
    getNotifications: process.env.TASK_ID_LINKEDIN_GET_NOTIFICATIONS,
  };
}

export interface ToolContext {
  userId: string;
  conversationId: string;
  abClient: Anchorbrowser;
}

function getAppBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}

async function ensureSession(ctx: ToolContext): Promise<{ sessionId: string; liveViewUrl: string }> {
  const conversation = await getConversation(ctx.conversationId, ctx.userId);
  if (!conversation) throw new Error('Conversation not found');

  if (conversation.sessionId) {
    const session = await getSession(ctx.abClient, conversation.sessionId);
    if (session) {
      return { sessionId: conversation.sessionId, liveViewUrl: conversation.liveViewUrl ?? '' };
    }
  }

  if (!conversation.identityId) {
    throw new Error('NO_IDENTITY');
  }

  const session = await createSession(ctx.abClient, conversation.identityId);
  if (!session?.id) throw new Error('Session creation returned no ID');
  await updateConversation(ctx.conversationId, ctx.userId, {
    sessionId: session.id,
    liveViewUrl: session.live_view_url ?? null,
  });

  return { sessionId: session.id, liveViewUrl: session.live_view_url ?? '' };
}

async function runLinkedInTask(
  ctx: ToolContext,
  taskId: string,
  inputs: Record<string, unknown>
) {
  const { sessionId } = await ensureSession(ctx);
  return runTask(ctx.abClient, taskId, sessionId, inputs);
}

export function createTools(ctx: ToolContext) {
  const taskIds = getTaskIds();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: Record<string, Tool<any, any>> = {
    list_applications: tool({
      description:
        'List all applications (websites/services) configured in the user\'s Anchorbrowser account. Use this to check if an application already exists for a target website before creating a new one.',
      inputSchema: z.object({}),
      execute: async () => {
        const apps = await listApplications(ctx.abClient);
        return {
          applications: apps.map((a) => ({
            id: a.id,
            name: a.name,
            url: a.url,
            identityCount: a.identity_count ?? 0,
          })),
        };
      },
    }),

    create_application: tool({
      description:
        'Create a new application for a target website. Provide the full URL of the site (e.g. "https://example.com"). If an application for that URL already exists, the existing one is returned. The created application ID is stored on the conversation for subsequent identity and session calls.',
      inputSchema: z.object({
        source: z.string().describe('The full URL of the target website (e.g. "https://example.com")'),
        name: z.string().optional().describe('Optional display name for the application'),
        description: z.string().optional().describe('Optional description'),
      }),
      execute: async ({ source, name, description }) => {
        const app = await createApplication(ctx.abClient, source, name, description);
        await updateConversation(ctx.conversationId, ctx.userId, { applicationId: app.id });
        return {
          applicationId: app.id,
          name: app.name,
          url: app.url,
          message: `Application "${app.name}" is ready.`,
        };
      },
    }),

    list_identities: tool({
      description:
        'List identities (user accounts) linked to an application. Call this after ensuring the conversation has an application set. If the conversation already has an identity linked, returns that directly.',
      inputSchema: z.object({
        applicationId: z.string().describe('The application ID to list identities for'),
      }),
      execute: async ({ applicationId }) => {
        await updateConversation(ctx.conversationId, ctx.userId, { applicationId });

        const conversation = await getConversation(ctx.conversationId, ctx.userId);
        if (conversation?.identityId) {
          return {
            identities: [{ id: conversation.identityId, name: 'Connected identity', status: 'linked' }],
            preSelectedIdentityId: conversation.identityId,
            message: 'This conversation already has an identity linked. You can select it to proceed.',
          };
        }

        const identities = await listApplicationIdentities(ctx.abClient, applicationId);

        const mappedIdentities = identities.map((id) => ({
          id: id.id ?? '',
          name: id.name ?? 'Unknown',
          status: id.status ?? 'unknown',
        }));

        const usableStatuses = new Set(['validated', 'pending']);
        const hasUsableIdentity = identities.some(
          (id) => usableStatuses.has(id.status?.toLowerCase() ?? '')
        );

        if (identities.length === 0 || !hasUsableIdentity) {
          let connectUrl: string | undefined;
          try {
            const callbackUrl = `${getAppBaseUrl()}/api/identity-callback/${ctx.conversationId}`;
            const tokenData = await createIdentityToken(ctx.abClient, applicationId, callbackUrl);
            const token = tokenData?.token;
            if (token) {
              connectUrl = getIdentityCreationUrl(token);
            }
          } catch (err) {
            console.error('[list_identities] createIdentityToken failed:', err);
          }

          return {
            identities: mappedIdentities,
            requiresIdentityConnection: true,
            connectUrl,
            message: identities.length === 0
              ? (connectUrl ? 'No identity connected for this app. Use the connection link.' : 'No identity connected.')
              : (connectUrl ? 'Existing identities have issues. Use the connection link or select an existing one.' : 'Existing identities have issues.'),
          };
        }

        return { identities: mappedIdentities };
      },
    }),

    select_identity: tool({
      description:
        'Select an identity for this chat session and create a browser session. Call this after listing identities and the user chooses one, or when there is only one identity available.',
      inputSchema: z.object({
        identityId: z.string().describe('The identity ID to use for this session'),
      }),
      execute: async ({ identityId }) => {
        await updateConversation(ctx.conversationId, ctx.userId, { identityId });
        try {
          const session = await createSession(ctx.abClient, identityId);
          if (!session?.id) throw new Error('Session creation returned no ID');
          await updateConversation(ctx.conversationId, ctx.userId, {
            sessionId: session.id,
            liveViewUrl: session.live_view_url ?? null,
          });
          return {
            success: true,
            message: 'Identity selected and browser session created. Ready to automate.',
            liveViewUrl: session.live_view_url,
          };
        } catch (error: unknown) {
          const errMsg = error instanceof Error ? error.message : String(error);
          const errBody = (error as { body?: unknown })?.body ?? (error as { response?: unknown })?.response;
          console.error('[select_identity] createSession failed:', errMsg, errBody ?? '');
          return {
            success: false,
            message: `Failed to create browser session: ${errMsg}`,
            rawError: errBody ?? errMsg,
          };
        }
      },
    }),

    create_identity_link: tool({
      description:
        'Generate a link for the user to connect their account for a specific application. Call this when the user has no identities or wants to add a new one.',
      inputSchema: z.object({
        applicationId: z.string().describe('The application ID to create the identity link for'),
        userName: z.string().optional().describe('Optional display name for the identity'),
      }),
      execute: async ({ applicationId, userName }) => {
        const callbackUrl = `${getAppBaseUrl()}/api/identity-callback/${ctx.conversationId}`;
        const tokenData = await createIdentityToken(ctx.abClient, applicationId, callbackUrl);
        const token = tokenData?.token;
        if (!token) throw new Error('Failed to generate identity token');
        const url = getIdentityCreationUrl(token, userName);
        return {
          url,
          message: 'Use this link to connect your account.',
        };
      },
    }),

    perform_web_task: tool({
      description:
        'FALLBACK ONLY: Use AI to perform a browser automation task when no specific tool exists. This uses an AI agent to control the browser, which can take longer and is less reliable. Always warn the user that this is an AI-driven action.',
      inputSchema: z.object({
        prompt: z.string().describe('Description of the task for the AI to perform'),
        url: z.string().optional().describe('Optional starting URL'),
      }),
      execute: async ({ prompt, url }) => {
        const { sessionId } = await ensureSession(ctx);
        return performWebTask(ctx.abClient, sessionId, prompt, url);
      },
    }),
  };

  // LinkedIn task tools — only added if their task ID is configured
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linkedInTools: Record<string, { taskId: string | undefined; def: Tool<any, any> }> = {
    linkedin_search_people: {
      taskId: taskIds.searchPeople,
      def: tool({
        description: 'Search LinkedIn for people by keywords, job title, location, or company. Returns a list of matching profiles.',
        inputSchema: z.object({
          query: z.string().describe('Search query (e.g., "software engineer")'),
          filters: z.object({
            title: z.string().optional().describe('Job title filter'),
            location: z.string().optional().describe('Location filter'),
            company: z.string().optional().describe('Company name filter'),
            connectionDegree: z.string().optional().describe('Connection degree: "1st", "2nd", "3rd+"'),
          }).optional().describe('Optional search filters'),
          maxResults: z.number().optional().default(10).describe('Maximum results to return'),
        }),
        execute: async (inputs) => runLinkedInTask(ctx, taskIds.searchPeople!, inputs),
      }),
    },
    linkedin_view_profile: {
      taskId: taskIds.viewProfile,
      def: tool({
        description: 'View a LinkedIn profile and return detailed information about the person.',
        inputSchema: z.object({ profileUrl: z.string().describe('LinkedIn profile URL') }),
        execute: async (inputs) => runLinkedInTask(ctx, taskIds.viewProfile!, inputs),
      }),
    },
    linkedin_send_connection_request: {
      taskId: taskIds.sendConnectionRequest,
      def: tool({
        description: 'Send a connection request to a LinkedIn user with an optional personalized note.',
        inputSchema: z.object({
          profileUrl: z.string().describe('LinkedIn profile URL'),
          note: z.string().optional().describe('Optional personalized note (max 300 characters)'),
        }),
        execute: async (inputs) => runLinkedInTask(ctx, taskIds.sendConnectionRequest!, inputs),
      }),
    },
    linkedin_send_message: {
      taskId: taskIds.sendMessage,
      def: tool({
        description: 'Send a direct message to an existing LinkedIn connection.',
        inputSchema: z.object({
          profileUrl: z.string().describe('LinkedIn profile URL of the connection'),
          message: z.string().describe('Message content to send'),
        }),
        execute: async (inputs) => runLinkedInTask(ctx, taskIds.sendMessage!, inputs),
      }),
    },
    linkedin_search_jobs: {
      taskId: taskIds.searchJobs,
      def: tool({
        description: 'Search for job listings on LinkedIn.',
        inputSchema: z.object({
          query: z.string().describe('Job search query'),
          filters: z.object({
            location: z.string().optional().describe('Location filter'),
            remote: z.boolean().optional().describe('Remote jobs only'),
            experienceLevel: z.string().optional().describe('Experience level: "entry", "mid", "senior", "director"'),
            datePosted: z.string().optional().describe('Date posted: "24h", "week", "month"'),
          }).optional(),
          maxResults: z.number().optional().default(10),
        }),
        execute: async (inputs) => runLinkedInTask(ctx, taskIds.searchJobs!, inputs),
      }),
    },
    linkedin_create_post: {
      taskId: taskIds.createPost,
      def: tool({
        description: 'Create a new text post on LinkedIn.',
        inputSchema: z.object({ content: z.string().describe('The post content/text') }),
        execute: async (inputs) => runLinkedInTask(ctx, taskIds.createPost!, inputs),
      }),
    },
    linkedin_react_to_post: {
      taskId: taskIds.reactToPost,
      def: tool({
        description: 'React to a LinkedIn post (like, celebrate, support, etc.).',
        inputSchema: z.object({
          postUrl: z.string().describe('URL of the LinkedIn post'),
          reactionType: z.enum(['like', 'celebrate', 'support', 'insightful', 'funny']).optional().default('like').describe('Type of reaction'),
        }),
        execute: async (inputs) => runLinkedInTask(ctx, taskIds.reactToPost!, inputs),
      }),
    },
    linkedin_comment_on_post: {
      taskId: taskIds.commentOnPost,
      def: tool({
        description: 'Comment on a LinkedIn post.',
        inputSchema: z.object({
          postUrl: z.string().describe('URL of the LinkedIn post'),
          comment: z.string().describe('Comment text'),
        }),
        execute: async (inputs) => runLinkedInTask(ctx, taskIds.commentOnPost!, inputs),
      }),
    },
    linkedin_get_feed: {
      taskId: taskIds.getFeed,
      def: tool({
        description: 'Get recent posts from the user\'s LinkedIn feed.',
        inputSchema: z.object({ maxResults: z.number().optional().default(10).describe('Number of posts to fetch') }),
        execute: async (inputs) => runLinkedInTask(ctx, taskIds.getFeed!, inputs),
      }),
    },
    linkedin_get_notifications: {
      taskId: taskIds.getNotifications,
      def: tool({
        description: 'Get recent LinkedIn notifications.',
        inputSchema: z.object({ maxResults: z.number().optional().default(10).describe('Number of notifications to fetch') }),
        execute: async (inputs) => runLinkedInTask(ctx, taskIds.getNotifications!, inputs),
      }),
    },
  };

  for (const [name, { taskId, def }] of Object.entries(linkedInTools)) {
    if (taskId) {
      tools[name] = def;
    }
  }

  return tools;
}
