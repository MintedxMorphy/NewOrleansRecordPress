import { google } from 'googleapis';
import { JWT, OAuth2Client } from 'google-auth-library';

/**
 * Central auth module for Google APIs.
 * Supports two auth modes:
 * 1. Service Account JWT with Domain-Wide Delegation (for workspace inboxes + shared Drive)
 * 2. OAuth2 refresh token (fallback for gregory@ only, or for personal gmail sheets)
 */

// Returns a JWT client impersonating `subject` using the service account
// Requires GOOGLE_SERVICE_ACCOUNT_KEY env var (base64-encoded JSON key)
export function getServiceAccountAuth(subject: string): JWT {
  const keyJson = Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!, 'base64').toString('utf-8');
  const key = JSON.parse(keyJson);
  return new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/spreadsheets',
    ],
    subject, // impersonate this workspace user
  });
}

// Returns OAuth2 client using refresh token
// For personal gmail account sheets (neworleansrecordpress@gmail.com)
// or fallback when service account not configured
export function getOAuth2Auth(refreshToken?: string): OAuth2Client {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_REDIRECT_URI!,
  );
  oauth2.setCredentials({
    refresh_token: refreshToken ?? process.env.GOOGLE_REFRESH_TOKEN!
  });
  return oauth2;
}

// Returns auth for personal gmail drive/sheets (neworleansrecordpress@gmail.com)
// Uses GOOGLE_PERSONAL_REFRESH_TOKEN if set, otherwise GOOGLE_REFRESH_TOKEN
export function getPersonalGmailAuth(): OAuth2Client {
  return getOAuth2Auth(process.env.GOOGLE_PERSONAL_REFRESH_TOKEN ?? process.env.GOOGLE_REFRESH_TOKEN);
}

// Check if service account is configured
export function hasServiceAccount(): boolean {
  return !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
}

// Get auth for a specific workspace email (uses DWD if available, fallback to oauth)
export function getWorkspaceAuth(email: string): JWT | OAuth2Client {
  if (hasServiceAccount()) {
    return getServiceAccountAuth(email);
  }
  // Fallback: only gregory@ works with existing OAuth token
  return getOAuth2Auth();
}
