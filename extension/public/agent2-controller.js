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
  const semanticAgentFields = new Map();

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
    return U.queryAgentElements(
      document,
      '[data-fa_filled="true"]:not([data-fa_agent_filled="true"])'
    ).length;
  };

  const resetPreviousUnresolvedMarkers = () => {
    U.queryAgentElements(
      document,
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

  const waitForDeterministicDropdowns = async () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const pending = U.queryAgentElements(
        document,
        '[data-fa_dropdown_processing="true"]'
      );

      if (pending.length === 0) return;
      await delay(100);
    }
  };

  const normalizeText = value => {
    return cleanText(value)
      .toLowerCase()
      .replace(/[â€™']/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  };

  const hashText = value => {
    const text = String(value ?? "");
    let hash = 0;

    for (let index = 0; index < text.length; index += 1) {
      hash = ((hash << 5) - hash) + text.charCodeAt(index);
      hash |= 0;
    }

    return Math.abs(hash).toString(36);
  };

  const isVisible = element => {
    if (!element?.isConnected) return false;

    const style = window.getComputedStyle(element);
    const rectangle = element.getBoundingClientRect();

    return style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity) !== 0 &&
      rectangle.width > 0 &&
      rectangle.height > 0;
  };

  const getSemanticWrapper = control => {
    return control?.closest?.(
      [
        "fieldset",
        '[role="group"]',
        '[data-testid*="field"]',
        '[class*="field"]',
        '[class*="question"]',
        '[class*="form-group"]',
        "label"
      ].join(",")
    ) || control?.parentElement || null;
  };

  const getSemanticLabel = (control, wrapper) => {
    const label = wrapper?.querySelector?.(
      "label, legend, [data-testid*='label'], [class*='label']"
    );

    return cleanText(
      label?.innerText ||
      label?.textContent ||
      U.getLabelText(control)
    );
  };

  const getSemanticCurrentValue = (control, wrapper) => {
    const selectedText = Array.from(
      wrapper?.querySelectorAll?.(
        [
          '[aria-selected="true"]',
          '[class*="singleValue"]',
          '[class*="single-value"]',
          '[class*="multiValue"]',
          '[class*="multi-value"]',
          '[data-testid*="selected"]'
        ].join(",")
      ) || []
    )
      .map(element => cleanText(element.innerText || element.textContent))
      .filter(Boolean)
      .join(", ");

    if (selectedText) return selectedText;

    if (control?.tagName === "INPUT") {
      return cleanText(control.value);
    }

    const controlText = cleanText(
      control?.innerText || control?.textContent
    );
    const label = getSemanticLabel(control, wrapper);

    return controlText
      .replace(label, "")
      .replace(/\b(select|choose)\b\s*\.{0,3}/gi, "")
      .trim();
  };

  const openSemanticDropdown = control => {
    if (!control) return;

    if (control.getAttribute("aria-expanded") !== "true") {
      control.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          cancelable: true,
          view: window
        })
      );
      control.dispatchEvent(
        new MouseEvent("mouseup", {
          bubbles: true,
          cancelable: true,
          view: window
        })
      );
      control.click();
    }
  };

  const getSemanticListbox = control => {
    const ids = [
      control?.getAttribute("aria-controls"),
      control?.getAttribute("aria-owns")
    ].filter(Boolean);

    const queryRoot = control?.getRootNode?.() || document;

    for (const id of ids) {
      const listbox = queryRoot.getElementById?.(id) ||
        document.getElementById(id);

      if (listbox) return listbox;
    }

    const visibleListboxes = U.queryAgentElements(
      document,
      '[role="listbox"], [id*="-listbox"], [class*="menu-list"]'
    ).filter(isVisible);

    return visibleListboxes[visibleListboxes.length - 1] || null;
  };

  const getSemanticOptions = listbox => {
    if (!listbox) return [];

    return U.queryAgentElements(
      listbox,
      '[role="option"], [id*="-option"], [class*="-option"]'
    ).filter(isVisible);
  };

  const getSemanticScrollContainer = listbox => {
    if (!listbox) return null;

    return [
      listbox,
      ...U.queryAgentElements(listbox, "*")
    ]
      .filter(element => {
        return element.scrollHeight > element.clientHeight + 2;
      })
      .sort((first, second) => {
        return (
          second.scrollHeight - second.clientHeight
        ) - (
          first.scrollHeight - first.clientHeight
        );
      })[0] || listbox;
  };

  const closeSemanticDropdown = control => {
    control?.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        code: "Escape",
        bubbles: true
      })
    );
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        code: "Escape",
        bubbles: true
      })
    );
  };

  const collectSemanticOptions = async listbox => {
    const labels = new Set();
    const scrollContainer = getSemanticScrollContainer(listbox);

    const collect = () => {
      getSemanticOptions(listbox).forEach(option => {
        const label = cleanText(option.innerText || option.textContent);
        if (label && normalizeText(label) !== "select") labels.add(label);
      });
    };

    collect();
    if (!scrollContainer) return [...labels];

    const originalScrollTop = scrollContainer.scrollTop;
    scrollContainer.scrollTop = 0;
    scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }));
    await delay(60);

    let unchangedPasses = 0;
    let previousTop = -1;
    let previousCount = -1;

    for (let attempt = 0; attempt < 100; attempt += 1) {
      collect();

      const atBottom = scrollContainer.scrollTop +
        scrollContainer.clientHeight >= scrollContainer.scrollHeight - 2;

      if (atBottom) break;

      scrollContainer.scrollTop = Math.min(
        scrollContainer.scrollHeight,
        scrollContainer.scrollTop + Math.max(
          120,
          scrollContainer.clientHeight * 0.8
        )
      );
      scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }));
      await delay(60);

      if (
        scrollContainer.scrollTop === previousTop &&
        labels.size === previousCount
      ) {
        unchangedPasses += 1;
      } else {
        unchangedPasses = 0;
      }

      if (unchangedPasses >= 2) break;

      previousTop = scrollContainer.scrollTop;
      previousCount = labels.size;
    }

    collect();
    scrollContainer.scrollTop = originalScrollTop;
    scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }));

    return [...labels];
  };

  const getSemanticControls = () => {
    const controls = U.queryAgentElements(
      document,
      [
        'input[role="combobox"]',
        'input[aria-haspopup="listbox"]',
        '[role="combobox"]',
        '[aria-haspopup="listbox"]'
      ].join(",")
    ).filter(control => {
      return isVisible(control) &&
        !control.disabled &&
        control.tagName !== "SELECT";
    });

    return controls.filter(control => {
      return !controls.some(other => {
        return other !== control &&
          control.contains?.(other) &&
          other.tagName === "INPUT";
      });
    });
  };

  const collectSemanticFields = async () => {
    semanticAgentFields.clear();
    const fields = [];
    const seen = new Set();

    for (const control of getSemanticControls()) {
      const wrapper = getSemanticWrapper(control);
      const label = getSemanticLabel(control, wrapper);

      control.dataset.fa_agent_processed = "true";

      if (!wrapper || !label || getSemanticCurrentValue(control, wrapper)) {
        continue;
      }

      const identity = `${normalizeText(label)}|select`;
      if (seen.has(identity)) continue;

      openSemanticDropdown(control);
      await delay(180);

      const listbox = getSemanticListbox(control);
      const options = await collectSemanticOptions(listbox);
      closeSemanticDropdown(control);
      await delay(60);

      if (options.length === 0) continue;

      const fieldId = `fa_semantic_select_${hashText([
        window.location.pathname,
        control.id || "",
        control.getAttribute("name") || "",
        label
      ].join("|"))}`;

      const multiple =
        listbox?.getAttribute("aria-multiselectable") === "true" ||
        /\ball that apply\b|\bselect all\b|\bchoose all\b/i.test(label);

      semanticAgentFields.set(fieldId, {
        control,
        wrapper,
        label,
        options,
        multiple
      });

      fields.push({
        fieldId,
        label,
        type: "select",
        required:
          control.required === true ||
          control.getAttribute("aria-required") === "true" ||
          label.includes("*"),
        options,
        currentValue: "",
        maxLength: null
      });
      seen.add(identity);
    }

    return fields;
  };

  const collectDefaultFields = async () => {
    const semanticFields = await collectSemanticFields();
    const semanticLabels = new Set(
      semanticFields.map(field => normalizeText(field.label))
    );

    const standardFields = U.collectUnresolvedFields().filter(field => {
      return !semanticLabels.has(normalizeText(field.label));
    });

    const unique = new Map();

    [...standardFields, ...semanticFields].forEach(field => {
      const key = `${normalizeText(field.label)}|${field.type}`;
      const existing = unique.get(key);

      if (
        !existing ||
        field.fieldId.startsWith("fa_semantic_select_")
      ) {
        unique.set(key, field);
      }
    });

    return [...unique.values()];
  };

  const findSemanticOption = async (field, target) => {
    openSemanticDropdown(field.control);
    await delay(180);

    const listbox = getSemanticListbox(field.control);
    const scrollContainer = getSemanticScrollContainer(listbox);
    const normalizedTarget = normalizeText(target);

    const findRendered = () => {
      return getSemanticOptions(listbox).find(option => {
        return normalizeText(option.innerText || option.textContent) ===
          normalizedTarget;
      }) || null;
    };

    let match = findRendered();
    if (match || !scrollContainer) return match;

    scrollContainer.scrollTop = 0;
    scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }));
    await delay(60);

    let previousTop = -1;

    for (let attempt = 0; attempt < 100; attempt += 1) {
      match = findRendered();
      if (match) return match;

      const atBottom = scrollContainer.scrollTop +
        scrollContainer.clientHeight >= scrollContainer.scrollHeight - 2;
      if (atBottom) break;

      const nextTop = Math.min(
        scrollContainer.scrollHeight,
        scrollContainer.scrollTop + Math.max(
          120,
          scrollContainer.clientHeight * 0.8
        )
      );

      if (nextTop === previousTop) break;
      previousTop = nextTop;
      scrollContainer.scrollTop = nextTop;
      scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }));
      await delay(60);
    }

    return findRendered();
  };

  const markSemanticState = (field, state, reason = "") => {
    const target = field.wrapper || field.control;
    target.dataset.fa_agent_processed = "true";
    target.dataset.fa_agent_state = state;
    target.dataset.fa_agent_reason = reason;

    target.style.border = state === "review"
      ? "2px solid #f59e0b"
      : state === "unresolved"
        ? "2px dashed #ef4444"
        : "2px solid #06b6d4";
  };

  const applySemanticAnswer = async (answer, field) => {
    const incomingValues = Array.isArray(answer.value)
      ? answer.value
      : [answer.value];

    const exactValues = incomingValues.map(value => {
      return field.options.find(option => {
        return normalizeText(option) === normalizeText(value);
      });
    }).filter(Boolean);

    if (
      exactValues.length === 0 ||
      (!field.multiple && exactValues.length !== 1)
    ) {
      answer.value = "";
      answer.requiresReview = true;
      answer.reviewReason =
        "The answer did not exactly match an available dropdown option.";
      markSemanticState(field, "unresolved", answer.reviewReason);
      return false;
    }

    const valuesToApply = field.multiple
      ? [...new Set(exactValues)]
      : [exactValues[0]];

    for (const target of valuesToApply) {
      const option = await findSemanticOption(field, target);

      if (!option) {
        answer.value = "";
        answer.requiresReview = true;
        answer.reviewReason =
          "The exact option exists, but it could not be rendered for selection.";
        closeSemanticDropdown(field.control);
        markSemanticState(field, "unresolved", answer.reviewReason);
        return false;
      }

      option.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          cancelable: true,
          view: window
        })
      );
      option.dispatchEvent(
        new MouseEvent("mouseup", {
          bubbles: true,
          cancelable: true,
          view: window
        })
      );
      option.click();
      await delay(160);

      const selected = getSemanticCurrentValue(
        field.control,
        field.wrapper
      );

      if (!normalizeText(selected).includes(normalizeText(target))) {
        answer.value = "";
        answer.requiresReview = true;
        answer.reviewReason =
          "The page did not confirm the selected dropdown option.";
        markSemanticState(field, "unresolved", answer.reviewReason);
        return false;
      }
    }

    answer.value = field.multiple ? valuesToApply : valuesToApply[0];
    field.control.dataset.fa_agent_filled = "true";
    field.control.dataset.fa_filled = "true";
    markSemanticState(
      field,
      answer.requiresReview ? "review" : "filled",
      answer.reviewReason || ""
    );
    return true;
  };

  const applyDefaultAnswers = async answers => {
    const standardAnswers = [];
    const summary = {
      answered: 0,
      reviewRequired: 0,
      unresolved: 0
    };

    for (const answer of answers) {
      const field = semanticAgentFields.get(answer?.fieldId);

      if (!field) {
        standardAnswers.push(answer);
        continue;
      }

      const filled = await applySemanticAnswer(answer, field);

      if (filled) summary.answered += 1;
      else summary.unresolved += 1;

      if (filled && answer.requiresReview) {
        summary.reviewRequired += 1;
      }
    }

    const standardSummary = U.applyAgentAnswers(standardAnswers);

    return {
      answered: summary.answered + standardSummary.answered,
      reviewRequired:
        summary.reviewRequired + standardSummary.reviewRequired,
      unresolved: summary.unresolved + standardSummary.unresolved
    };
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

    return collectDefaultFields();
  };

  const applyAnswers = async answers => {
    if (
      typeof configuration?.applyAnswers === "function"
    ) {
      return configuration.applyAnswers(
        Array.isArray(answers) ? answers : []
      );
    }

    return applyDefaultAnswers(
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

      await waitForDeterministicDropdowns();
      await delay(250);

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

      const syncResponse = currentApplicationId
        ? await sendBackgroundMessage({
            action: "SYNC_APPLICATION_ANSWERS",
            payload: {
              applicationId: currentApplicationId,
              answers: response.data?.answers || []
            }
          })
        : {
            success: false,
            error: "The backend did not return an application ID."
          };

      const persistenceWarning = syncResponse?.success
        ? ""
        : syncResponse?.error ||
          "The applied answers could not be synchronized.";

      if (persistenceWarning) {
        console.warn(
          "[FastApply] Application answer synchronization failed:",
          persistenceWarning
        );
      }

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
        persistenceWarning,
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
        supportedControls:
          U.queryAgentElements(
            document,
            "input, select, textarea, [role='combobox'], [contenteditable='true']"
          ).length,
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
