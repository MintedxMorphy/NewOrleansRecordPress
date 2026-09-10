'use client';

import { FormEvent, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

type Citation = {
  page: number;
  heading: string;
  snippet: string;
};

type WebSource = {
  title: string;
  url: string;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  webSources?: WebSource[];
  fallback?: boolean;
};

const SUGGESTIONS = [
  'Fault 1105 pre-plasticizer 24V missing',
  'How do I change stampers?',
  'Edge trimmer is not cycling',
  'HMI is stuck on the start screen',
  'Platens are not heating / no steam',
];

function formatAnswer(text: string) {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const withBreaks = escaped.replace(/\n/g, '<br/>');
  return withBreaks.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

export function WarmtoneHelpClient() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [manualLabel, setManualLabel] = useState('MAN-00016 Rev 3.00');
  const [configured, setConfigured] = useState<boolean | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/staff/warmtone-help')
      .then((res) => res.json())
      .then((data) => {
        if (data?.manual?.docId) {
          setManualLabel(`${data.manual.docId} Rev ${data.manual.revision} · ${data.manual.pageCount} pages`);
        }
        if (typeof data?.configured === 'boolean') setConfigured(data.configured);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  const canSend = useMemo(() => input.trim().length > 0 && !busy, [input, busy]);

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || busy) return;

    const userMessage: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: trimmed,
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput('');
    setError('');
    setBusy(true);

    try {
      const response = await fetch('/api/staff/warmtone-help', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok && !data?.answer) {
        throw new Error(data?.error || 'Could not reach WarmTone Help');
      }
      setMessages((current) => [
        ...current,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: data.answer || data.error || 'No answer returned.',
          citations: data.citations || [],
          webSources: data.webSources || [],
          fallback: Boolean(data.fallback),
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void ask(input);
  }

  return (
    <main style={S.main}>
      <header style={S.header}>
        <div>
          <div style={S.kicker}>Viryl WarmTone MK1 · PRS00007</div>
          <h1 style={S.title}>WarmTone Help</h1>
          <p style={S.subtitle}>
            Shop-floor tech support from the owners manual. Web results are only used when the book is thin.
          </p>
        </div>
        <div style={S.meta}>{manualLabel}</div>
      </header>

      {configured === false && (
        <div style={S.banner}>
          Claude is not configured in this environment, so answers will show matching manual pages until `ANTHROPIC_API_KEY` is set on Vercel.
        </div>
      )}

      {messages.length === 0 && (
        <div style={S.empty}>
          <p style={S.emptyLead}>Ask about a fault code, HMI screen, stamper change, trimmer, hydraulics, or steam.</p>
          <div style={S.chips}>
            {SUGGESTIONS.map((suggestion) => (
              <button key={suggestion} type="button" style={S.chip} onClick={() => void ask(suggestion)}>
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={S.thread}>
        {messages.map((message) => (
          <article
            key={message.id}
            style={message.role === 'user' ? S.userBubble : S.assistantBubble}
          >
            <div style={S.role}>{message.role === 'user' ? 'You' : 'WarmTone Help'}</div>
            {message.role === 'assistant' ? (
              <div style={S.answer} dangerouslySetInnerHTML={{ __html: formatAnswer(message.content) }} />
            ) : (
              <div style={S.answer}>{message.content}</div>
            )}
            {message.fallback && (
              <div style={S.fallbackNote}>Showing manual excerpts because the assistant model was unavailable.</div>
            )}
            {message.citations && message.citations.length > 0 && (
              <div style={S.citeRow}>
                {message.citations.map((cite) => (
                  <span key={`${message.id}-${cite.page}`} style={S.cite} title={cite.snippet}>
                    p. {cite.page}
                    {cite.heading ? ` · ${cite.heading}` : ''}
                  </span>
                ))}
              </div>
            )}
            {message.webSources && message.webSources.length > 0 && (
              <div style={S.webBox}>
                <div style={S.webLabel}>From the field (unofficial)</div>
                {message.webSources.map((source) => (
                  <a key={source.url} href={source.url} target="_blank" rel="noreferrer" style={S.webLink}>
                    {source.title}
                  </a>
                ))}
              </div>
            )}
          </article>
        ))}
        {busy && <div style={S.thinking}>Looking through the WarmTone manual…</div>}
        <div ref={bottomRef} />
      </div>

      {error && <div style={S.error}>{error}</div>}

      <form onSubmit={onSubmit} style={S.form}>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="What’s happening on the WarmTone?"
          rows={3}
          style={S.input}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void ask(input);
            }
          }}
        />
        <button type="submit" disabled={!canSend} style={{ ...S.send, opacity: canSend ? 1 : 0.55 }}>
          {busy ? 'Working…' : 'Ask'}
        </button>
      </form>
      <p style={S.disclaimer}>
        Internal NORP tool. The paper manual wins on safety. For uncleared faults call Viryl 1-844-468-4795.
        This page does nothing until someone asks a question.
      </p>
    </main>
  );
}

const S: Record<string, CSSProperties> = {
  main: {
    maxWidth: 880,
    margin: '0 auto',
    padding: '28px 20px 48px',
    color: '#e4e2d8',
    fontFamily: 'DM Sans, sans-serif',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 20,
    alignItems: 'flex-start',
    marginBottom: 22,
  },
  kicker: {
    fontFamily: 'Space Mono, ui-monospace, monospace',
    fontSize: 11,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#5DCAA5',
    marginBottom: 8,
  },
  title: {
    fontSize: 34,
    fontWeight: 800,
    letterSpacing: -0.8,
    color: '#f5f3e8',
    margin: 0,
  },
  subtitle: {
    margin: '8px 0 0',
    color: '#8a8878',
    fontSize: 15,
    lineHeight: 1.45,
    maxWidth: 520,
  },
  meta: {
    fontFamily: 'Space Mono, ui-monospace, monospace',
    fontSize: 12,
    color: '#6a6858',
    textAlign: 'right',
    paddingTop: 8,
  },
  banner: {
    background: '#1a1500',
    border: '1px solid #5a4a00',
    color: '#f5e6a8',
    borderRadius: 10,
    padding: '12px 14px',
    marginBottom: 16,
    fontSize: 14,
    lineHeight: 1.45,
  },
  empty: {
    background: '#14161b',
    border: '1px solid #2a2c33',
    borderRadius: 14,
    padding: 22,
    marginBottom: 18,
  },
  emptyLead: { margin: '0 0 14px', color: '#c4c2b8', lineHeight: 1.5 },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  chip: {
    appearance: 'none',
    background: '#0a1a15',
    border: '1px solid #1f7d5b',
    color: '#5DCAA5',
    borderRadius: 999,
    padding: '8px 12px',
    font: 'inherit',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  },
  thread: { display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 },
  userBubble: {
    alignSelf: 'flex-end',
    background: '#0a1a15',
    border: '1px solid #1f7d5b',
    borderRadius: 14,
    padding: '12px 14px',
    maxWidth: '92%',
  },
  assistantBubble: {
    alignSelf: 'stretch',
    background: '#14161b',
    border: '1px solid #2a2c33',
    borderRadius: 14,
    padding: '14px 16px',
  },
  role: {
    fontFamily: 'Space Mono, ui-monospace, monospace',
    fontSize: 11,
    color: '#6a6858',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: 8,
  },
  answer: { lineHeight: 1.55, fontSize: 15, color: '#e4e2d8' },
  fallbackNote: {
    marginTop: 10,
    color: '#F2A623',
    fontSize: 12,
    fontFamily: 'Space Mono, ui-monospace, monospace',
  },
  citeRow: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  cite: {
    background: '#1a1d24',
    border: '1px solid #2a2c33',
    borderRadius: 999,
    padding: '4px 8px',
    fontSize: 11,
    color: '#9cc9f2',
    fontFamily: 'Space Mono, ui-monospace, monospace',
    maxWidth: 280,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  webBox: {
    marginTop: 12,
    paddingTop: 10,
    borderTop: '1px solid #2a2c33',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  webLabel: {
    fontFamily: 'Space Mono, ui-monospace, monospace',
    fontSize: 11,
    color: '#F2A623',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  webLink: { color: '#5DCAA5', fontSize: 13 },
  thinking: {
    color: '#8a8878',
    fontFamily: 'Space Mono, ui-monospace, monospace',
    fontSize: 12,
  },
  error: { color: '#ff8b7a', marginBottom: 10, fontSize: 14 },
  form: { display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'end' },
  input: {
    width: '100%',
    background: '#1a1d24',
    border: '1px solid #2a2c33',
    borderRadius: 10,
    color: '#e4e2d8',
    font: 'inherit',
    padding: '12px 14px',
    resize: 'vertical',
  },
  send: {
    background: '#5DCAA5',
    color: '#07100d',
    border: 0,
    borderRadius: 10,
    padding: '12px 18px',
    font: 'inherit',
    fontWeight: 800,
    cursor: 'pointer',
    minHeight: 48,
  },
  disclaimer: {
    marginTop: 14,
    color: '#6a6858',
    fontSize: 12,
    lineHeight: 1.45,
    fontFamily: 'Space Mono, ui-monospace, monospace',
  },
};
