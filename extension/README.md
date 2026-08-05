# FastApply Chrome Extension

FastApply contains three Vite/React extension pages (dashboard, popup, and side panel), Manifest V3 content scripts, deterministic ATS engines, and a shared manual Agent 2 controller.

## Development

1. Copy the repository `.env.example` values into `backend/.env` and provide real credentials locally.
2. Start the API:

   ```powershell
   cd backend
   npm install
   npm run dev
   ```

3. Build the extension:

   ```powershell
   cd extension
   npm ci
   npm run build
   ```

4. Open `chrome://extensions`, enable Developer mode, and load `extension/dist` as an unpacked extension.
5. After changing a content script or `manifest.json`, rebuild, reload FastApply in `chrome://extensions`, and reload every open job page.

The default API is `http://localhost:5000`. A production dashboard build can set `VITE_API_BASE_URL` and `VITE_FRONTEND_URL`. The service worker can also read an `apiBaseUrl` value from `chrome.storage.local`.

## Application workflow

Dedicated ATS engines perform deterministic autofill only. The side panel's **Scan Current Page** action rescans the current URL and live DOM. **Fill Missing with Agent 2** performs another fresh scan, sends exact field types/options to the backend, applies answers without submitting, verifies dropdown selections, and synchronizes the final applied values to the saved application.
