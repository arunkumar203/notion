import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Metadata endpoints disabled. Return 410 so callers won't hang.
export async function GET() {
  return NextResponse.json({ error: 'Metadata disabled' }, { status: 410 });
}

export async function PATCH() {
  return NextResponse.json({ error: 'Metadata disabled' }, { status: 410 });
}
