import { NextResponse } from 'next/server';

const QBO_AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2';
const SCOPES = 'com.intuit.quickbooks.accounting';

export async function GET() {
  const params = new URLSearchParams({
    client_id: process.env.QBO_CLIENT_ID!,
    redirect_uri: 'https://www.nolavinyl.com/api/qbo/callback',
    response_type: 'code',
    scope: SCOPES,
    state: 'norp-dashboard',
  });

  return NextResponse.redirect(`${QBO_AUTH_URL}?${params.toString()}`);
}
