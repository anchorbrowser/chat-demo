# LinkedIn Automation Agent - Anchorbrowser Demo

An AI-powered chat agent that automates LinkedIn tasks using [Anchorbrowser](https://anchorbrowser.io). Built with Next.js 16, Vercel AI SDK, and shadcn/ui.

## Features

- **Chat-first experience** - Tell the agent what you want to do on LinkedIn in natural language
- **Identity management** - Connect your LinkedIn account through Anchorbrowser's secure identity system
- **10 pre-built LinkedIn tools** - Search people, send messages, create posts, and more
- **AI fallback** - For tasks without a dedicated tool, the agent uses AI browser automation
- **Live browser view** - Watch the browser work in real-time (hidden by default)
- **Single model setup** - Uses Anthropic Claude Sonnet 4 by default
- **Background processing** - AI continues working even if you switch chats or close the tab
- **Realtime sync** - Ably WebSockets push live updates to the UI as tools execute

## Architecture

```
User <-> Next.js Chat UI <-> Vercel AI SDK (tool calling)
              |                       |
         Ably WebSocket        Anchorbrowser SDK
         (realtime sync)              |
                         +---------+-----+------+---------+
                         |         |            |         |
                     Identities  Sessions   Tasks    AI Fallback
                     (LinkedIn    (Browser   (Pre-     (perform-
                      accounts)    pods)     built)    web-task)
```

## Tech Stack

- **Next.js 16** - App Router, API routes, `after()` for background processing
- **Vercel AI SDK v6** - Chat streaming, tool calling
- **PostgreSQL** - Chat persistence via Prisma ORM
- **Ably** - Realtime WebSocket layer for live chat updates
- **shadcn/ui** - UI components
- **Anchorbrowser SDK** - Browser automation API
- **WorkOS AuthKit** - Authentication (Google/Microsoft/Email)
- **TailwindCSS v4** - Styling

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Start PostgreSQL

```bash
docker compose up -d
```

### 3. Configure environment

```bash
cp .env.example .env.local
```

Fill in the values (see `.env.example` for the full template):

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_APP_URL` | Public app URL (local dev: `http://localhost:3000`) |
| `DATABASE_URL` | PostgreSQL connection string (default provided for Docker) |
| `ABLY_API_KEY` | Ably API key ([ably.com](https://ably.com) - free tier works) |
| `ANCHORBROWSER_API_KEY` | Your Anchorbrowser API key (required for dev, optional in prod) |
| `ANCHORBROWSER_API_URL` | API URL (default: `https://api.anchorbrowser.io`) |
| `ANCHORBROWSER_DASHBOARD_API_URL` | Dashboard API URL (default: `https://app.anchorbrowser.io`) |
| `WORKOS_CLIENT_ID` | WorkOS client ID |
| `WORKOS_API_KEY` | WorkOS API key |
| `WORKOS_COOKIE_PASSWORD` | Random 32+ char string for session encryption |
| `NEXT_PUBLIC_WORKOS_REDIRECT_URI` | Must match WorkOS redirect (e.g. `http://localhost:3000/auth/callback`) |
| `ANTHROPIC_API_KEY` | Anthropic API key (default chat model) |
| `OPENAI_API_KEY` | Optional; use if you switch the app to an OpenAI model |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Optional; use if you switch the app to Gemini |
| `TASK_ID_LINKEDIN_*` | Task IDs for each LinkedIn tool (see below) |

### 4. Initialize the database

```bash
npx prisma generate
npx prisma migrate dev
```

### 5. Create LinkedIn Tasks in Anchorbrowser

Create 10 tasks in your Anchorbrowser dashboard. Each task is a browser automation script that performs a specific LinkedIn action.

| Task | Name | Input Schema |
|------|------|--------------|
| Search People | `linkedin-search-people` | `{ query: string, filters?: { title?, location?, company?, connectionDegree? }, maxResults?: number }` |
| View Profile | `linkedin-view-profile` | `{ profileUrl: string }` |
| Send Connection Request | `linkedin-send-connection-request` | `{ profileUrl: string, note?: string }` |
| Send Message | `linkedin-send-message` | `{ profileUrl: string, message: string }` |
| Search Jobs | `linkedin-search-jobs` | `{ query: string, filters?: { location?, remote?, experienceLevel?, datePosted? }, maxResults?: number }` |
| Create Post | `linkedin-create-post` | `{ content: string }` |
| React to Post | `linkedin-react-to-post` | `{ postUrl: string, reactionType?: "like" \| "celebrate" \| "support" \| "insightful" \| "funny" }` |
| Comment on Post | `linkedin-comment-on-post` | `{ postUrl: string, comment: string }` |
| Get Feed | `linkedin-get-feed` | `{ maxResults?: number }` |
| Get Notifications | `linkedin-get-notifications` | `{ maxResults?: number }` |

After creating each task, copy its ID into the corresponding `TASK_ID_LINKEDIN_*` env var.

### 6. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How It Works

1. **User sends a message** - e.g., "Find 5 senior React developers in San Francisco"
2. **Agent checks identity** - Calls `list_linkedin_identities` to see if the user has a connected LinkedIn account
3. **Identity flow** - If no identity exists, generates a popup link for the user to connect their LinkedIn
4. **Background processing** - The API returns immediately; AI runs via `after()` in the serverless function
5. **Realtime updates** - Each tool call, result, and text delta is broadcast via Ably WebSocket
6. **Persistence** - Tool results are saved to PostgreSQL after each step, so navigating away preserves state
7. **Reconnection** - Returning to a chat loads history from DB and reconnects to the Ably channel for live updates

## Syncing from a remote copy

If you iterate on a VPS (for example after uploading a tarball), avoid copying thousands of files with recursive `scp`. Archive on the server, download one file, extract, then merge into this repo.

**On the server** (from the parent of the project directory):

```bash
tar czf chat-demo-sync.tar.gz my-project-folder
```

**On your machine**, copy the archive down, extract somewhere temporary, then rsync into this clone (keeps `.git`, local `.env.local`, and SSH keys out of the way):

```bash
rsync -av --delete \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude '.next/' \
  --exclude '.env' \
  --exclude '.env.local' \
  --exclude '._*' \
  --exclude 'data/' \
  --exclude '*.pem' \
  /path/to/extracted/my-project-folder/ \
  /path/to/chat-demo/
```

Then run `npm install` and `npx prisma generate` if `package-lock.json` or the Prisma schema changed. Commit from this repository as usual.

## License

MIT
