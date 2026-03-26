import { tool, type Tool } from 'ai';
import { z } from 'zod';
import {
  listUserIdentities,
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

interface ToolContext {
  userId: string;
  conversationId: string;
}

function getAppBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}

async function ensureSession(ctx: ToolContext): Promise<{ sessionId: string; liveViewUrl: string }> {
  const conversation = await getConversation(ctx.conversationId, ctx.userId);
  if (!conversation) throw new Error('Conversation not found');

  if (conversation.sessionId) {
    const session = await getSession(conversation.sessionId);
    if (session) {
      return { sessionId: conversation.sessionId, liveViewUrl: conversation.liveViewUrl ?? '' };
    }
  }

  if (!conversation.identityId) {
    throw new Error('NO_IDENTITY');
  }

  const session = await createSession(conversation.identityId);
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
  return runTask(taskId, sessionId, inputs);
}

export function createTools(ctx: ToolContext) {
  const taskIds = getTaskIds();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: Record<string, Tool<any, any>> = {
    list_linkedin_identities: tool({
      description:
        'List the user\'s existing LinkedIn identities. Call this first when the user wants to do anything on LinkedIn to check if they already have a connected account.',
      inputSchema: z.object({}),
      execute: async () => {
        const identities = await listUserIdentities(ctx.userId);

        const mappedIdentities = identities.map((id) => ({
          id: id.id ?? '',
          name: id.name ?? 'Unknown',
          status: id.status ?? 'unknown',
        }));

        // Always generate a connect URL so the user can add a new account
        let connectUrl: string | undefined;
        try {
          const callbackUrl = `${getAppBaseUrl()}/api/identity-callback/${ctx.conversationId}`;
          const tokenData = await createIdentityToken(callbackUrl);
          const token = tokenData?.token;
          if (token) {
            connectUrl = getIdentityCreationUrl(token);
          }
        } catch (err) {
          console.error('[list_linkedin_identities] createIdentityToken failed:', err);
        }

        const hasActiveIdentity = identities.some(
          (id) => id.status?.toLowerCase() === 'validated'
        );

        if (identities.length === 0 || !hasActiveIdentity) {
          return {
            identities: mappedIdentities,
            requiresIdentityConnection: true,
            connectUrl,
            message: identities.length === 0
              ? (connectUrl ? 'No LinkedIn identity connected. Use the connection link.' : 'No LinkedIn identity connected.')
              : (connectUrl ? 'Existing identities have connection issues. Use the connection link to add a new one, or select an existing identity.' : 'Existing identities have connection issues.'),
          };
        }

        return { identities: mappedIdentities, connectUrl };
      },
    }),

    select_identity: tool({
      description:
        'Select a LinkedIn identity for this chat session. Call this after listing identities and the user chooses one, or when there is only one identity available.',
      inputSchema: z.object({
        identityId: z.string().describe('The identity ID to use for this session'),
      }),
      execute: async ({ identityId }) => {
        await updateConversation(ctx.conversationId, ctx.userId, { identityId });
        try {
          const session = await createSession(identityId);
          if (!session?.id) throw new Error('Session creation returned no ID');
          await updateConversation(ctx.conversationId, ctx.userId, {
            sessionId: session.id,
            liveViewUrl: session.live_view_url ?? null,
          });
          return {
            success: true,
            message: 'Identity selected and browser session created. Ready to automate LinkedIn.',
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
        'Return a direct link for the user to connect their LinkedIn account. Call this when the user has no identities or wants to add a new one.',
      inputSchema: z.object({
        userName: z.string().optional().describe('Optional display name for the identity'),
      }),
      execute: async ({ userName }) => {
        const callbackUrl = `${getAppBaseUrl()}/api/identity-callback/${ctx.conversationId}`;
        const tokenData = await createIdentityToken(callbackUrl);
        const token = tokenData?.token;
        if (!token) throw new Error('Failed to generate identity token');
        const url = getIdentityCreationUrl(token, userName);
        return {
          url,
          message: 'Use this link to connect your LinkedIn account.',
        };
      },
    }),

    perform_web_task: tool({
      description:
        'FALLBACK ONLY: Use AI to perform a browser automation task on LinkedIn when no specific tool exists. This uses an AI agent to control the browser, which can take longer and is less reliable. Always warn the user that this is an AI-driven action that may take some time.',
      inputSchema: z.object({
        prompt: z.string().describe('Description of the task for the AI to perform on LinkedIn'),
        url: z.string().optional().describe('Optional starting URL'),
      }),
      execute: async ({ prompt, url }) => {
        const { sessionId } = await ensureSession(ctx);
        return performWebTask(sessionId, prompt, url);
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

  // Only include LinkedIn tools that have their task ID configured
  for (const [name, { taskId, def }] of Object.entries(linkedInTools)) {
    if (taskId) {
      tools[name] = def;
    }
  }

  return tools;
}
