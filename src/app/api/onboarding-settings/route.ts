import { NextResponse } from 'next/server';
import admin from '@/lib/firebase-admin';

const jsonError = (status: number, message: string) => NextResponse.json({ error: message }, { status });

// Get onboarding settings (public endpoint)
export async function GET() {
  try {
    // Get onboarding settings from RTDB (no auth required for this specific setting)
    const settingsRef = admin.database().ref('adminSettings/onboardingMandatory');
    const settingsSnapshot = await settingsRef.once('value');
    const onboardingMandatory = settingsSnapshot.exists() ? settingsSnapshot.val() : false;

    return NextResponse.json({ 
      onboardingMandatory: Boolean(onboardingMandatory)
    });

  } catch (error) {
    console.error('Onboarding settings API error:', error);
    return jsonError(500, 'Internal server error');
  }
}

export const dynamic = 'force-dynamic';