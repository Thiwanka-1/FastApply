//background.js
console.log("[FastApply] Background Service Worker Active.");

const API_URL = "http://localhost:5000";

const readJsonResponse = async response => {
  try {
    return await response.json();
  } catch (_) {
    return null;
  }
};

const apiRequest = async (path, options = {}) => {
  const { method = "GET", body } = options;

  try {
    const response = await fetch(`${API_URL}${path}`, {
      method,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(body !== undefined
          ? { "Content-Type": "application/json" }
          : {})
      },
      ...(body !== undefined
        ? { body: JSON.stringify(body) }
        : {})
    });

    const data = await readJsonResponse(response);

    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        error:
          data?.message ||
          data?.error ||
          `Request failed with status ${response.status}`
      };
    }

    return {
      success: true,
      status: response.status,
      data
    };
  } catch (error) {
    console.error("[FastApply] API Error:", error);

    return {
      success: false,
      status: 0,
      error: error?.message || "Backend request failed"
    };
  }
};

const fetchProfileData = async () => {
  const result = await apiRequest("/api/profile");

  if (result.success) {
    chrome.storage.local.set({
      profileData: result.data,
      profileFetchedAt: new Date().toISOString()
    });
  }

  return result;
};

const answerApplicationFields = async payload => {
  if (!payload || !Array.isArray(payload.fields)) {
    return {
      success: false,
      error: "Agent 2 payload must contain a fields array"
    };
  }

  if (payload.fields.length === 0) {
    return {
      success: false,
      error: "No unresolved fields were provided"
    };
  }

  const result = await apiRequest(
    "/api/profile/answer-questions",
    {
      method: "POST",
      body: payload
    }
  );

  if (result.success) {
    chrome.storage.local.set({
      lastAgent2Result: result.data,
      lastApplicationId: result.data?.applicationId || "",
      lastAgent2At: new Date().toISOString()
    });
  }

  return result;
};

chrome.runtime.onMessage.addListener(
  (request, sender, sendResponse) => {
    if (!request?.action) {
      sendResponse({
        success: false,
        error: "Invalid request"
      });

      return false;
    }

    (async () => {
      switch (request.action) {
        case "FETCH_PROFILE_DATA":
          sendResponse(await fetchProfileData());
          break;

        case "ANSWER_APPLICATION_FIELDS":
          sendResponse(
            await answerApplicationFields(request.payload)
          );
          break;

        default:
          sendResponse({
            success: false,
            error: `Unknown action: ${request.action}`
          });
      }
    })();

    return true;
  }
);