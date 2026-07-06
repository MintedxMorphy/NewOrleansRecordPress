export async function extractPdfText(buffer: Buffer, maxChars = 50000): Promise<string> {
  try {
    // Dynamic require avoids Next.js build-time module evaluation.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfParse = require('pdf-parse/lib/pdf-parse');
    const data = await pdfParse(buffer);
    return String(data.text || '').slice(0, maxChars);
  } catch {
    return '';
  }
}

export async function extractUploadedFileText(file: File, maxChars = 50000): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();

  if (type.includes('pdf') || name.endsWith('.pdf')) {
    return extractPdfText(buffer, maxChars);
  }

  return buffer.toString('utf8').slice(0, maxChars);
}
