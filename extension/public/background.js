// public/background.js
console.log("[FastApply] Background Service Worker Active.");

const API_URL = "http://localhost:5000";

const fetchProfileData = async () => {
  try {
    const response = await fetch(`${API_URL}/api/profile`, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
      },
    });

    let data = null;

    try {
      data = await response.json();
    } catch (jsonError) {
      data = null;
    }

    if (!response.ok) {
      return {
        success: false,
        error:
          data?.message ||
          data?.error ||
          `Request failed with status ${response.status}`,
      };
    }

    return {
      success: true,
      data,
    };
  } catch (error) {
    console.error("[FastApply] Background Error:", error);
    return {
      success: false,
      error: error?.message || "Failed to fetch profile data",
    };
  }
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request || !request.action) {
    sendResponse({
      success: false,
      error: "Invalid request",
    });
    return false;
  }

  if (request.action === "FETCH_PROFILE_DATA") {
    (async () => {
      const result = await fetchProfileData();
      sendResponse(result);
    })();

    return true;
  }

  sendResponse({
    success: false,
    error: `Unknown action: ${request.action}`,
  });
  return false;
});