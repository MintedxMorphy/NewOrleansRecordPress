'use client';

import { FormEvent, PointerEvent, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

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
  imageUrls?: string[];
  citations?: Citation[];
  webSources?: WebSource[];
  fallback?: boolean;
};

type PendingImage = {
  id: string;
  previewUrl: string;
  mimeType: string;
  data: string;
};

const MAX_IMAGES = 3;
const MAX_EDGE = 1280;
const MAX_BASE64_CHARS = Math.floor((1.2 * 1024 * 1024 * 4) / 3);

const SUGGESTIONS = [
  'Fault 1105 pre-plasticizer 24V missing',
  'How do I change stampers?',
  'Change 12" moulds to 7" — what settings change?',
  'Edge trimmer is not cycling',
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

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not read that image'));
    image.src = url;
  });
}

function isImageFile(file: File) {
  if (file.type.toLowerCase().startsWith('image/')) return true;
  return /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name);
}

function filesFromClipboard(data: DataTransfer | null): File[] {
  if (!data) return [];
  const fromItems = Array.from(data.items || [])
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file && isImageFile(file)));
  if (fromItems.length > 0) return fromItems;
  return Array.from(data.files || []).filter(isImageFile);
}

async function compressFile(file: File): Promise<PendingImage> {
  const type = (file.type || 'image/jpeg').toLowerCase();
  if (!isImageFile(file)) {
    throw new Error('Use a photo (JPEG, PNG, or WebP)');
  }
  const previewUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(previewUrl);
    const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not process that photo');
    ctx.drawImage(image, 0, 0, width, height);
    const mimeType = type === 'image/png' ? 'image/png' : 'image/jpeg';
    const dataUrl = canvas.toDataURL(mimeType, 0.78);
    const match = dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
    if (!match) throw new Error('Could not process that photo');
    if (match[2].length > MAX_BASE64_CHARS) {
      throw new Error('That photo is still too large. Crop it or send a screenshot.');
    }
    return {
      id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      previewUrl,
      mimeType: match[1],
      data: match[2],
    };
  } catch (error) {
    URL.revokeObjectURL(previewUrl);
    if (error instanceof Error && /could not read/i.test(error.message)) {
      throw new Error('Could not read that image. Try a screenshot or JPEG.');
    }
    throw error;
  }
}

export function WarmtoneHelpClient({
  manualLabel,
}: {
  manualLabel: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [addingPhotos, setAddingPhotos] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const askingRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingImagesRef = useRef<PendingImage[]>([]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  const canSend = useMemo(
    () => (input.trim().length > 0 || pendingImages.length > 0) && !busy && !addingPhotos,
    [input, pendingImages.length, busy, addingPhotos],
  );

  useEffect(() => {
    pendingImagesRef.current = pendingImages;
  }, [pendingImages]);

  useEffect(() => {
    return () => {
      pendingImagesRef.current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
    };
  }, []);

  async function addFiles(files: FileList | File[]) {
    const list = Array.from(files).filter(isImageFile);
    if (list.length === 0) {
      setError('Use a photo (JPEG, PNG, or WebP)');
      return;
    }
    setError('');
    setAddingPhotos(true);
    try {
      const next: PendingImage[] = [];
      for (const file of list) {
        next.push(await compressFile(file));
      }
      setPendingImages((current) => {
        const combined = [...current, ...next].slice(0, MAX_IMAGES);
        next.forEach((image) => {
          if (!combined.includes(image)) URL.revokeObjectURL(image.previewUrl);
        });
        return combined;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that photo');
    } finally {
      setAddingPhotos(false);
    }
  }

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const files = filesFromClipboard(event.clipboardData);
      if (files.length === 0) return;
      event.preventDefault();
      void addFiles(files);
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // addFiles uses functional setState; first-render closure is enough
  }, []);

  function removePending(id: string) {
    setPendingImages((current) => {
      const found = current.find((image) => image.id === id);
      if (found) URL.revokeObjectURL(found.previewUrl);
      return current.filter((image) => image.id !== id);
    });
  }

  async function ask(question: string) {
    const trimmed = question.trim();
    const images = pendingImages;
    if ((!trimmed && images.length === 0) || busy || askingRef.current) return;
    askingRef.current = true;

    const displayText = trimmed || 'What’s going on in this photo?';
    const userMessage: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: displayText,
      imageUrls: images.map((image) => image.previewUrl),
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput('');
    setPendingImages([]);
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
          images: images.map((image) => ({
            mimeType: image.mimeType,
            data: image.data,
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
      askingRef.current = false;
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void ask(input);
  }

  function onChipPointerDown(event: PointerEvent<HTMLButtonElement>, suggestion: string) {
    event.preventDefault();
    event.stopPropagation();
    setInput(suggestion);
    void ask(suggestion);
  }

  return (
    <main style={S.main}>
      <header style={S.header}>
        <div>
          <div style={S.kicker}>Viryl WarmTone MK1 · PRS00007</div>
          <h1 style={S.title}>WarmTone Help</h1>
          <p style={S.subtitle}>
            Shop-floor tech support from the owners manual. Paste a screenshot, drop a photo, or tap Photo — HMI, leak, or part.
          </p>
        </div>
        <div style={S.meta}>{manualLabel}</div>
      </header>

      {messages.length === 0 && (
        <div style={S.empty}>
          <p style={S.emptyLead}>Ask about a fault code, HMI screen, stamper change, trimmer, hydraulics, or steam — or paste / attach a photo of what you’re looking at.</p>
          <div style={S.chips}>
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                data-testid={`warmtone-chip-${suggestion.slice(0, 12)}`}
                style={S.chip}
                onPointerDown={(event) => onChipPointerDown(event, suggestion)}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setInput(suggestion);
                  void ask(suggestion);
                }}
              >
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
              <div style={S.answer}>
                {message.imageUrls && message.imageUrls.length > 0 && (
                  <div style={S.thumbRow}>
                    {message.imageUrls.map((url) => (
                      <img key={url} src={url} alt="Attached WarmTone photo" style={S.sentThumb} />
                    ))}
                  </div>
                )}
                {message.content}
              </div>
            )}
            {message.fallback && (
              <div style={S.fallbackNote}>Writer offline. Use the pages below, or call Viryl 1-844-468-4795.</div>
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

      <form
        onSubmit={onSubmit}
        style={S.formWrap}
        onDragOver={(event) => {
          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          void addFiles(event.dataTransfer.files);
        }}
      >
        {pendingImages.length > 0 && (
          <div style={S.thumbRow}>
            {pendingImages.map((image) => (
              <div key={image.id} style={S.pendingThumbWrap}>
                <img src={image.previewUrl} alt="Photo to send" style={S.pendingThumb} />
                <button type="button" style={S.removeThumb} onClick={() => removePending(image.id)} aria-label="Remove photo">
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div style={S.form}>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="What’s happening on the WarmTone? Paste a screenshot or attach a photo."
            rows={3}
            style={S.input}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void ask(input);
              }
            }}
          />
          <div style={S.actions}>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(event) => {
                if (event.target.files) void addFiles(event.target.files);
                event.target.value = '';
              }}
            />
            <button
              type="button"
              style={S.attach}
              onClick={() => fileRef.current?.click()}
              disabled={busy || addingPhotos || pendingImages.length >= MAX_IMAGES}
            >
              {addingPhotos ? 'Adding…' : 'Photo'}
            </button>
            <button type="submit" disabled={!canSend} style={{ ...S.send, opacity: canSend ? 1 : 0.55 }}>
              {busy ? 'Working…' : 'Ask'}
            </button>
          </div>
        </div>
      </form>
      <p style={S.hint}>Paste a screenshot, drop a photo, or tap Photo. Up to 3. Photos are sent with the next question only.</p>
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
    WebkitAppearance: 'none',
    background: '#0a1a15',
    border: '1px solid #1f7d5b',
    color: '#5DCAA5',
    borderRadius: 999,
    padding: '10px 14px',
    minHeight: 40,
    font: 'inherit',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    pointerEvents: 'auto',
    position: 'relative',
    zIndex: 2,
    userSelect: 'none',
    touchAction: 'manipulation',
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
  formWrap: { display: 'flex', flexDirection: 'column', gap: 10 },
  form: { display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'end' },
  actions: { display: 'flex', flexDirection: 'column', gap: 8 },
  attach: {
    background: '#1a1d24',
    color: '#5DCAA5',
    border: '1px solid #1f7d5b',
    borderRadius: 10,
    padding: '10px 14px',
    font: 'inherit',
    fontWeight: 800,
    cursor: 'pointer',
    minHeight: 40,
  },
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
  thumbRow: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  sentThumb: {
    width: 88,
    height: 88,
    objectFit: 'cover',
    borderRadius: 8,
    border: '1px solid #1f7d5b',
  },
  pendingThumbWrap: { position: 'relative' },
  pendingThumb: {
    width: 88,
    height: 88,
    objectFit: 'cover',
    borderRadius: 8,
    border: '1px solid #2a2c33',
    display: 'block',
  },
  removeThumb: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    border: 0,
    background: '#5a2b25',
    color: '#ff8b7a',
    fontWeight: 800,
    cursor: 'pointer',
    lineHeight: 1,
  },
  hint: {
    margin: '8px 0 0',
    color: '#8a8878',
    fontSize: 13,
  },
  disclaimer: {
    marginTop: 14,
    color: '#6a6858',
    fontSize: 12,
    lineHeight: 1.45,
    fontFamily: 'Space Mono, ui-monospace, monospace',
  },
};
