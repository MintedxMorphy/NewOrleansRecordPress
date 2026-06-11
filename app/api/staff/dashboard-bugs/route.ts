import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

const MAX_ATTACHMENT_BYTES = 18 * 1024 * 1024;
const MAX_ATTACHMENTS = 8;

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'neworleansrecordpress@gmail.com',
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeFilename(value: string) {
  return value.replace(/[^\w.\- ()]/g, '_').slice(0, 140) || 'dashboard-bug-attachment';
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.GMAIL_APP_PASSWORD) {
      return NextResponse.json({ error: 'Bug report email is not configured' }, { status: 500 });
    }

    const form = await req.formData();
    const message = String(form.get('message') || '').trim();
    const pageUrl = String(form.get('page_url') || '/staff/dashboard');
    const userAgent = String(form.get('user_agent') || '');
    const files = form
      .getAll('attachments')
      .filter((item): item is File => item instanceof File && item.size > 0)
      .slice(0, MAX_ATTACHMENTS);

    if (!message && files.length === 0) {
      return NextResponse.json({ error: 'Add a note or attachment first' }, { status: 400 });
    }

    const totalAttachmentBytes = files.reduce((total, file) => total + file.size, 0);
    if (totalAttachmentBytes > MAX_ATTACHMENT_BYTES) {
      return NextResponse.json({ error: 'Attachments are too large. Please keep bug uploads under 18 MB total.' }, { status: 413 });
    }

    const attachments = await Promise.all(files.map(async file => ({
      filename: safeFilename(file.name),
      content: Buffer.from(await file.arrayBuffer()),
      contentType: file.type || undefined,
    })));

    const submittedAt = new Date().toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'America/Chicago',
    });

    await transporter.sendMail({
      from: 'neworleansrecordpress@gmail.com',
      to: 'gregory@neworleansrecordpress.com',
      subject: 'Production Dashboard Bug Report',
      html: `
        <div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.45;color:#111">
          <h2 style="margin:0 0 16px">Production Dashboard Bug Report</h2>
          <p style="white-space:pre-wrap">${escapeHtml(message || '(No written note provided)')}</p>
          <hr style="border:none;border-top:1px solid #ddd;margin:18px 0" />
          <p><strong>Page:</strong> ${escapeHtml(pageUrl)}</p>
          <p><strong>Submitted:</strong> ${escapeHtml(submittedAt)}</p>
          <p><strong>Attachments:</strong> ${attachments.length}</p>
          <p style="color:#666;font-size:12px"><strong>Browser:</strong> ${escapeHtml(userAgent)}</p>
        </div>
      `,
      text: [
        'Production Dashboard Bug Report',
        '',
        message || '(No written note provided)',
        '',
        `Page: ${pageUrl}`,
        `Submitted: ${submittedAt}`,
        `Attachments: ${attachments.length}`,
        `Browser: ${userAgent}`,
      ].join('\n'),
      attachments,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Dashboard bug report error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to send bug report' }, { status: 500 });
  }
}
