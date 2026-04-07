import { handleAuth } from '@workos-inc/authkit-nextjs';
import { NextResponse } from 'next/server';

const baseURL = process.env.NEXT_PUBLIC_APP_URL;

export const GET = handleAuth({
  baseURL,
  onError: ({ request }) => {
    const url = baseURL ?? request.url;
    return NextResponse.redirect(new URL('/', url));
  },
});
