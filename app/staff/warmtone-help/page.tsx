import { StaffNav } from '@/components/staff-nav';
import { getManualMeta } from '@/lib/warmtone-manual/retrieve';
import { WarmtoneHelpClient } from './WarmtoneHelpClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'WarmTone Help — NORP Staff',
  description: 'Viryl WarmTone MK1 shop-floor assistant for New Orleans Record Press.',
};

export default function WarmtoneHelpPage() {
  const manual = getManualMeta();
  return (
    <div style={{ background: '#0d0f12', minHeight: '100vh' }}>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800&family=Space+Mono&display=swap"
      />
      <StaffNav activeHref="/staff/warmtone-help" />
      <WarmtoneHelpClient
        configured={Boolean(process.env.ANTHROPIC_API_KEY)}
        manualLabel={`${manual.docId} Rev ${manual.revision} · ${manual.pageCount} pages`}
      />
    </div>
  );
}
