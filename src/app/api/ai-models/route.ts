import { NextResponse } from 'next/server';
import admin from '@/lib/firebase-admin';

/**
 * GET /api/ai-models
 * Public endpoint to get the configured AI model names
 */
export async function GET() {
    try {
        const settingsRef = admin.database().ref('adminSettings');
        const snapshot = await settingsRef.once('value');
        const settings = snapshot.val() || {};

        return NextResponse.json({
            flashModel: settings.aiFlashModel || 'gemini-2.5-flash',
            proModel: settings.aiProModel || 'gemini-2.5-pro',
        });
    } catch (error) {
        console.error('Error fetching AI models:', error);
        return NextResponse.json({
            flashModel: 'gemini-2.5-flash',
            proModel: 'gemini-2.5-pro',
        });
    }
}

export const dynamic = 'force-dynamic';
