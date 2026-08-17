//requestInfo.js
// Extracts client IP, parses the User-Agent into a readable device summary
// and resolves the IP to a rough location. No npm dependencies: the geo
// lookup uses the free ip-api.com endpoint (no key required) and fails soft.

export const getClientIp = (req) => {
  const forwarded = req.headers?.['x-forwarded-for'];

  const raw =
    (typeof forwarded === 'string' && forwarded.split(',')[0].trim()) ||
    req.socket?.remoteAddress ||
    req.ip ||
    '';

  // Node reports IPv4 clients as ::ffff:a.b.c.d
  return String(raw).replace(/^::ffff:/i, '');
};

const isPrivateIp = (ip) => {
  if (!ip) return true;
  if (ip === '::1' || ip === 'localhost') return true;
  if (/^(127\.|10\.|192\.168\.|169\.254\.)/.test(ip)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  if (/^f[cd]/i.test(ip)) return true; // IPv6 unique-local
  return false;
};

export const parseUserAgent = (userAgent = '') => {
  const ua = String(userAgent);

  let browser = 'Unknown browser';
  if (/edg(a|e|ios)?\//i.test(ua)) browser = 'Microsoft Edge';
  else if (/opr\/|opera/i.test(ua)) browser = 'Opera';
  else if (/firefox\//i.test(ua)) browser = 'Firefox';
  else if (/chrome\//i.test(ua)) browser = 'Chrome';
  else if (/safari\//i.test(ua) && /version\//i.test(ua)) browser = 'Safari';
  else if (/postman/i.test(ua)) browser = 'Postman';
  else if (/curl\//i.test(ua)) browser = 'curl';

  let os = 'Unknown OS';
  if (/windows nt 10/i.test(ua)) os = 'Windows 10/11';
  else if (/windows nt/i.test(ua)) os = 'Windows';
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
  else if (/mac os x/i.test(ua)) os = 'macOS';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/linux/i.test(ua)) os = 'Linux';

  let deviceType = 'Desktop';
  if (/ipad|tablet/i.test(ua)) deviceType = 'Tablet';
  else if (/mobile|iphone|android/i.test(ua)) deviceType = 'Mobile';

  return { browser, os, deviceType };
};

export const lookupIpLocation = async (ip) => {
  if (isPrivateIp(ip)) {
    return { country: 'Local network', region: '', city: '', isp: '' };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}` +
        '?fields=status,country,regionName,city,isp',
      { signal: controller.signal }
    );

    clearTimeout(timer);
    if (!response.ok) return null;

    const data = await response.json();
    if (data?.status !== 'success') return null;

    return {
      country: data.country || '',
      region: data.regionName || '',
      city: data.city || '',
      isp: data.isp || ''
    };
  } catch (_) {
    return null; // Location is best-effort; never block auth on it.
  }
};
