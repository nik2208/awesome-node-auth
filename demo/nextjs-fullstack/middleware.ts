/**
 * Next.js Edge Middleware — protects /dashboard and other authenticated routes.
 *
 * Reads the HttpOnly accessToken cookie and verifies it with the Web Crypto API
 * (Node.js `crypto` / `jsonwebtoken` are not available in the Edge Runtime).
 */

import { NextRequest, NextResponse } from 'next/server';

export const config = {
  matcher: ['/dashboard/:path*'],
};

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get('accessToken')?.value;

  if (!token) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  try {
    const [headerB64, payloadB64, signatureB64] = token.split('.');
    const enc  = new TextEncoder();
    const key  = await crypto.subtle.importKey(
      'raw',
      enc.encode(process.env.ACCESS_TOKEN_SECRET ?? 'demo-access-secret-change-in-production'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const sig  = Uint8Array.from(
      atob(signatureB64.replace(/-/g, '+').replace(/_/g, '/')),
      c => c.charCodeAt(0),
    );
    const valid = await crypto.subtle.verify('HMAC', key, sig, enc.encode(`${headerB64}.${payloadB64}`));
    if (!valid) throw new Error('Invalid signature');
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL('/', request.url));
  }
}
