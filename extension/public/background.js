// public/background.js
console.log("[FastApply] Background Service Worker Active.");
const API_URL = "http://localhost:5000";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "FETCH_PROFILE_DATA") {
    fetch(`${API_URL}/api/profile`, {
      method: "GET",
      credentials: "include" 
    })
      .then(response => {
        if (!response.ok) throw new Error("Not logged in");
        return response.json();
      })
      .then(data => {
        sendResponse({ success: true, data: data });
      })
      .catch(error => {
        console.error("[FastApply] Background Error:", error);
        sendResponse({ success: false, error: error.message });
      });

    return true; // Keep message channel open for async response
  }
});