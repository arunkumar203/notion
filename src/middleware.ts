import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// This runs on the Edge Runtime
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public (public assets)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|_next/webpack-hmr|public).*)',
  ],
};

// List of paths that don't require authentication
const publicPaths = [
  '/_next',
  '/favicon.ico',
  '/public',
  '/_vercel',
  '/auth',
  '/about',
  '/',  // Home page is public
  '/share', // Public share links
  '/verify-email', // Email verification page
];

// List of API paths that don't require authentication (very limited)
const publicApiPaths = [
  '/api/auth/session',
  '/api/auth/signout',
  '/api/auth/manual-verify',
  '/api/share', // Public share access
  '/api/admin/email-settings', // Public settings for home page
  '/api/onboarding-settings', // Public onboarding settings
  '/api/signup-settings', // Public signup settings
  '/api/ai-models', // Public AI model configuration
];

// List of admin-only paths
const adminPaths = ['/admin'];

// List of auth pages that should redirect to /notebooks if user is logged in and verified
const authPaths = ['/login', '/signup'];

export async function middleware(request: NextRequest) {
  const { pathname, origin } = request.nextUrl;

  // Allow all static assets (files with an extension) to pass through without auth checks
  // This prevents redirects for images, icons, fonts, etc., which can break pages during load
  if (/\.[^/]+$/.test(pathname)) {
    const res = NextResponse.next();
    res.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    return res;
  }

  // Check if current path is public
  const isPublicPath = publicPaths.some(path =>
    pathname === path || pathname.startsWith(`${path}/`)
  );

  // Check if API path is public (very restrictive)
  const isPublicApiPath = pathname.startsWith('/api/') && publicApiPaths.some(path =>
    pathname === path || pathname.startsWith(`${path}/`)
  );

  // Check if current path is an auth page
  const isAuthPath = authPaths.some(path => pathname === path);

  // Check if current path is an admin page
  const isAdminPath = adminPaths.some(path => pathname.startsWith(path));

  // Get session cookie
  const session = request.cookies.get('session')?.value;
  const hasValidSession = !!session;

  // debug line removed

  // If user is authenticated and trying to access auth pages, redirect to /workspaces
  if (hasValidSession && isAuthPath) {
    // debug line removed
    const url = new URL('/workspaces', origin);
    const response = NextResponse.redirect(url);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }

  // Allow access to auth pages when not authenticated
  if (!hasValidSession && isAuthPath) {
    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }

  // Allow access to public paths and public API paths
  if (isPublicPath || isPublicApiPath) {
    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }

  // If no session and trying to access protected route (not auth or public), redirect to login
  if (!hasValidSession) {
    // debug line removed
    const url = new URL('/login', origin);
    const response = NextResponse.redirect(url);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }

  // For admin paths, we'll let the component handle role checking
  // since we can't easily verify roles in middleware without additional API calls
  if (isAdminPath) {
    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }

  // For all other cases, continue with the request
  const response = NextResponse.next();
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
