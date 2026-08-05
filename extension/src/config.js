export const API_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  'http://localhost:5000'
).replace(/\/$/, '');

export const DASHBOARD_URL = (
  import.meta.env.VITE_FRONTEND_URL ||
  globalThis.chrome?.runtime?.getURL?.('index.html') ||
  'http://localhost:5173'
).replace(/\/$/, '');
