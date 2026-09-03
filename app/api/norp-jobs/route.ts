import { NextRequest, NextResponse } from 'next/server';
import { getNORPJobs } from '@/lib/norp-sheet';
import { getNORPArtFiles } from '@/lib/norp-drive';
import { getAirtableJobs, isAirtableConfigured } from '@/lib/airtable';
import { listAllShipmentsForSync, trackingUrl, type JobShipment } from '@/lib/airtable-shipments';
import { applyProductionLogInferences } from '@/lib/production-log-inference';
import { getVendorCostSummariesByMatrix, type VendorCostSummary } from '@/lib/airtable-vendor-costs';
import { ensureCanonicalHeaders, getSheet } from '@/lib/sheets';
import { matchJobFromShipmentText } from '@/lib/shipment-job-link';
import { loadProductionJobsForVendorInvoices, type JobContext } from '@/lib/vendor-invoice-import';
import { listQboInvoices } from '@/lib/qbo';
import { assignClientInvoices, buildJobPnl } from '@/lib/job-pnl';

export const dynamic = 'force-dynamic';

const STAGE_RANK: Record<string, number> = {
  pre_production: 1,
  press_queue: 2,
  now_pressing: 3,
  quality_control: 4,
  sleeving: 5,
  assembly: 6,
  shipping: 7,
  completed: 8,
};

const SOURCE_RANK: Record<string, number> = {
  airtable_dashboard_stage: 4,
  production_logs: 3,
  airtable_fields: 2,
};

type DashboardShipment = {
  id: string;
  tracking_number: string;
  carrier: string;
  status: string;
  direction: 'inbound' | 'outbound';
  supply_type: string;
  matrix: string;
  customer: string;
  job_id: string;
  shipped_date: string;
  est_delivery: string;
  delivered_date: string;
  total_cost: number;
  notes: string;
  tracking_url: string;
  source: 'airtable' | 'sheet';
  source_subject?: string;
};

function cleanKey(value = '') {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function matrixKey(value = '') {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function stringValue(value: unknown) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(stringValue).filter(Boolean).join(', ');
  return String(value).trim();
}

function numberValue(value: unknown) {
  const parsed = Number(stringValue(value).replace(/[$,]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeDirection(value = ''): 'inbound' | 'outbound' {
  return value.toLowerCase().includes('out') ? 'outbound' : 'inbound';
}

function normalizeTracking(value = '') {
  return value.replace(/\s+/g, '').trim().toUpperCase();
}

function statusSortRank(status = '') {
  const normalized = status.toLowerCase();
  if (normalized.includes('exception') || normalized.includes('fail')) return 0;
  if (normalized.includes('out for delivery')) return 1;
  if (normalized.includes('transit')) return 2;
  if (normalized.includes('label') || normalized.includes('pending') || normalized.includes('registered')) return 3;
  if (normalized.includes('delivered')) return 5;
  return 4;
}

function shipmentDateSortValue(shipment: DashboardShipment) {
  return shipment.est_delivery || shipment.delivered_date || shipment.shipped_date || '';
}

function airtableShipmentToDashboard(shipment: JobShipment): DashboardShipment {
  return {
    id: shipment.id,
    tracking_number: normalizeTracking(shipment.tracking_number),
    carrier: shipment.carrier,
    status: shipment.status,
    direction: shipment.direction,
    supply_type: shipment.supply_type,
    matrix: shipment.matrix,
    customer: shipment.customer,
    job_id: '',
    shipped_date: shipment.shipped_date,
    est_delivery: shipment.est_delivery,
    delivered_date: shipment.delivered_date,
    total_cost: shipment.total_cost,
    notes: shipment.notes,
    tracking_url: trackingUrl(shipment.carrier, shipment.tracking_number),
    source: 'airtable',
  };
}

function sheetShipmentToDashboard(row: Record<string, string>, index: number): DashboardShipment {
  const trackingNumber = normalizeTracking(row.tracking_number || row['Tracking Number'] || row.tracking || '');
  const carrier = stringValue(row.carrier || row.Carrier);
  return {
    id: `sheet:${trackingNumber || index}`,
    tracking_number: trackingNumber,
    carrier,
    status: stringValue(row.status || row.ship_status || row['Ship Status']),
    direction: normalizeDirection(stringValue(row.direction || row.Direction)),
    supply_type: stringValue(row.supply_type || row['Supply Type'] || row.service || row.Service),
    matrix: stringValue(row.matrix || row.MATRIX || row['Matrix ID'] || row.job_id),
    customer: stringValue(row.customer || row.Customer || row['Customer Name']),
    job_id: stringValue(row.job_id || row['Job ID']),
    shipped_date: stringValue(row.shipped_date || row['Shipped Date'] || row.ship_date),
    est_delivery: stringValue(row.est_delivery || row['Estimated Delivery']),
    delivered_date: stringValue(row.actual_delivery || row.delivered_date || row.delivery_date),
    total_cost: numberValue(row.total_cost || row.shipping_cost),
    notes: stringValue(row.notes || row.Notes),
    tracking_url: trackingUrl(carrier, trackingNumber),
    source: 'sheet',
    source_subject: stringValue(row.source_subject || row['Source Subject']),
  };
}

function relinkDashboardShipments(shipments: DashboardShipment[], jobs: JobContext[]) {
  if (!jobs.length) return shipments;
  return shipments.map(shipment => {
    const text = [
      shipment.source_subject,
      shipment.notes,
      shipment.matrix,
      shipment.job_id,
      shipment.customer,
    ].filter(Boolean).join('\n').trim();
    if (!text) return shipment;
    const linked = matchJobFromShipmentText(text, jobs);
    if (!linked) return shipment;
    return {
      ...shipment,
      job_id: shipment.job_id || linked.job_id,
      matrix: shipment.matrix || linked.matrix,
      customer: shipment.customer || linked.customer,
    };
  });
}

function mergeShipment(existing: DashboardShipment | undefined, incoming: DashboardShipment) {
  if (!existing) return incoming;

  const live = incoming.source === 'sheet' ? incoming : existing.source === 'sheet' ? existing : incoming;
  const preferNotes = [incoming.notes, existing.notes].find(note => note && !/^auto from |^updated from aftership|^aftership webhook/i.test(note))
    || [incoming.notes, existing.notes].find(Boolean)
    || '';

  return {
    ...existing,
    ...incoming,
    carrier: live.carrier || incoming.carrier || existing.carrier,
    status: live.status || incoming.status || existing.status,
    shipped_date: live.shipped_date || incoming.shipped_date || existing.shipped_date,
    est_delivery: live.est_delivery || incoming.est_delivery || existing.est_delivery,
    delivered_date: live.delivered_date || incoming.delivered_date || existing.delivered_date,
    matrix: incoming.matrix || existing.matrix,
    customer: incoming.customer || existing.customer,
    job_id: incoming.job_id || existing.job_id,
    supply_type: incoming.supply_type || existing.supply_type,
    total_cost: existing.total_cost || incoming.total_cost,
    notes: preferNotes,
    tracking_url: incoming.tracking_url || existing.tracking_url,
  };
}

async function loadDashboardShipments(source: string, jobsForRelink: JobContext[] = []) {
  const byTracking = new Map<string, DashboardShipment>();
  const productionJobs = jobsForRelink.length
    ? jobsForRelink
    : source === 'airtable'
      ? await loadProductionJobsForVendorInvoices()
      : [];

  if (source === 'airtable') {
    try {
      for (const shipment of await listAllShipmentsForSync()) {
        const dashboardShipment = airtableShipmentToDashboard(shipment);
        if (!dashboardShipment.tracking_number) continue;
        const key = dashboardShipment.tracking_number;
        byTracking.set(key, mergeShipment(byTracking.get(key), dashboardShipment));
      }
    } catch (e) {
      console.error('[norp-jobs] Airtable shipment lookup failed:', e);
    }
  }

  try {
    await ensureCanonicalHeaders('shipments');
    const sheetShipments = await getSheet('shipments');
    sheetShipments.forEach((row, index) => {
      const dashboardShipment = sheetShipmentToDashboard(row, index);
      if (!dashboardShipment.tracking_number) return;
      const key = dashboardShipment.tracking_number;
      byTracking.set(key, mergeShipment(byTracking.get(key), dashboardShipment));
    });
  } catch (e) {
    console.error('[norp-jobs] sheet shipment lookup failed:', e);
  }

  const linked = relinkDashboardShipments([...byTracking.values()], productionJobs);
  return linked
    .filter(shipment => !shipment.carrier.toLowerCase().includes('testing'))
    .sort((a, b) => {
    const statusDiff = statusSortRank(a.status) - statusSortRank(b.status);
    if (statusDiff !== 0) return statusDiff;
    return shipmentDateSortValue(b).localeCompare(shipmentDateSortValue(a));
  });
}

function jobRecordIds(job: any) {
  const ids = [
    job.airtable_record_id,
    job.record_id,
    job.id,
    ...(Array.isArray(job.merged_record_ids) ? job.merged_record_ids : []),
  ].map(value => stringValue(value)).filter(Boolean);
  return new Set(ids);
}

function shipmentMatchesJob(shipment: DashboardShipment, job: any) {
  const recordIds = jobRecordIds(job);
  if (shipment.id && recordIds.has(shipment.id)) return true;

  const jobMatrixKeys = [
    job.matrix,
    job.MATRIX,
    job['Matrix ID'],
    job.job_id,
    job['Job ID'],
    job.order_number,
    job['Order Number'],
  ].map(value => matrixKey(stringValue(value))).filter(Boolean);
  const shipmentMatrixKeys = [
    shipment.matrix,
    shipment.job_id,
  ].map(value => matrixKey(value)).filter(Boolean);

  if (jobMatrixKeys.length && shipmentMatrixKeys.some(key => jobMatrixKeys.includes(key))) return true;

  const shipmentSearchText = matrixKey([
    shipment.matrix,
    shipment.job_id,
    shipment.customer,
    shipment.source_subject,
    shipment.notes,
    shipment.tracking_number,
  ].join(' '));
  if (jobMatrixKeys.some(key => key.length >= 4 && shipmentSearchText.includes(key))) return true;

  const jobCustomer = cleanKey(stringValue(job.customer || job['Job Name'] || job.Customer || job['Customer Name'] || job.Artist || job['1']));
  const shipmentCustomer = cleanKey(shipment.customer);
  if (jobCustomer && shipmentCustomer && jobCustomer === shipmentCustomer) return true;

  if (jobCustomer.length >= 4 && shipmentSearchText.includes(matrixKey(jobCustomer))) return true;

  const jobContext: JobContext = {
    job_id: stringValue(job.job_id || job['Job ID'] || job.matrix || job.MATRIX),
    matrix: stringValue(job.matrix || job.MATRIX || job.job_id || job['Job ID']),
    customer: stringValue(job.customer || job['Job Name'] || job.Customer || job.artist || job.ARTIST || job['Customer Name'] || job['1']),
    order_number: stringValue(job.order_number || job['Order Number']),
  };
  if (matchJobFromShipmentText(shipmentSearchText, [jobContext])) return true;

  return false;
}

function shipmentsForJob(job: any, shipments: DashboardShipment[]) {
  return shipments.filter(shipment => shipmentMatchesJob(shipment, job));
}

function vendorCostSummaryForJob(job: any, summaries: Map<string, VendorCostSummary>) {
  const keys = [
    job.matrix,
    job.MATRIX,
    job.job_id,
    job['Job ID'],
  ].map(value => matrixKey(String(value || ''))).filter(Boolean);
  const uniqueKeys = [...new Set(keys)];
  const matching = uniqueKeys
    .map(key => summaries.get(key))
    .filter((summary): summary is VendorCostSummary => Boolean(summary));

  if (!matching.length) return undefined;

  const combined: VendorCostSummary = { total: 0, count: 0, categories: {}, items: [] };
  const seenItems = new Set<string>();
  for (const summary of matching) {
    combined.total += summary.total;
    combined.count += summary.count;
    for (const [category, total] of Object.entries(summary.categories)) {
      combined.categories[category] = (combined.categories[category] || 0) + total;
    }
    for (const item of summary.items) {
      if (seenItems.has(item.id)) continue;
      seenItems.add(item.id);
      combined.items.push(item);
    }
  }

  combined.count = combined.items.length || combined.count;
  return combined;
}

function isRealMatrix(value = '') {
  const normalized = matrixKey(value);
  return normalized.length >= 4 && !['tbc', 'tbd', 'na', 'none', 'unknown'].includes(normalized);
}

function isSplitBatch(job: any) {
  return String(job.dash_notes || job['Dash Notes'] || '').toLowerCase().includes('[split batch]');
}

function parseQuantity(value: unknown) {
  const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function variantSignature(job: any) {
  return `${cleanKey(job.colors || job.Colors || '')}::${cleanKey(job.quantity || job.Quantity || '')}`;
}

function runLabelFromNotes(notes: unknown) {
  const match = String(notes ?? '').match(/\[Run\s+(\d+)\s*\/\s*(\d+)\]/i);
  return match ? `Run ${match[1]}/${match[2]}` : '';
}

function formatVariantLabel(colors: string, quantity: string, runLabel = '') {
  const parts: string[] = [];
  if (colors) parts.push(colors);
  if (quantity) parts.push(`(${quantity})`);
  if (runLabel) parts.push(runLabel);
  return parts.join(' ').trim();
}

function mergeVariantGroup<T extends Record<string, any>>(group: T[]) {
  const winner = group.reduce((best, job) => betterJob(best, job), group[0]);
  const variants = group.map(job => ({
    airtable_record_id: job.airtable_record_id || '',
    colors: String(job.colors || job.Colors || '').trim(),
    quantity: String(job.quantity || job.Quantity || '').trim(),
    run_label: runLabelFromNotes(job.dash_notes || job['Dash Notes']),
  })).filter(variant => variant.colors || variant.quantity);

  const seen = new Set<string>();
  const uniqueVariants = variants.filter(variant => {
    const key = `${cleanKey(variant.colors)}::${cleanKey(variant.quantity)}::${cleanKey(variant.run_label)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const combinedColors = uniqueVariants
    .map(variant => formatVariantLabel(variant.colors, variant.quantity, variant.run_label))
    .join(' · ');
  const totalQuantity = group.reduce((sum, job) => sum + parseQuantity(job.quantity || job.Quantity), 0);
  const mergedRecordIds = group
    .map(job => job.airtable_record_id)
    .filter((id): id is string => Boolean(id));

  return {
    ...winner,
    variant_count: group.length,
    duplicate_count: group.length,
    merged_record_ids: mergedRecordIds,
    variants: uniqueVariants,
    colors: combinedColors || winner.colors,
    Colors: combinedColors || winner.Colors,
    quantity: totalQuantity > 0 ? String(totalQuantity) : winner.quantity,
    Quantity: totalQuantity > 0 ? String(totalQuantity) : winner.Quantity,
  };
}

function dedupeKey(job: any) {
  if (isSplitBatch(job)) {
    return `split::${job.airtable_record_id || job.job_id || job.matrix}`;
  }

  const customer = cleanKey(job.customer || '');
  const rawMatrix = job.matrix || job.job_id || '';
  const matrix = matrixKey(rawMatrix);
  const orderNumber = cleanKey(job.order_number || '');

  if (isRealMatrix(rawMatrix)) return `matrix::${matrix}`;
  if (customer && orderNumber) return `${customer}::${orderNumber}`;
  if (customer) return `customer::${customer}`;
  return job.airtable_record_id || job.job_id || matrix;
}

function betterJob(a: any, b: any) {
  const sourceDiff = (SOURCE_RANK[b.stage_source] || 0) - (SOURCE_RANK[a.stage_source] || 0);
  if (sourceDiff > 0) return b;
  if (sourceDiff < 0) return a;

  const stageDiff = (STAGE_RANK[b.stage] || 0) - (STAGE_RANK[a.stage] || 0);
  if (stageDiff > 0) return b;
  if (stageDiff < 0) return a;

  const orderA = Number(a.dashboard_order);
  const orderB = Number(b.dashboard_order);
  if (Number.isFinite(orderA) && Number.isFinite(orderB) && orderB < orderA) return b;

  return a;
}

function dedupeJobs<T extends Record<string, any>>(jobs: T[]) {
  const groups = new Map<string, T[]>();
  for (const job of jobs) {
    const key = dedupeKey(job);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(job);
  }

  return [...groups.values()].map(group => {
    if (group.length === 1) return group[0];

    const signatures = new Set(group.map(variantSignature));
    if (signatures.size === 1) {
      const winner = group.reduce((best, job) => betterJob(best, job), group[0]);
      return { ...winner, duplicate_count: group.length };
    }

    return mergeVariantGroup(group);
  });
}

function jobsToLinkContext(jobs: any[]): JobContext[] {
  return jobs.map(job => ({
    job_id: stringValue(job.job_id || job['Job ID'] || job.matrix || job.MATRIX),
    matrix: stringValue(job.matrix || job.MATRIX || job.job_id || job['Job ID']),
    customer: stringValue(job.customer || job['Job Name'] || job.Customer || job.artist || job.ARTIST || job['Customer Name'] || job['1']),
    order_number: stringValue(job.order_number || job['Order Number']),
  })).filter(job => job.job_id || job.matrix || job.customer);
}

function jobDetailKey(job: Record<string, any>) {
  return stringValue(job.airtable_record_id || job.job_id || job.matrix || job.MATRIX);
}

async function loadCoreJobs() {
  const source = isAirtableConfigured() ? 'airtable' : 'google_sheet';
  const baseJobs = source === 'airtable' ? await getAirtableJobs({ syncCompleted: false }) : await getNORPJobs();
  let jobs = baseJobs;
  try {
    jobs = await applyProductionLogInferences(baseJobs);
  } catch (e) {
    console.error('[norp-jobs] production log inference failed:', e);
  }
  return { source, jobs: dedupeJobs(jobs) };
}

function withBoardExtras(jobs: any[], artIndex: Awaited<ReturnType<typeof getNORPArtFiles>>, dashboardShipments: DashboardShipment[]) {
  return jobs.map(job => {
    const art = job.matrix ? artIndex[job.matrix] : undefined;
    const shipments = shipmentsForJob(job, dashboardShipments);
    return {
      ...job,
      detail_key: jobDetailKey(job),
      art_received: !!art,
      art_received_date: art?.receivedDate ?? '',
      art_sides: art ? art.sides.join('+') : '',
      ...(shipments.length ? {
        shipments,
        shipment_count: shipments.length,
        active_shipment_count: shipments.filter(shipment => {
          const status = shipment.status.toLowerCase();
          return status && !status.includes('delivered') && !status.includes('returned');
        }).length,
      } : {}),
    };
  });
}

function financePayload(
  jobs: any[],
  vendorCostSummaries: Map<string, VendorCostSummary>,
  qboInvoices: Awaited<ReturnType<typeof listQboInvoices>>,
) {
  const withVendor = jobs.map(job => {
    const vendorCostSummary = vendorCostSummaryForJob(job, vendorCostSummaries);
    if (!vendorCostSummary) return job;
    return {
      ...job,
      vendor_cost_summary: vendorCostSummary,
      vendor_cost_total: vendorCostSummary.total,
      vendor_cost_count: vendorCostSummary.count,
      vendor_cost_categories: vendorCostSummary.categories,
    };
  });
  const assignedInvoices = assignClientInvoices(withVendor, qboInvoices);
  return withVendor.map((job, index) => ({
    detail_key: jobDetailKey(job),
    pnl: buildJobPnl(job, assignedInvoices[index] || []),
    vendor_cost_summary: job.vendor_cost_summary || null,
    vendor_cost_total: job.vendor_cost_total || 0,
    vendor_cost_count: job.vendor_cost_count || 0,
    vendor_cost_categories: job.vendor_cost_categories || {},
  }));
}

export async function GET(request: NextRequest) {
  try {
    const detailsOnly = request.nextUrl.searchParams.get('details') === '1';
    const { source, jobs } = await loadCoreJobs();

    if (detailsOnly) {
      if (source === 'airtable') {
        void getAirtableJobs({ syncCompleted: true }).catch(error => {
          console.error('[norp-jobs] completed production sync failed:', error);
        });
      }

      const [vendorCostSummaries, qboInvoices] = await Promise.all([
        source === 'airtable'
          ? getVendorCostSummariesByMatrix().catch(error => {
              console.error('[norp-jobs] vendor cost summary lookup failed:', error);
              return new Map<string, VendorCostSummary>();
            })
          : Promise.resolve(new Map<string, VendorCostSummary>()),
        listQboInvoices().catch(error => {
          console.error('[norp-jobs] QuickBooks invoice lookup failed:', error);
          return [] as Awaited<ReturnType<typeof listQboInvoices>>;
        }),
      ]);

      const details = financePayload(jobs, vendorCostSummaries, qboInvoices);
      return NextResponse.json({
        count: details.length,
        jobs: details,
        source,
      });
    }

    const [artIndex, dashboardShipments] = await Promise.all([
      getNORPArtFiles().catch(error => {
        console.error('[norp-jobs] art index lookup failed:', error);
        return {} as Awaited<ReturnType<typeof getNORPArtFiles>>;
      }),
      loadDashboardShipments(source, jobsToLinkContext(jobs)),
    ]);

    const enriched = withBoardExtras(jobs, artIndex, dashboardShipments);
    return NextResponse.json({
      count: enriched.length,
      jobs: enriched,
      source,
      tracking_summary: {
        ledger_count: dashboardShipments.length,
        jobs_with_shipments: enriched.filter(job => Array.isArray(job.shipments) && job.shipments.length > 0).length,
        unmatched_sample: dashboardShipments
          .filter(shipment => !enriched.some(job => shipmentsForJob(job, [shipment]).length > 0))
          .slice(0, 5)
          .map(shipment => ({
            tracking_number: shipment.tracking_number,
            carrier: shipment.carrier,
            status: shipment.status,
            matrix: shipment.matrix,
            customer: shipment.customer,
            job_id: shipment.job_id,
          })),
      },
    });
  } catch (error) {
    console.error('[norp-jobs] Error:', error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
