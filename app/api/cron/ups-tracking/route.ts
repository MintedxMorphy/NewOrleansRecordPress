import { NextRequest, NextResponse } from 'next/server';
import { getSheet, updateRow, findRow, appendRow } from '@/lib/sheets';
import { trackShipment } from '@/lib/ups';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const shipments = await getSheet('shipments');
  const active = shipments.filter(s => !['delivered', 'returned'].includes(s.status?.toLowerCase() ?? ''));

  const results: string[] = [];

  for (const shipment of active) {
    const { tracking_number, job_id } = shipment;
    if (!tracking_number) continue;

    try {
      const track = await trackShipment(tracking_number);
      const newStatus = track.status;
      const oldStatus = shipment.status ?? '';

      const foundShipment = await findRow('shipments', 'tracking_number', tracking_number);
      if (!foundShipment) continue;

      const now = new Date().toISOString();
      const updated = {
        ...foundShipment.row,
        status: newStatus,
        last_status_update: now,
        est_delivery: track.estDelivery || foundShipment.row.est_delivery,
      };

      // If delivered: set actual_delivery and update linked job
      if (newStatus.toLowerCase().includes('delivered')) {
        updated.actual_delivery = now.split('T')[0];

        if (job_id) {
          const foundJob = await findRow('jobs', 'job_id', job_id);
          if (foundJob) {
            const updatedJob = { ...foundJob.row, delivery_date: updated.actual_delivery };
            if (parseFloat(foundJob.row.balance_due || '0') === 0) {
              updatedJob.stage = 'paid';
            }
            await updateRow('jobs', foundJob.rowIndex, updatedJob);
          }
        }

        // Log draft customer email action (do NOT auto-send)
        await appendRow('email_log', {
          timestamp: now,
          from: 'system',
          subject: `Delivery confirmed: ${tracking_number}`,
          classification: 'shipping_update',
          confidence: '1',
          summary: `Package delivered. Job: ${job_id}`,
          action_taken: 'draft_customer_email',
          job_id: job_id ?? '',
          bill_id: '',
        });
      }

      // Exception / returned / delivery_attempted alert
      const statusLower = newStatus.toLowerCase();
      if (
        track.exception ||
        statusLower.includes('exception') ||
        statusLower.includes('returned') ||
        statusLower.includes('delivery attempt')
      ) {
        await appendRow('email_log', {
          timestamp: now,
          from: 'system',
          subject: `UPS exception: ${tracking_number}`,
          classification: 'shipping_update',
          confidence: '1',
          summary: `UPS status: ${newStatus}${track.exception ? ' — ' + track.exception : ''}`,
          action_taken: 'ups_exception_alert',
          job_id: job_id ?? '',
          bill_id: '',
        });
      }

      if (newStatus !== oldStatus) {
        await updateRow('shipments', foundShipment.rowIndex, updated);

        // Log to ups_tracking_log
        await appendRow('ups_tracking_log', {
          timestamp: now,
          tracking_number,
          job_id: job_id ?? '',
          old_status: oldStatus,
          new_status: newStatus,
          message: track.lastScan,
        });

        results.push(`${tracking_number}: ${oldStatus} → ${newStatus}`);
      } else {
        results.push(`${tracking_number}: no change (${newStatus})`);
      }
    } catch (e: any) {
      results.push(`${tracking_number}: ERROR - ${e?.message}`);
    }
  }

  return NextResponse.json({ ok: true, checked: active.length, results });
}
