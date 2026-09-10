#!/usr/bin/env python3
"""Extract Viryl WarmTone manual PDF into lib/warmtone-manual/pages.json.

Usage:
  python3 scripts/ingest-warmtone-manual.py /path/to/manual.pdf
"""

from __future__ import annotations

import json
import os
import re
import sys

try:
    from pypdf import PdfReader
except ImportError:
    sys.exit('Install pypdf first: pip install pypdf')

COPYRIGHT_RE = re.compile(
    r'Copyright\s*©\s*2017\s*Viryl Technologies.*?(?:All Rights Reserved|PROPRIETARY)',
    re.I | re.S,
)
MANUAL_ID_RE = re.compile(r'MAN-00016\s*Revision\s*3\.00', re.I)


def clean(text: str) -> str:
    text = text.replace('\u0000', '').replace('\t', ' ')
    text = COPYRIGHT_RE.sub('', text)
    text = MANUAL_ID_RE.sub('', text)
    text = re.sub(r'[ \u00a0]+', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def heading(text: str) -> str:
    for line in text.splitlines():
        line = line.strip(' |•\t')
        if len(line) < 4 or re.fullmatch(r'\d+', line):
            continue
        if line.lower().startswith('copyright') or 'confidential' in line.lower():
            continue
        if line in ('®', 'ii', 'iii'):
            continue
        return line[:120]
    return ''


def main() -> int:
    if len(sys.argv) < 2:
        print('Usage: python3 scripts/ingest-warmtone-manual.py /path/to/manual.pdf', file=sys.stderr)
        return 2

    pdf_path = sys.argv[1]
    out_path = os.path.join(os.path.dirname(__file__), '..', 'lib', 'warmtone-manual', 'pages.json')
    out_path = os.path.abspath(out_path)

    reader = PdfReader(pdf_path)
    pages = []
    for i, page in enumerate(reader.pages, start=1):
        text = clean(page.extract_text() or '')
        pages.append({'page': i, 'heading': heading(text), 'text': text})

    doc = {
        'docId': 'MAN-00016',
        'revision': '3.00',
        'title': 'WarmTone Record Press Operation Manual',
        'publisher': 'Viryl Technologies Corp.',
        'year': 2017,
        'pageCount': len(pages),
        'pages': pages,
    }
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as handle:
        json.dump(doc, handle, ensure_ascii=False, separators=(',', ':'))
    print(f'Wrote {len(pages)} pages to {out_path}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
