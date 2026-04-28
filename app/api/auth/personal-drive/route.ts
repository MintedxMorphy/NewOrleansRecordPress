import { NextResponse } from 'next/server';
import { google } from 'googleapis';

// Step 1: Redirect user to Google OAuth for neworleansrecordpress@gmail.com
export async function GET() {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    'https://www.nolavinyl.com/api/auth/personal-drive/callback'
  );

  const url = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // force refresh token even if previously authorized
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/drive.readonly',
    ],
    login_hint: 'neworleansrecordpress@gmail.com',
  });

  return NextResponse.redirect(url);
}
