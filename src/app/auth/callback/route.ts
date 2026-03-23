import { handleAuth } from '@workos-inc/authkit-nextjs';
import { NextResponse } from 'next/server';

export const GET = handleAuth({
  onError: ({ request }) => {
    return NextResponse.redirect(new URL('/', request.url));
  },
});
