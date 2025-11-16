import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import admin, { auth as adminAuth } from '@/lib/firebase-admin';

const jsonError = (status: number, message: string) => NextResponse.json({ error: message }, { status });

// Get admin settings
export async function GET() {
  try {
    if (!adminAuth) {
      return jsonError(500, 'Authentication service not available');
    }

    const cookieStore = await cookies();
    const session = cookieStore.get('session')?.value;

    if (!session) {
      return jsonError(401, 'Not authenticated');
    }

    let decoded: any;
    try {
      decoded = await adminAuth.verifySessionCookie(session, true);
    } catch {
      return jsonError(401, 'Invalid session');
    }

    const adminUid = decoded?.uid as string;

    if (!adminUid) {
      return jsonError(401, 'Admin not authenticated');
    }

    // Verify admin has admin or root_admin role
    const adminRoleSnapshot = await admin.database().ref(`users/${adminUid}/role`).once('value');
    const adminRole = adminRoleSnapshot.val();

    if (adminRole !== 'root_admin' && adminRole !== 'admin') {
      return jsonError(403, 'Only admins can access settings');
    }

    try {
      // Get admin settings from RTDB
      const settingsRef = admin.database().ref('adminSettings');
      const settingsSnapshot = await settingsRef.once('value');
      const rawSettings = settingsSnapshot.exists() ? settingsSnapshot.val() : {};

      const settings = {
        emailSendingEnabled: rawSettings?.emailSendingEnabled ?? true,
        showCreatorAttribution: rawSettings?.showCreatorAttribution ?? true,
        homePageMessage: rawSettings?.homePageMessage ?? '',
        onboardingMandatory: rawSettings?.onboardingMandatory ?? false,
        allowNewUserSignup: rawSettings?.allowNewUserSignup ?? true,
      };

      return NextResponse.json({ settings });

    } catch (error) {
      console.error('Error fetching admin settings:', error);
      return jsonError(500, 'Failed to fetch settings');
    }
  } catch (error) {
    console.error('Admin settings API error:', error);
    return jsonError(500, 'Internal server error');
  }
}

// Update admin settings
export async function POST(request: Request) {
  try {
    if (!adminAuth) {
      return jsonError(500, 'Authentication service not available');
    }

    const cookieStore = await cookies();
    const session = cookieStore.get('session')?.value;

    if (!session) {
      return jsonError(401, 'Not authenticated');
    }

    let decoded: any;
    try {
      decoded = await adminAuth.verifySessionCookie(session, true);
    } catch {
      return jsonError(401, 'Invalid session');
    }

    const adminUid = decoded?.uid as string;

    if (!adminUid) {
      return jsonError(401, 'Admin not authenticated');
    }

    // Verify admin has root_admin role
    const adminRoleSnapshot = await admin.database().ref(`users/${adminUid}/role`).once('value');
    const adminRole = adminRoleSnapshot.val();

    if (adminRole !== 'root_admin') {
      return jsonError(403, 'Only root admins can update settings');
    }

    // Get the settings from request body
    const body = await request.json().catch(() => ({}));
    const { emailSendingEnabled, showCreatorAttribution, homePageMessage, onboardingMandatory, allowNewUserSignup } = body || {};

    if (typeof emailSendingEnabled !== 'boolean' && typeof showCreatorAttribution !== 'boolean' && typeof homePageMessage !== 'string' && typeof onboardingMandatory !== 'boolean' && typeof allowNewUserSignup !== 'boolean') {
      return jsonError(400, 'At least one valid setting must be provided');
    }

    try {
      const updates: Record<string, unknown> = {
        updatedAt: Date.now(),
        updatedBy: adminUid,
      };

      if (typeof emailSendingEnabled === 'boolean') {
        updates.emailSendingEnabled = emailSendingEnabled;
      }

      if (typeof showCreatorAttribution === 'boolean') {
        updates.showCreatorAttribution = showCreatorAttribution;
      }

      if (typeof homePageMessage === 'string') {
        updates.homePageMessage = homePageMessage;
      }

      if (typeof onboardingMandatory === 'boolean') {
        updates.onboardingMandatory = onboardingMandatory;
      }

      if (typeof allowNewUserSignup === 'boolean') {
        updates.allowNewUserSignup = allowNewUserSignup;
      }

      // Update admin settings in RTDB
      await admin.database().ref('adminSettings').update(updates);

      const responseSettings: Record<string, boolean | string> = {};
      if (typeof emailSendingEnabled === 'boolean') {
        responseSettings.emailSendingEnabled = emailSendingEnabled;
      }
      if (typeof showCreatorAttribution === 'boolean') {
        responseSettings.showCreatorAttribution = showCreatorAttribution;
      }
      if (typeof homePageMessage === 'string') {
        responseSettings.homePageMessage = homePageMessage;
      }
      if (typeof onboardingMandatory === 'boolean') {
        responseSettings.onboardingMandatory = onboardingMandatory;
      }
      if (typeof allowNewUserSignup === 'boolean') {
        responseSettings.allowNewUserSignup = allowNewUserSignup;
      }

      return NextResponse.json({
        success: true,
        message: 'Settings updated successfully',
        settings: responseSettings,
      });

    } catch (error) {
      console.error('Error updating admin settings:', error);
      return jsonError(500, 'Failed to update settings');
    }
  } catch (error) {
    console.error('Admin settings update error:', error);
    return jsonError(500, 'Internal server error');
  }
}

export const dynamic = 'force-dynamic';
