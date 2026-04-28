import { NextResponse } from 'next/server';
export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? 'NOT SET';
  const hasSecret = !!process.env.GOOGLE_CLIENT_SECRET;
  const hasRefresh = !!process.env.GOOGLE_REFRESH_TOKEN;
  const hasPersonal = !!process.env.GOOGLE_PERSONAL_REFRESH_TOKEN;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? 'NOT SET';
  return NextResponse.json({ 
    clientId: clientId.slice(0,40)+'...', 
    hasSecret, hasRefresh, hasPersonal, redirectUri 
  });
}
