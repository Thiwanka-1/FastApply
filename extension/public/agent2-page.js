console.log("[FastApply] Agent 2 Page Controller Loaded.");

(() => {
  if (window.top !== window) {
    window.FastApplyAgent2 = {
      register: () => null
    };

    return;
  }

  const U = window.FastApplyUtils;

  if (!U) {
    console.error(
      "[FastApply] Agent 2 controller requires utils.js."
    );

    return;
  }

  const delay = milliseconds => {
    return new Promise(resolve => {
      window.setTimeout(resolve, milliseconds);
    });
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

  const sendRuntimeMessage = request => {
    return new Promise(resolve => {
      chrome.runtime.sendMessage(
        request,
        response => {
          if (chrome.runtime.lastError) {
            resolve({
              success: false,
              error:
                chrome.runtime.lastError.message
            });

            return;
          }

          resolve(
            response || {
              success: false,
              error:
                "No background response received."
            }
          );
        }
      );
    });
  };

  const cleanText = value => {
    return typeof value === "string"
      ? value.trim()
      : "";
  };

  const sanitizeField = field => {
    return {
      fieldId: field.fieldId,
      label: field.label,
      type: field.type,
      required: field.required === true,
      options: Array.isArray(field.options)
        ? field.options
        : [],
      currentValue:
        field.currentValue ?? "",
      maxLength:
        Number.isFinite(field.maxLength)
          ? field.maxLength
          : null
    };
  };

  const register = configuration => {
    const config = configuration || {};

    const atsPlatform =
      cleanText(config.atsPlatform) ||
      "generic";

    let currentApplicationId = "";
    let lastScan = null;
    let requestInFlight = false;

    const setControlState = async state => {
      await writeStorage({
        agent2ControlState: {
          atsPlatform,
          ...state,
          updatedAt:
            new Date().toISOString()
        }
      });
    };

    const getScanRoot = () => {
      const configuredRoot =
        config.getScanRoot?.();

      if (
        configuredRoot &&
        configuredRoot.querySelectorAll
      ) {
        return configuredRoot;
      }

      return document;
    };

    const extractJobContext = () => {
      const context =
        config.extractJobContext?.() || {};

      return {
        company:
          cleanText(context.company)
            .slice(0, 300),

        jobTitle:
          cleanText(context.jobTitle)
            .slice(0, 300),

        jobUrl: window.location.href,

        location:
          cleanText(context.location)
            .slice(0, 500),

        description:
          cleanText(context.description)
            .slice(0, 30000),

        companyDescription:
          cleanText(
            context.companyDescription
          ).slice(0, 10000),

        responsibilities:
          Array.isArray(
            context.responsibilities
          )
            ? context.responsibilities
            : [],

        requirements:
          Array.isArray(
            context.requirements
          )
            ? context.requirements
            : [],

        preferredQualifications:
          Array.isArray(
            context.preferredQualifications
          )
            ? context.preferredQualifications
            : []
      };
    };

    const scanCurrentPage = async options => {
      const internal =
        options?.internal === true;

      if (requestInFlight && !internal) {
        return {
          success: false,
          error:
            "Another FastApply operation is already running."
        };
      }

      const pageUrl =
        window.location.href;

      if (
        lastScan &&
        lastScan.pageUrl !== pageUrl
      ) {
        currentApplicationId = "";
      }

      await setControlState({
        status: "scanning",
        pageUrl,
        applicationId:
          currentApplicationId,
        error: ""
      });

      try {
        await config.runDeterministic?.();

        await delay(
          Number(config.settleMs) || 800
        );

        const root = getScanRoot();

        U.resetAgentScanState(root);

        const fields =
          U.collectUnresolvedFields(root);

        const deterministicFilled =
          root.querySelectorAll(
            '[data-fa_filled="true"]:not([data-fa_agent_filled="true"])'
          ).length;

        const jobContext =
          extractJobContext();

        lastScan = {
          pageUrl,
          atsPlatform,
          jobContext,
          deterministicFilled,
          totalFields:
            deterministicFilled +
            fields.length,
          fields
        };

        const publicScan = {
          pageUrl,
          atsPlatform,
          jobContext,
          deterministicFilled,
          totalFields:
            deterministicFilled +
            fields.length,
          unresolvedCount:
            fields.length,
          fields:
            fields.map(sanitizeField),
          scannedAt:
            new Date().toISOString()
        };

        await writeStorage({
          lastPageScan: publicScan
        });

        await setControlState({
          status: "scanned",
          pageUrl,
          applicationId:
            currentApplicationId,
          company:
            jobContext.company,
          jobTitle:
            jobContext.jobTitle,
          deterministicFilled,
          totalFields:
            publicScan.totalFields,
          unresolved:
            publicScan.unresolvedCount,
          error: ""
        });

        return {
          success: true,
          data: publicScan
        };
      } catch (error) {
        const errorMessage =
          error?.message ||
          "Page scan failed.";

        await setControlState({
          status: "failed",
          pageUrl,
          applicationId:
            currentApplicationId,
          error: errorMessage
        });

        return {
          success: false,
          error: errorMessage
        };
      }
    };

    const fillMissingFields = async () => {
      if (requestInFlight) {
        return {
          success: false,
          error:
            "Agent 2 is already running."
        };
      }

      if (
        !lastScan ||
        lastScan.pageUrl !==
          window.location.href
      ) {
        return {
          success: false,
          error:
            "Scan the current page before running Agent 2."
        };
      }

      requestInFlight = true;

      try {
        /*
         * Scan again immediately before AI execution.
         * This prevents Agent 2 from overwriting fields
         * the user manually completed after the first scan.
         */
        const scanResult =
          await scanCurrentPage({
            internal: true
          });

        if (!scanResult.success) {
          return scanResult;
        }

        const fields =
          lastScan?.fields || [];

        if (fields.length === 0) {
          await setControlState({
            status: "complete",
            pageUrl:
              window.location.href,
            applicationId:
              currentApplicationId,
            company:
              lastScan.jobContext.company,
            jobTitle:
              lastScan.jobContext.jobTitle,
            deterministicFilled:
              lastScan.deterministicFilled,
            totalFields:
              lastScan.totalFields,
            requestedFields: 0,
            answered: 0,
            reviewRequired: 0,
            unresolved: 0,
            error: "",
            message:
              "No missing fields remain."
          });

          return {
            success: true,
            data: {
              applicationId:
                currentApplicationId,
              answers: [],
              summary: {
                answered: 0,
                reviewRequired: 0,
                unresolved: 0
              }
            }
          };
        }

        const payload = {
          ...(currentApplicationId
            ? {
                applicationId:
                  currentApplicationId
              }
            : {}),

          atsPlatform,

          jobContext:
            lastScan.jobContext,

          scriptStats: {
            totalFields:
              lastScan.totalFields,

            scriptFilled:
              lastScan.deterministicFilled
          },

          fields
        };

        await setControlState({
          status: "analysing",
          pageUrl:
            window.location.href,
          applicationId:
            currentApplicationId,
          company:
            lastScan.jobContext.company,
          jobTitle:
            lastScan.jobContext.jobTitle,
          deterministicFilled:
            lastScan.deterministicFilled,
          totalFields:
            lastScan.totalFields,
          requestedFields:
            fields.length,
          answered: 0,
          reviewRequired: 0,
          unresolved:
            fields.length,
          error: "",
          startedAt:
            new Date().toISOString()
        });

        const response =
          await sendRuntimeMessage({
            action:
              "ANSWER_APPLICATION_FIELDS",
            payload
          });

        if (!response?.success) {
          const errorMessage =
            response?.error ||
            "Agent 2 request failed.";

          await setControlState({
            status: "failed",
            pageUrl:
              window.location.href,
            applicationId:
              currentApplicationId,
            company:
              lastScan.jobContext.company,
            jobTitle:
              lastScan.jobContext.jobTitle,
            deterministicFilled:
              lastScan.deterministicFilled,
            totalFields:
              lastScan.totalFields,
            requestedFields:
              fields.length,
            answered: 0,
            reviewRequired: 0,
            unresolved:
              fields.length,
            error: errorMessage,
            completedAt:
              new Date().toISOString()
          });

          return {
            success: false,
            error: errorMessage
          };
        }

        currentApplicationId =
          response.data?.applicationId ||
          "";

        const answers =
          Array.isArray(
            response.data?.answers
          )
            ? response.data.answers
            : [];

        const summary =
          U.applyAgentAnswers(answers);

        const resultSummary = {
          atsPlatform,
          applicationId:
            currentApplicationId,
          status:
            response.data?.status ||
            "ready_for_review",
          pageUrl:
            window.location.href,
          company:
            response.data?.jobContext
              ?.company ||
            lastScan.jobContext.company,
          jobTitle:
            response.data?.jobContext
              ?.jobTitle ||
            lastScan.jobContext.jobTitle,
          deterministicFilled:
            lastScan.deterministicFilled,
          totalFields:
            lastScan.totalFields,
          requestedFields:
            fields.length,
          answered:
            summary.answered,
          reviewRequired:
            summary.reviewRequired,
          unresolved:
            summary.unresolved,
          updatedAt:
            new Date().toISOString()
        };

        await writeStorage({
          lastAgent2Summary:
            resultSummary
        });

        await setControlState({
          status: "complete",
          ...resultSummary,
          error: "",
          completedAt:
            new Date().toISOString()
        });

        return {
          success: true,
          data: {
            ...response.data,
            summary
          }
        };
      } catch (error) {
        const errorMessage =
          error?.message ||
          "Unexpected Agent 2 failure.";

        await setControlState({
          status: "failed",
          pageUrl:
            window.location.href,
          applicationId:
            currentApplicationId,
          error: errorMessage,
          completedAt:
            new Date().toISOString()
        });

        return {
          success: false,
          error: errorMessage
        };
      } finally {
        requestInFlight = false;
      }
    };

    chrome.runtime.onMessage.addListener(
      (
        request,
        sender,
        sendResponse
      ) => {
        if (
          request?.action ===
          "FASTAPPLY_SCAN_PAGE"
        ) {
          scanCurrentPage()
            .then(sendResponse);

          return true;
        }

        if (
          request?.action ===
          "FASTAPPLY_FILL_MISSING"
        ) {
          fillMissingFields()
            .then(sendResponse);

          return true;
        }

        if (
          request?.action ===
          "FASTAPPLY_GET_PAGE_STATE"
        ) {
          sendResponse({
            success: true,
            data: {
              pageUrl:
                window.location.href,
              requestInFlight,
              hasCurrentScan:
                lastScan?.pageUrl ===
                window.location.href
            }
          });

          return false;
        }

        return false;
      }
    );

    return {
      scanCurrentPage,
      fillMissingFields
    };
  };

  window.FastApplyAgent2 = {
    register
  };
})();