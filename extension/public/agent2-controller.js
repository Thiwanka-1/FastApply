console.log("[FastApply] Manual Agent 2 Controller Active.");

(() => {
  const U = window.FastApplyUtils;

  if (!U) {
    console.error(
      "[FastApply] FastApplyUtils must load before agent2-controller.js."
    );
    return;
  }

  let configuration = null;
  let latestScan = null;
  let currentApplicationId = "";
  let agent2InFlight = false;

  const delay = milliseconds => {
    return new Promise(resolve => {
      window.setTimeout(resolve, milliseconds);
    });
  };

  const cleanText = value => {
    return String(value ?? "")
      .replace(/\s+/g, " ")
      .trim();
  };

  const readStorage = keys => {
    return new Promise(resolve => {
      chrome.storage.local.get(keys, values => {
        resolve(values || {});
      });
    });
  };

  const writeStorage = values => {
    return new Promise(resolve => {
      chrome.storage.local.set(values, resolve);
    });
  };

  const sendBackgroundMessage = request => {
    return new Promise(resolve => {
      chrome.runtime.sendMessage(request, response => {
        if (chrome.runtime.lastError) {
          resolve({
            success: false,
            error: chrome.runtime.lastError.message
          });
          return;
        }

        resolve(
          response || {
            success: false,
            error: "No response received from the background service."
          }
        );
      });
    });
  };

  const extractText = selectors => {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      const text = cleanText(
        element?.innerText ||
        element?.textContent ||
        element?.getAttribute?.("content")
      );

      if (text) return text;
    }

    return "";
  };

  const extractDefaultJobContext = () => {
    const metaTitle =
      document
        .querySelector('meta[property="og:title"]')
        ?.getAttribute("content") || "";

    const company =
      document
        .querySelector('meta[property="og:site_name"]')
        ?.getAttribute("content") ||
      extractText([
        '[data-testid*="company"]',
        '[data-test*="company"]',
        '[class*="company-name"]',
        '[class*="company"]'
      ]);

    const jobTitle =
      extractText([
        "h1",
        '[data-testid*="job-title"]',
        '[class*="job-title"]'
      ]) ||
      cleanText(metaTitle) ||
      cleanText(document.title);

    const location = extractText([
      '[data-testid*="location"]',
      '[data-test*="location"]',
      '[class*="job-location"]',
      '[class*="location"]',
      '[id*="location"]'
    ]).slice(0, 500);

    const descriptionRoot =
      document.querySelector(
        "main, article, [class*='job-description'], [id*='job-description']"
      ) ||
      document.body;

    const description = cleanText(
      descriptionRoot?.innerText
    ).slice(0, 30000);

    return {
      company: cleanText(company).slice(0, 300),
      jobTitle: cleanText(jobTitle).slice(0, 300),
      jobUrl: window.location.href,
      location,
      description,
      companyDescription: "",
      responsibilities: [],
      requirements: [],
      preferredQualifications: []
    };
  };

  const buildPageIdentity = jobContext => {
    return JSON.stringify({
      url: window.location.href,
      company: cleanText(jobContext?.company).toLowerCase(),
      jobTitle: cleanText(jobContext?.jobTitle).toLowerCase()
    });
  };

  const countDeterministicFields = () => {
    return document.querySelectorAll(
      '[data-fa_filled="true"]:not([data-fa_agent_filled="true"])'
    ).length;
  };

  const resetPreviousUnresolvedMarkers = () => {
    document
      .querySelectorAll(
        '[data-fa_agent_processed="true"]:not([data-fa_agent_filled="true"])'
      )
      .forEach(element => {
        delete element.dataset.fa_agent_processed;
        delete element.dataset.fa_agent_state;
        delete element.dataset.fa_agent_reason;

        try {
          element.style.removeProperty("border");
          element.style.removeProperty("background-color");
        } catch (_) {}
      });
  };

  const getProfile = async () => {
    const stored = await readStorage([
      "autofillEnabled",
      "profileData"
    ]);

    if (stored.autofillEnabled === false) {
      throw new Error(
        "Autofill is disabled. Enable it from the FastApply popup."
      );
    }

    if (stored.profileData) {
      return stored.profileData;
    }

    const response = await sendBackgroundMessage({
      action: "FETCH_PROFILE_DATA"
    });

    if (!response?.success) {
      throw new Error(
        response?.error ||
        "An authenticated FastApply profile is unavailable."
      );
    }

    return response.data;
  };

  const collectFields = async () => {
    if (
      typeof configuration?.collectFields === "function"
    ) {
      const customFields =
        await configuration.collectFields();

      return Array.isArray(customFields)
        ? customFields
        : [];
    }

    return U.collectUnresolvedFields();
  };

  const applyAnswers = async answers => {
    if (
      typeof configuration?.applyAnswers === "function"
    ) {
      return configuration.applyAnswers(
        Array.isArray(answers) ? answers : []
      );
    }

    return U.applyAgentAnswers(
      Array.isArray(answers) ? answers : []
    );
  };

  const getJobContext = () => {
    if (
      typeof configuration?.extractJobContext === "function"
    ) {
      return configuration.extractJobContext();
    }

    return extractDefaultJobContext();
  };

  const scanPage = async () => {
    if (!configuration) {
      return {
        success: false,
        error:
          "The FastApply engine has not registered this page yet."
      };
    }

    try {
      const profile = await getProfile();

      if (
        typeof configuration.runDeterministic === "function"
      ) {
        await configuration.runDeterministic(profile);
      }

      await delay(400);

      resetPreviousUnresolvedMarkers();

      const jobContext = getJobContext();
      const pageIdentity =
        buildPageIdentity(jobContext);

      if (
        latestScan &&
        latestScan.pageIdentity !== pageIdentity
      ) {
        currentApplicationId = "";
      }

      const fields = await collectFields();
      const scriptFilled =
        countDeterministicFields();

      latestScan = {
        scanId: `scan_${Date.now()}`,
        pageIdentity,
        pageUrl: window.location.href,
        pageTitle: cleanText(document.title),
        atsPlatform:
          configuration.atsPlatform ||
          "generic",
        jobContext,
        totalFields:
          scriptFilled + fields.length,
        scriptFilled,
        missingFields: fields.length,
        fields,
        scannedAt: new Date().toISOString()
      };

      const runState = {
        status: "scanned",
        applicationId:
          currentApplicationId,
        pageUrl: latestScan.pageUrl,
        atsPlatform:
          latestScan.atsPlatform,
        company:
          jobContext.company || "",
        jobTitle:
          jobContext.jobTitle || "",
        totalFields:
          latestScan.totalFields,
        scriptFilled,
        requestedFields:
          fields.length,
        answered: 0,
        reviewRequired: 0,
        unresolved:
          fields.length,
        error: "",
        updatedAt:
          new Date().toISOString()
      };

      await writeStorage({
        lastPageScan: latestScan,
        agent2RunState: runState
      });

      return {
        success: true,
        data: latestScan
      };
    } catch (error) {
      const errorMessage =
        error?.message ||
        "The page scan failed.";

      await writeStorage({
        agent2RunState: {
          status: "failed",
          error: errorMessage,
          pageUrl: window.location.href,
          updatedAt:
            new Date().toISOString()
        }
      });

      return {
        success: false,
        error: errorMessage
      };
    }
  };

  const runAgent2 = async () => {
    if (agent2InFlight) {
      return {
        success: false,
        error: "Agent 2 is already processing this page."
      };
    }

    /*
     * Always perform a fresh scan first. This is important
     * for Greenhouse and other single-page application sites
     * where the URL or form can change without a full reload.
     */
    const scanResponse = await scanPage();

    if (!scanResponse.success) {
      return scanResponse;
    }

    const scan = scanResponse.data;

    if (scan.fields.length === 0) {
      const summary = {
        applicationId:
          currentApplicationId,
        status: "complete",
        pageUrl: scan.pageUrl,
        atsPlatform:
          scan.atsPlatform,
        company:
          scan.jobContext.company || "",
        jobTitle:
          scan.jobContext.jobTitle || "",
        totalFields:
          scan.totalFields,
        scriptFilled:
          scan.scriptFilled,
        requestedFields: 0,
        answered: 0,
        reviewRequired: 0,
        unresolved: 0,
        updatedAt:
          new Date().toISOString()
      };

      await writeStorage({
        lastAgent2Summary: summary,
        agent2RunState: {
          ...summary,
          error: ""
        }
      });

      return {
        success: true,
        data: {
          result: null,
          summary,
          scan
        }
      };
    }

    agent2InFlight = true;

    const startedAt =
      new Date().toISOString();

    await writeStorage({
      agent2RunState: {
        status: "analysing",
        applicationId:
          currentApplicationId,
        pageUrl: scan.pageUrl,
        atsPlatform:
          scan.atsPlatform,
        company:
          scan.jobContext.company || "",
        jobTitle:
          scan.jobContext.jobTitle || "",
        totalFields:
          scan.totalFields,
        scriptFilled:
          scan.scriptFilled,
        requestedFields:
          scan.fields.length,
        answered: 0,
        reviewRequired: 0,
        unresolved:
          scan.fields.length,
        error: "",
        startedAt,
        updatedAt:
          new Date().toISOString()
      }
    });

    try {
      const payload = {
        ...(currentApplicationId
          ? {
              applicationId:
                currentApplicationId
            }
          : {}),
        atsPlatform:
          scan.atsPlatform,
        jobContext:
          scan.jobContext,
        scriptStats: {
          totalFields:
            scan.totalFields,
          scriptFilled:
            scan.scriptFilled
        },
        fields:
          scan.fields
      };

      const response =
        await sendBackgroundMessage({
          action:
            "ANSWER_APPLICATION_FIELDS",
          payload
        });

      if (!response?.success) {
        throw new Error(
          response?.error ||
          "Agent 2 could not analyse the missing fields."
        );
      }

      currentApplicationId =
        response.data?.applicationId ||
        currentApplicationId;

      const appliedSummary =
        await applyAnswers(
          response.data?.answers || []
        );

      const completedAt =
        new Date().toISOString();

      const enrichedResult = {
        ...response.data,
        applicationId:
          currentApplicationId,
        pageUrl:
          scan.pageUrl,
        atsPlatform:
          scan.atsPlatform,
        scriptFilled:
          scan.scriptFilled,
        appliedFields:
          appliedSummary.answered,
        reviewRequiredFields:
          appliedSummary.reviewRequired,
        unresolvedAfterApply:
          appliedSummary.unresolved,
        completedAt
      };

      const summary = {
        applicationId:
          currentApplicationId,
        status:
          response.data?.status ||
          "ready_for_review",
        pageUrl:
          scan.pageUrl,
        atsPlatform:
          scan.atsPlatform,
        company:
          response.data?.jobContext
            ?.company ||
          scan.jobContext.company ||
          "",
        jobTitle:
          response.data?.jobContext
            ?.jobTitle ||
          scan.jobContext.jobTitle ||
          "",
        totalFields:
          scan.totalFields,
        scriptFilled:
          scan.scriptFilled,
        requestedFields:
          scan.fields.length,
        answered:
          appliedSummary.answered,
        reviewRequired:
          appliedSummary.reviewRequired,
        unresolved:
          appliedSummary.unresolved,
        startedAt,
        updatedAt:
          completedAt
      };

      await writeStorage({
        lastApplicationId:
          currentApplicationId,
        lastAgent2Result:
          enrichedResult,
        lastAgent2Summary:
          summary,
        agent2RunState: {
          status: "complete",
          ...summary,
          error: "",
          completedAt
        }
      });

      return {
        success: true,
        data: {
          result:
            enrichedResult,
          summary,
          scan
        }
      };
    } catch (error) {
      const errorMessage =
        error?.message ||
        "Agent 2 failed unexpectedly.";

      await writeStorage({
        agent2RunState: {
          status: "failed",
          applicationId:
            currentApplicationId,
          pageUrl:
            latestScan?.pageUrl ||
            window.location.href,
          atsPlatform:
            configuration.atsPlatform ||
            "generic",
          company:
            latestScan?.jobContext
              ?.company || "",
          jobTitle:
            latestScan?.jobContext
              ?.jobTitle || "",
          totalFields:
            latestScan?.totalFields || 0,
          scriptFilled:
            latestScan?.scriptFilled || 0,
          requestedFields:
            latestScan?.fields?.length || 0,
          answered: 0,
          reviewRequired: 0,
          unresolved:
            latestScan?.fields?.length || 0,
          error:
            errorMessage,
          startedAt,
          completedAt:
            new Date().toISOString(),
          updatedAt:
            new Date().toISOString()
        }
      });

      return {
        success: false,
        error: errorMessage
      };
    } finally {
      agent2InFlight = false;
    }
  };

  const getPageState = () => {
    return {
      success: true,
      data: {
        registered:
          Boolean(configuration),
        atsPlatform:
          configuration?.atsPlatform ||
          "",
        pageUrl:
          window.location.href,
        scan:
          latestScan,
        agent2InFlight
      }
    };
  };

  const register = options => {
    configuration = {
      atsPlatform:
        options?.atsPlatform ||
        "generic",
      runDeterministic:
        options?.runDeterministic,
      collectFields:
        options?.collectFields,
      applyAnswers:
        options?.applyAnswers,
      extractJobContext:
        options?.extractJobContext
    };

    console.log(
      `[FastApply] Manual Agent 2 registered for ${configuration.atsPlatform}.`
    );
  };

  chrome.runtime.onMessage.addListener(
    (request, sender, sendResponse) => {
      if (
        request?.action ===
        "FASTAPPLY_SCAN_PAGE"
      ) {
        scanPage().then(sendResponse);
        return true;
      }

      if (
        request?.action ===
        "FASTAPPLY_RUN_AGENT2"
      ) {
        runAgent2().then(sendResponse);
        return true;
      }

      if (
        request?.action ===
        "FASTAPPLY_GET_PAGE_STATE"
      ) {
        sendResponse(getPageState());
        return false;
      }

      return false;
    }
  );

  window.FastApplyAgent2Controller = {
    register,
    scanPage,
    runAgent2,
    getPageState
  };
})();