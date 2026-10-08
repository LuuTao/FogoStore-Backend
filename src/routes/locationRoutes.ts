import { Router } from 'express';
import { slidingWindowWithFreeze } from '../middlewares/rateLimiter';

const router = Router();

const locationLookupLimiter = slidingWindowWithFreeze({
  windowSeconds: 60,
  maxRequests: 30,
  freezeSeconds: 60,
  eventType: 'LOCATION_LOOKUP_SPAM',
});

const getGoongApiKey = () => String(process.env.GOONG_API_KEY || '').trim();

type GoongGeocodeResult = {
  place_id?: string;
  name?: string;
  formatted_address?: string;
  address_components?: Array<{ long_name?: string }>;
  compound?: { commune?: string; province?: string };
  geometry?: { location?: { lat?: number; lng?: number } };
};

const normalizeLocation = (result: GoongGeocodeResult) => {
  const latitude = Number(result.geometry?.location?.lat);
  const longitude = Number(result.geometry?.location?.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return {
    placeId: String(result.place_id || ''),
    name: String(result.name || result.address_components?.[0]?.long_name || '').trim(),
    formattedAddress: String(result.formatted_address || '').trim(),
    commune: String(result.compound?.commune || '').trim(),
    province: String(result.compound?.province || '').trim(),
    latitude,
    longitude,
  };
};

const requestGeocode = async (params: URLSearchParams) => {
  const response = await fetch(`https://rsapi.goong.io/v2/geocode?${params.toString()}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(7000),
  });
  const payload = await response.json() as { results?: GoongGeocodeResult[] };
  if (!response.ok) throw new Error('Goong geocode failed');

  const location = Array.isArray(payload.results)
    ? payload.results.map(normalizeLocation).find(Boolean)
    : null;
  if (!location) throw new Error('No matching location');
  return location;
};

router.get('/geocode', locationLookupLimiter, async (req, res) => {
  const address = String(req.query.address || '').trim();
  if (address.length < 6 || address.length > 300) {
    return res.status(400).json({ success: false, error: 'Vui lòng nhập địa chỉ cụ thể hơn.' });
  }

  const apiKey = getGoongApiKey();
  if (!apiKey) {
    return res.status(503).json({ success: false, error: 'Dịch vụ định vị chưa được cấu hình.' });
  }

  try {
    const location = await requestGeocode(new URLSearchParams({
      address,
      api_key: apiKey,
      has_deprecated_administrative_unit: 'true',
    }));
    return res.json({ success: true, data: location });
  } catch {
    return res.status(502).json({
      success: false,
      error: 'Chưa xác định được vị trí. Vui lòng nhập rõ số nhà, tên đường và phường/xã.',
    });
  }
});

router.get('/reverse', locationLookupLimiter, async (req, res) => {
  const latitude = Number(req.query.lat);
  const longitude = Number(req.query.lng);
  if (
    !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
    !Number.isFinite(longitude) || longitude < -180 || longitude > 180
  ) {
    return res.status(400).json({ success: false, error: 'Tọa độ không hợp lệ.' });
  }

  const apiKey = getGoongApiKey();
  if (!apiKey) {
    return res.status(503).json({ success: false, error: 'Dịch vụ định vị chưa được cấu hình.' });
  }

  try {
    const location = await requestGeocode(new URLSearchParams({
      latlng: `${latitude},${longitude}`,
      limit: '1',
      api_key: apiKey,
      has_deprecated_administrative_unit: 'true',
    }));
    return res.json({ success: true, data: location });
  } catch {
    return res.status(502).json({ success: false, error: 'Không tìm thấy địa chỉ tại vị trí ghim này.' });
  }
});

export default router;
