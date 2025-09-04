import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const response = NextResponse.json(
      { status: 'success', message: 'Logged out successfully' },
      { status: 200 }
    );

    // Clear the session cookie
    response.cookies.set({
      name: 'session',
      value: '',
      maxAge: -1, // Expire immediately
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Error during logout:', error);
    return NextResponse.json(
      { error: 'Failed to log out' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';
