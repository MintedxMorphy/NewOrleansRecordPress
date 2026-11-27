export type AirtableCopyField = {
  id: string;
  name: string;
  type: string;
  description?: string;
  options?: {
    choices?: Array<{
      id?: string;
      name: string;
      color?: string;
    }>;
    precision?: number;
    symbol?: string;
    durationFormat?: string;
    color?: string;
    icon?: string;
    max?: number;
    linkedTableId?: string;
    viewIdForRecordSelection?: string;
    prefersSingleRecordLink?: boolean;
    dateFormat?: { name?: string; format?: string };
    timeFormat?: { name?: string; format?: string };
    timeZone?: string;
    formula?: string;
    [key: string]: unknown;
  };
};

export type AirtableCopyTable = {
  id: string;
  name: string;
  fields: AirtableCopyField[];
};

export type AirtableCopyRecord = {
  id: string;
  fields: Record<string, unknown>;
};

export type CopiedCompletedFields = {
  fields: Record<string, unknown>;
  dropped: Array<{ name: string; reason: string }>;
};

const COMPUTED_FIELD_TYPES = new Set([
  'aiText',
  'autoNumber',
  'button',
  'count',
  'createdBy',
  'createdTime',
  'externalSyncSource',
  'formula',
  'lastModifiedBy',
  'lastModifiedTime',
  'lookup',
  'multipleLookupValues',
  'rollup',
]);

const TEXT_FIELD_TYPES = new Set([
  'singleLineText',
  'multilineText',
  'richText',
  'email',
  'url',
  'phoneNumber',
]);

export function isWritableAirtableField(field: AirtableCopyField) {
  return !COMPUTED_FIELD_TYPES.has(field.type);
}

export function isEmptyAirtableCopyValue(value: unknown) {
  if (value === null || value === undefined || value === '') return true;
  if (value === false) return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

function stringValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(stringValue).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    const record = value as { id?: unknown; name?: unknown; text?: unknown; url?: unknown };
    if (typeof record.name === 'string' && record.name) return record.name;
    if (typeof record.text === 'string' && record.text) return record.text;
    if (typeof record.url === 'string' && record.url) return record.url;
    return JSON.stringify(value);
  }
  return String(value);
}

function parseQuantity(value: unknown) {
  const cleaned = stringValue(value).replace(/,/g, '').trim();
  if (!cleaned) return undefined;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function choiceForFieldValue(field: AirtableCopyField, value: unknown) {
  const raw = stringValue(value).trim();
  if (!raw) return undefined;

  const choices = field.options?.choices || [];
  if (!choices.length) return raw;

  const key = raw.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return choices.find(choice => choice.name.toLowerCase().replace(/[^a-z0-9]+/g, '') === key)?.name || raw;
}

function dateOnly(value: unknown) {
  const raw = stringValue(value).trim();
  if (!raw) return undefined;
  const isoDate = raw.match(/^\d{4}-\d{2}-\d{2}/);
  if (isoDate) return isoDate[0];
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return undefined;
  return new Date(parsed).toISOString().slice(0, 10);
}

function attachmentWrites(value: unknown) {
  const items = Array.isArray(value) ? value : [value];
  const copied = items.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const attachment = item as { url?: unknown; filename?: unknown };
    if (typeof attachment.url !== 'string' || !attachment.url) return [];
    const filename = typeof attachment.filename === 'string' && attachment.filename
      ? attachment.filename
      : attachment.url.split('/').pop() || 'attachment';
    return [{ url: attachment.url, filename }];
  });
  return copied.length ? copied : undefined;
}

function linkedRecordIds(value: unknown) {
  const items = Array.isArray(value) ? value : [value];
  const ids = items.flatMap(item => {
    if (typeof item === 'string' && item) return [item];
    if (item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string') {
      return [(item as { id: string }).id];
    }
    return [];
  });
  return ids.length ? ids : undefined;
}

function collaboratorWrite(value: unknown, multiple: boolean) {
  const items = Array.isArray(value) ? value : [value];
  const ids = items.flatMap(item => {
    if (typeof item === 'string' && item) return [item];
    if (item && typeof item === 'object') {
      const collaborator = item as { id?: unknown; email?: unknown };
      if (typeof collaborator.id === 'string' && collaborator.id) return [collaborator.id];
      if (typeof collaborator.email === 'string' && collaborator.email) return [collaborator.email];
    }
    return [];
  });
  if (!ids.length) return undefined;
  return multiple ? ids : ids[0];
}

function barcodeWrite(value: unknown) {
  if (typeof value === 'string' && value.trim()) return { text: value.trim() };
  if (value && typeof value === 'object' && typeof (value as { text?: unknown }).text === 'string') {
    const text = (value as { text: string }).text.trim();
    return text ? { text } : undefined;
  }
  return undefined;
}

export function copyValueForCompletedField(field: AirtableCopyField, value: unknown): unknown {
  if (isEmptyAirtableCopyValue(value)) return undefined;

  if (['number', 'currency', 'percent', 'rating', 'duration'].includes(field.type)) {
    return parseQuantity(value);
  }

  if (field.type === 'date') return dateOnly(value);
  if (field.type === 'dateTime') {
    const raw = stringValue(value).trim();
    if (!raw) return undefined;
    if (!Number.isNaN(Date.parse(raw))) return raw;
    return undefined;
  }

  if (field.type === 'checkbox') {
    if (value === true) return true;
    const normalized = stringValue(value).trim().toLowerCase();
    if (['yes', 'y', 'true', '1', 'done', 'complete', 'completed', 'approved'].includes(normalized)) return true;
    return undefined;
  }

  if (field.type === 'singleSelect') return choiceForFieldValue(field, value);

  if (field.type === 'multipleSelects') {
    const rawValues = Array.isArray(value) ? value : stringValue(value).split(',');
    const choices = rawValues
      .map(item => choiceForFieldValue(field, item))
      .filter((item): item is string => Boolean(item));
    return choices.length ? Array.from(new Set(choices)) : undefined;
  }

  if (field.type === 'multipleAttachments') return attachmentWrites(value);
  if (field.type === 'multipleRecordLinks') return linkedRecordIds(value);
  if (field.type === 'singleCollaborator') return collaboratorWrite(value, false);
  if (field.type === 'multipleCollaborators') return collaboratorWrite(value, true);
  if (field.type === 'barcode') return barcodeWrite(value);

  if (TEXT_FIELD_TYPES.has(field.type)) {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return stringValue(value);
  }

  if (Array.isArray(value) || typeof value === 'object') return value;
  return value;
}

function fieldByName(table: AirtableCopyTable, name: string) {
  return table.fields.find(field => field.name.toLowerCase() === name.toLowerCase());
}

export function writableFieldsMissingOnCompleted(
  production: AirtableCopyTable,
  completed: AirtableCopyTable,
) {
  return production.fields.filter(field =>
    isWritableAirtableField(field) && !fieldByName(completed, field.name)
  );
}

export function completedFieldsFromProductionRecord(
  record: AirtableCopyRecord,
  production: AirtableCopyTable,
  completed: AirtableCopyTable,
): CopiedCompletedFields {
  const fields: Record<string, unknown> = {};
  const dropped: Array<{ name: string; reason: string }> = [];

  for (const sourceField of production.fields) {
    if (!isWritableAirtableField(sourceField)) continue;

    const value = record.fields[sourceField.name];
    if (isEmptyAirtableCopyValue(value)) continue;

    const targetField = fieldByName(completed, sourceField.name);
    if (!targetField) {
      dropped.push({ name: sourceField.name, reason: 'missing on Completed' });
      continue;
    }
    if (!isWritableAirtableField(targetField)) {
      dropped.push({ name: sourceField.name, reason: `${targetField.type} on Completed is not writable` });
      continue;
    }

    const copied = copyValueForCompletedField(targetField, value);
    if (copied === undefined) {
      dropped.push({ name: sourceField.name, reason: `could not copy ${sourceField.type} into ${targetField.type}` });
      continue;
    }

    fields[targetField.name] = copied;
  }

  return { fields, dropped };
}

export function fieldCreatePayload(field: AirtableCopyField): Record<string, unknown> | null {
  if (!isWritableAirtableField(field)) return null;

  const payload: Record<string, unknown> = {
    name: field.name,
    type: field.type,
  };
  if (field.description) payload.description = field.description;

  const options = writeOptionsForField(field);
  if (field.type === 'multipleRecordLinks' && !options) return null;
  if (options) payload.options = options;
  return payload;
}

function writeOptionsForField(field: AirtableCopyField): Record<string, unknown> | undefined {
  const options = field.options || {};

  if (field.type === 'number' || field.type === 'percent') {
    return { precision: typeof options.precision === 'number' ? options.precision : 0 };
  }

  if (field.type === 'currency') {
    return {
      precision: typeof options.precision === 'number' ? options.precision : 2,
      symbol: typeof options.symbol === 'string' && options.symbol ? options.symbol : '$',
    };
  }

  if (field.type === 'duration') {
    return { durationFormat: options.durationFormat || 'h:mm' };
  }

  if (field.type === 'checkbox') {
    return {
      color: options.color || 'greenBright',
      icon: options.icon || 'check',
    };
  }

  if (field.type === 'rating') {
    return {
      color: options.color || 'yellowBright',
      icon: options.icon || 'star',
      max: typeof options.max === 'number' ? options.max : 5,
    };
  }

  if (field.type === 'date') {
    return {
      dateFormat: { name: options.dateFormat?.name || 'iso' },
    };
  }

  if (field.type === 'dateTime') {
    return {
      timeZone: options.timeZone || 'utc',
      dateFormat: { name: options.dateFormat?.name || 'iso' },
      timeFormat: { name: options.timeFormat?.name || '24hour' },
    };
  }

  if (field.type === 'singleSelect' || field.type === 'multipleSelects') {
    const choices = (options.choices || []).map(choice => {
      const next: { name: string; color?: string } = { name: choice.name };
      if (choice.color) next.color = choice.color;
      return next;
    });
    return { choices };
  }

  if (field.type === 'multipleRecordLinks') {
    if (typeof options.linkedTableId !== 'string' || !options.linkedTableId) return undefined;
    const linkOptions: Record<string, unknown> = { linkedTableId: options.linkedTableId };
    if (typeof options.viewIdForRecordSelection === 'string' && options.viewIdForRecordSelection) {
      linkOptions.viewIdForRecordSelection = options.viewIdForRecordSelection;
    }
    return linkOptions;
  }

  return undefined;
}

export function resolveNamedAirtableTable(
  tables: AirtableCopyTable[],
  configuredTable: string,
  fallbacks: string[] = [],
) {
  const names = [configuredTable, ...fallbacks];
  return tables.find(table =>
    names.some(name => table.id === name || table.name.toLowerCase() === name.toLowerCase())
  );
}
