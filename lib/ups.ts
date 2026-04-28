const UPS_AUTH_URL = 'https://onlinetools.ups.com/security/v1/oauth/token';
const UPS_TRACK_URL = 'https://onlinetools.ups.com/api/track/v1/details';
const UPS_RATE_URL = 'https://onlinetools.ups.com/api/rating/v1/shop';

let _upsToken: string | null = null;
let _upsTokenExpiry = 0;

async function getUPSToken(): Promise<string> {
  if (_upsToken && Date.now() < _upsTokenExpiry - 60_000) return _upsToken;
  const creds = Buffer.from(`${process.env.UPS_CLIENT_ID}:${process.env.UPS_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(UPS_AUTH_URL, {
    signal: AbortSignal.timeout(5000),
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json() as { access_token: string; expires_in: number };
  _upsToken = data.access_token;
  _upsTokenExpiry = Date.now() + (data.expires_in * 1000);
  return _upsToken;
}

export interface TrackResult {
  status: string;
  lastScan: string;
  estDelivery: string;
  exception: string | null;
}

export async function trackShipment(trackingNumber: string): Promise<TrackResult> {
  try {
    const token = await getUPSToken();
    const res = await fetch(`${UPS_TRACK_URL}/${trackingNumber}?locale=en_US&returnSignature=false`, {
      headers: { Authorization: `Bearer ${token}`, transId: `norp-${Date.now()}`, transactionSrc: 'norp-dashboard' },
    });
    const data = await res.json() as any;
    const pkg = data?.trackResponse?.shipment?.[0]?.package?.[0];
    const activity = pkg?.activity?.[0];
    return {
      status: pkg?.currentStatus?.description ?? 'Unknown',
      lastScan: activity ? `${activity.location?.address?.city ?? ''} - ${activity.status?.description ?? ''}` : '',
      estDelivery: pkg?.deliveryDate?.[0]?.date ?? '',
      exception: pkg?.currentStatus?.type === 'X' ? (pkg?.currentStatus?.description ?? 'Exception') : null,
    };
  } catch {
    return { status: 'Error', lastScan: '', estDelivery: '', exception: null };
  }
}

export interface RateParams {
  weightLbs: number;
  fromZip: string;
  toZip: string;
  service?: string;
}

export async function getShippingRate(params: RateParams): Promise<number> {
  try {
    const token = await getUPSToken();
    const body = {
      RateRequest: {
        Request: { RequestOption: 'Shop' },
        Shipment: {
          Shipper: {
            ShipperNumber: process.env.UPS_ACCOUNT_NUMBER,
            Address: { PostalCode: params.fromZip, CountryCode: 'US' },
          },
          ShipTo: { Address: { PostalCode: params.toZip, CountryCode: 'US' } },
          ShipFrom: { Address: { PostalCode: params.fromZip, CountryCode: 'US' } },
          Package: [{
            PackagingType: { Code: '02' },
            PackageWeight: { UnitOfMeasurement: { Code: 'LBS' }, Weight: String(params.weightLbs) },
          }],
        },
      },
    };
    const res = await fetch(UPS_RATE_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', transId: `norp-rate-${Date.now()}`, transactionSrc: 'norp-dashboard' },
      body: JSON.stringify(body),
    });
    const data = await res.json() as any;
    const services = data?.RateResponse?.RatedShipment ?? [];
    const ground = services.find((s: any) => s.Service?.Code === '03') ?? services[0];
    return parseFloat(ground?.TotalCharges?.MonetaryValue ?? '0');
  } catch {
    return 0;
  }
}
