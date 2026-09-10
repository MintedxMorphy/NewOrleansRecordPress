/**
 * Short NORP shop-floor playbooks. Checklist spine for the writer — always cite
 * the Viryl manual. Do not invent HMI setpoints; operators load a saved job.
 */

export type Playbook = {
  id: string;
  title: string;
  /** Manual pages that should be retrieved with this playbook. */
  pages: number[];
  text: string;
};

const SIZE_CHANGE_PAGES = [
  29, // moulds interchangeable by 12 / 10 / 7 inch
  34, // stacking spindles
  61, 62, 63, // job details, compound, Load Job
  68, 69, // process details: heat / dwell / cool / pressure
  94, // labels
  99, 100, // changing / removing stacking spindles
  101, // stampers
  104, 105, 106, 107, 108, // remove / install moulds
];

function normalize(query: string): string {
  return query
    .toLowerCase()
    .replace(/moulds/g, 'molds')
    .replace(/mould/g, 'mold')
    .replace(/12\s*[-]?\s*(?:inch|in\b|["”''])/g, ' 12inch ')
    .replace(/7\s*[-]?\s*(?:inch|in\b|["”''])/g, ' 7inch ')
    .replace(/10\s*[-]?\s*(?:inch|in\b|["”''])/g, ' 10inch ')
    .replace(/\b12\s+molds?\b/g, ' 12inch mold ')
    .replace(/\b7\s+molds?\b/g, ' 7inch mold ')
    .replace(/\blps?\b/g, ' lp 12inch ')
    .replace(/\beps?\b/g, ' ep 7inch ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isRecordSizeChangeQuery(query: string): boolean {
  const q = normalize(query);
  const hasSize = /\b(12inch|7inch|10inch|lp|ep)\b/.test(q);
  const hasTooling = /\b(mold|molds|spindle|spindles|size|format|job|setting|settings|dwell|label|labels)\b/.test(q);
  return hasSize && hasTooling;
}

function direction(query: string): '12-to-7' | '7-to-12' | 'either' {
  const q = normalize(query);
  const twelveThenSeven = /\b12inch\b[\s\S]{0,48}\b7inch\b/.test(q) || /\blp\b[\s\S]{0,48}\bep\b/.test(q);
  const sevenThenTwelve = /\b7inch\b[\s\S]{0,48}\b12inch\b/.test(q) || /\bep\b[\s\S]{0,48}\blp\b/.test(q);
  if (twelveThenSeven && !sevenThenTwelve) return '12-to-7';
  if (sevenThenTwelve && !twelveThenSeven) return '7-to-12';
  return 'either';
}

function sizeChangeSpine(fromLabel: string, toLabel: string): string {
  return [
    `NORP playbook: change ${fromLabel} tooling to ${toLabel} on WarmTone MK1 PRS00007 (integrated auto edge trimmer). Use this as the checklist spine and cite the manual. Do not invent temperatures, dwell, pressure, ram speed, or gram-weight numbers.`,
    '',
    'Plant notes:',
    '- This press is a Viryl WarmTone MK1 with integrated trimmer and dual stacking. Finebilt procedures do not apply.',
    '- Manual p.29: moulds are interchangeable by record size (12-inch, 10-inch*, 7-inch*) and by weight (140g / 180g / other). *Viryl notes not every WarmTone ships 7-inch ready; NORP runs both 12" and 7" on this machine — if a 7" feature is missing, stop and call Viryl, do not improvise.',
    '',
    'Hazards before any mould work (Manual p.101, 104):',
    '- Pinch, crush, steam, hydraulic, and sharp stamper/mould edges. Wear gloves (nitrile on mould faces). Do not bypass the safety system.',
    '- Finish the last cycle with Stop on the Run Screen. On Heat/Cool Valves Details, Cool Moulds in three 30-second holds. eStop. Shut all four manifold process valves. Swing the Trimmer/Stacking assembly clear.',
    '',
    `Checklist (${fromLabel} → ${toLabel}):`,
    `1. Remove ${fromLabel} stampers, clamp rings, and centre bushings (Manual p.101).`,
    `2. Remove ${fromLabel} moulds — jig on the dowels, diagnostic ram to support the top mould, strap clamps clear, then lift (Manual p.104–105). Handle moulds with nitrile gloves only.`,
    `3. Install ${toLabel} moulds — clean/flat carriers, strap-clamp bottom then top with the jig, refit pushers with Loctite Blue, hook hoses to the IN/OUT disconnects (Manual p.106–108).`,
    '4. Open process valves. Manual Cool to check leaks, then stand clear for Manual Heat steam checks (Manual p.109). The ram-position table on p.109 is an install leak-check aid, not a 7"/12" production recipe.',
    `5. Change stacking spindles to the ${toLabel} pair (Manual p.34, 99–100): Request to Enter on the stacker window, slide the drawer, lift the spindle, seat the new one until the orange touch sensor sees the base, confirm the swing arm drops onto the spindle.`,
    `6. Load ${toLabel} labels / cartridges (Manual p.94–95). 7" and 12" labels are not interchangeable.`,
    `7. Settings: on Job Details, press Load Job and pick a saved ${toLabel} job (or a known-good ${toLabel} production/test job). Review Entry Name / Value, then ACCEPT only if those values are the ones you want (Manual p.61–63). That restores Job Details + process settings. Confirm on Process Details: Heat, Dwell, Cool Moulds, Press At Pressure, Closing Speed, Pressure Setpoint (Manual p.68–69). If no saved ${toLabel} job exists, use the Viryl process tables / a previous good run written on the press — do not guess numbers.`,
    '8. Compound Settings must be the preset for this run (Manual p.62). Warm up / soak / purge as usual after the tooling change (Manual p.64).',
    '',
    'If anything on p.29 / HMI says this WarmTone is not 7-inch equipped, call Viryl 1-844-468-4795 before forcing moulds on.',
  ].join('\n');
}

const PLAYBOOK_12_TO_7: Playbook = {
  id: 'size-change-12-to-7',
  title: 'NORP 12" → 7" mould change',
  pages: SIZE_CHANGE_PAGES,
  text: sizeChangeSpine('12-inch (LP)', '7-inch (EP)'),
};

const PLAYBOOK_7_TO_12: Playbook = {
  id: 'size-change-7-to-12',
  title: 'NORP 7" → 12" mould change',
  pages: SIZE_CHANGE_PAGES,
  text: sizeChangeSpine('7-inch (EP)', '12-inch (LP)'),
};

const PLAYBOOK_EITHER: Playbook = {
  id: 'size-change-either',
  title: 'NORP record-size mould change (12" ↔ 7")',
  pages: SIZE_CHANGE_PAGES,
  text: [
    sizeChangeSpine('the size you are coming from', 'the size you are going to'),
    '',
    'Same spine both ways (12" → 7" or 7" → 12"): moulds, stacking spindles, labels, then Load Job for the target size. Do not copy 12" dwell/pressure onto a 7" run or the reverse.',
  ].join('\n'),
};

export function playbookForQuestion(query: string): Playbook | null {
  if (!isRecordSizeChangeQuery(query)) return null;
  const dir = direction(query);
  if (dir === '12-to-7') return PLAYBOOK_12_TO_7;
  if (dir === '7-to-12') return PLAYBOOK_7_TO_12;
  return PLAYBOOK_EITHER;
}

export function sizeChangePreferredPages(): readonly number[] {
  return SIZE_CHANGE_PAGES;
}
