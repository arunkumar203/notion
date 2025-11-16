import { NextResponse } from 'next/server';
import admin from '@/lib/firebase-admin';

const jsonError = (status: number, message: string) => NextResponse.json({ error: message }, { status });

// Public endpoint to check if email sending is enabled (no auth required)
export async function GET() {
  try {
    // Get admin settings from RTDB
    const settingsRef = admin.database().ref('adminSettings');
    const settingsSnapshot = await settingsRef.once('value');
    const rawSettings = settingsSnapshot.exists() ? settingsSnapshot.val() : {};

    const emailSendingEnabled = rawSettings?.emailSendingEnabled ?? true; // Default to enabled
    const showCreatorAttribution = rawSettings?.showCreatorAttribution ?? true; // Default to enabled
    const homePageMessage = rawSettings?.homePageMessage ?? ''; // Default to empty

    return NextResponse.json({ emailSendingEnabled, showCreatorAttribution, homePageMessage });
    
  } catch (error) {
    console.error('Error fetching email settings:', error);
    return jsonError(500, 'Failed to fetch email settings');
  }
}

export const dynamic = 'force-dynamic';
