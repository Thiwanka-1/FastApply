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
  let scanInFlight = false;
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
    let pageUrl = window.location.href;

    if (configuration?.atsPlatform === "workday") {
      try {
        const url = new URL(window.location.href);
        pageUrl = `${url.origin}${url.pathname}`;
      } catch (_) {}
    }

    return JSON.stringify({
      url: pageUrl,
      company: cleanText(jobContext?.company).toLowerCase(),
      jobTitle: configuration?.atsPlatform === "workday"
        ? ""
        : cleanText(jobContext?.jobTitle).toLowerCase()
    });
  };

  // Extracts a stable origin+pathname from a pageIdentity JSON string. Used
  // for the mid-run navigation guard: company/title text re-rendering on SPA
  // career sites must not abort a run that is still on the same page.
  const comparableIdentityUrl = identity => {
    try {
      const parsed = new URL(JSON.parse(identity).url);
      return `${parsed.origin}${parsed.pathname}`;
    } catch (_) {
      return cleanText(identity);
    }
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
    // Workday performs at most two bounded passes for a newly rendered wizard
    // step. Let both settle before taking the immutable Agent 2 snapshot so the
    // audit cannot race with row creation, lookup selection, or skill chips.
    if (configuration?.atsPlatform === "workday") {
      for (let pass = 0; pass < 3; pass += 1) {
        const queue = window.WorkdayEngine?.deterministicQueue;
        if (queue && typeof queue.then === "function") {
          try {
            await queue;
          } catch (_) {}
        }
        await delay(550);
      }
    }

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
      .replace(/[‘’ʼ']/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  };

  const hasFieldValue = value => {
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "boolean") return true;
    return cleanText(value).length > 0;
  };

  const comparableValue = value => {
    if (Array.isArray(value)) {
      return JSON.stringify(
        value.map(item => normalizeText(item)).filter(Boolean).sort()
      );
    }

    if (typeof value === "boolean") return String(value);
    return normalizeText(value);
  };

  const semanticValuesMatch = (currentValue, targetValue) => {
    if (Array.isArray(targetValue)) {
      const currentItems = Array.isArray(currentValue)
        ? currentValue
        : cleanText(currentValue).split(/\s*,\s*/).filter(Boolean);
      return comparableValue(currentItems) === comparableValue(targetValue);
    }

    return comparableValue(currentValue) === comparableValue(targetValue);
  };

  const hasCommittedSearchSelection = field => {
    if (!field?.control || !field?.wrapper) return false;
    if (
      configuration?.atsPlatform === "workday" &&
      window.WorkdayEngine?.isWorkdayEducationLookupControl?.(field.control)
    ) {
      return window.WorkdayEngine.hasCommittedEducationLookupSelection(
        field.control,
        field.wrapper
      );
    }
    if (field.control.dataset.fa_filled === "true") return true;
    return Boolean(field.wrapper.querySelector([
      '[data-automation-id^="selectedItem"]',
      '[data-automation-id*="selected" i]',
      '[class*="singleValue"]',
      '[class*="single-value"]',
      '[class*="multiValue"]',
      '[class*="multi-value"]',
      '[data-testid*="selected"]',
      'button[aria-label^="Remove " i]'
    ].join(",")));
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
    const isPlaceholderValue = value => {
      return /^(select|select one|choose|choose one|please select|none selected|one)$/i.test(
        cleanText(value)
      );
    };
    const selectedText = Array.from(
      wrapper?.querySelectorAll?.(
        [
          '[aria-selected="true"]',
          '[class*="singleValue"]',
          '[class*="single-value"]',
          '[class*="multiValue"]',
          '[class*="multi-value"]',
          '[data-testid*="selected"]',
          '[data-automation-id^="selectedItem"]',
          '[data-automation-id*="selected" i]',
          'button[aria-label^="Remove " i]'
        ].join(",")
      ) || []
    )
      .map(element => {
        const ariaLabel = cleanText(element.getAttribute?.("aria-label"));
        const value = /^remove\s+/i.test(ariaLabel)
          ? ariaLabel.replace(/^remove\s+/i, "")
          : cleanText(element.innerText || element.textContent);
        return value
          .replace(/^\s*(remove|delete)\s+/i, "")
          .replace(/\s+(remove|delete)\s*$/i, "")
          .trim();
      })
      .filter(Boolean)
      .join(", ");

    if (selectedText && !isPlaceholderValue(selectedText)) return selectedText;

    if (control?.tagName === "INPUT") {
      const inputValue = cleanText(control.value);
      return isPlaceholderValue(inputValue) ? "" : inputValue;
    }

    const controlText = cleanText(
      control?.innerText || control?.textContent
    );
    const label = getSemanticLabel(control, wrapper);

    const cleaned = controlText
      .replace(label, "")
      .replace(/^\s*(select|choose)\s*\.{0,3}\s*$/gi, "")
      .trim();

    return isPlaceholderValue(cleaned)
      ? ""
      : cleaned;
  };

  const openSemanticDropdown = control => {
    if (!control) return;

    if (control.getAttribute("aria-expanded") !== "true") {
      if (configuration?.atsPlatform === "workday" &&
        window.WorkdayEngine?.clickElement?.(control)) {
        return;
      }
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

    if (control?.id) {
      try {
        const associated = document.querySelector(
          `[data-associated-widget="${CSS.escape(control.id)}"]`
        );
        if (associated && isVisible(associated)) return associated;
      } catch (_) {}
    }

    const visibleListboxes = U.queryAgentElements(
      document,
      [
        '[data-automation-activepopup="true"]',
        '[data-automation-id="selectWidget-SuggestionPopup"]',
        '[role="listbox"]',
        '[id*="-listbox"]',
        '[class*="menu-list"]'
      ].join(",")
    ).filter(isVisible);

    if (visibleListboxes.length > 0) {
      return visibleListboxes[visibleListboxes.length - 1];
    }

    // Some ATS widgets (Cornerstone, several career-site frameworks) render
    // their dropdown as a menu instead of a listbox. Only consulted when no
    // listbox-shaped popup exists, so listbox-based platforms are unaffected.
    const visibleMenus = U.queryAgentElements(document, '[role="menu"]')
      .filter(menu => {
        return isVisible(menu) && menu.querySelector?.('[role^="menuitem"]');
      });

    return visibleMenus[visibleMenus.length - 1] || null;
  };

  const waitForSemanticListbox = async (control, timeout = 2500) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      const listbox = getSemanticListbox(control);
      if (listbox && isVisible(listbox)) return listbox;
      await delay(80);
    }
    return null;
  };

  const getSemanticOptions = listbox => {
    if (!listbox) return [];

    return U.queryAgentElements(
      listbox,
      [
        '[role="option"]',
        '[role="menuitem"]',
        '[role="menuitemradio"]',
        '[role="menuitemcheckbox"]',
        '[data-automation-id="promptOption"]',
        '[data-automation-id="multiSelectOption"]',
        '[data-automation-id="menuItem"]',
        '[id*="-option"]',
        '[class*="-option"]'
      ].join(",")
    ).filter(option => {
      return isVisible(option) &&
        !option.closest('[data-automation-id^="selectedItem"]');
    });
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

  const closeSemanticDropdown = async control => {
    // Close only what is actually open, and never dispatch a document-level
    // Escape: a stray wizard-level keypress can throw the candidate out of
    // Workday's apply overlay (seen as a reload back to the first step).
    const listbox = getSemanticListbox(control);
    if (!listbox || !isVisible(listbox)) return;

    control?.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        code: "Escape",
        bubbles: true
      })
    );
    await delay(120);

    const stillOpen = getSemanticListbox(control);
    if (stillOpen && isVisible(stillOpen)) {
      // Outside click is the proven, side-effect-free Workday popup closer.
      try {
        document.body.click();
      } catch (_) {}
    }
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
        '[aria-haspopup="listbox"]',
        '[data-automation-id="selectWidget"]'
      ].join(",")
    ).filter(control => {
      return isVisible(control) &&
        !control.disabled &&
        control.tagName !== "SELECT" &&
        // Never touch site chrome: opening the account / language / nav
        // menus is not form work and poking the account menu on Workday can
        // disturb the candidate session.
        !control.closest(
          'header, nav, footer, [role="banner"], [role="navigation"], ' +
          '[data-automation-id*="header" i], [data-automation-id*="navigation" i]'
        );
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
    const seenControls = new Set();

    const controls = getSemanticControls();
    for (let controlIndex = 0; controlIndex < controls.length; controlIndex += 1) {
      const control = controls[controlIndex];
      if (seenControls.has(control)) continue;
      seenControls.add(control);
      const wrapper = getSemanticWrapper(control);
      const label = getSemanticLabel(control, wrapper);
      const currentValue = getSemanticCurrentValue(control, wrapper);

      if (!wrapper || !label) {
        continue;
      }

      if (
        configuration?.atsPlatform === "workday" &&
        (
          control.closest('[data-automation-id="formField-skills"]') ||
          /\b(type to add|add) skills?\b/i.test(label)
        )
      ) {
        continue;
      }

      openSemanticDropdown(control);
      let listbox = await waitForSemanticListbox(control);
      if (!listbox) {
        // Some frameworks need a focused control before the first click
        // registers — one retry recovers those without slowing the rest.
        try { control.focus?.(); } catch (_) {}
        openSemanticDropdown(control);
        listbox = await waitForSemanticListbox(control, 1500);
      }
      const options = await collectSemanticOptions(listbox);
      await closeSemanticDropdown(control);
      await delay(160);

      const searchable = control.tagName === "INPUT" && Boolean(
        control.matches(
          '[role="combobox"], [aria-haspopup="listbox"], [data-automation-id="searchBox"]'
        )
      );
      const isPromptSearch = configuration?.atsPlatform === "workday" &&
        control.getAttribute("data-automation-id") === "searchBox";
      const useSearchAdapter = searchable && (options.length === 0 || isPromptSearch);
      const fieldOptions = useSearchAdapter ? [] : options;

      if (fieldOptions.length === 0 && !useSearchAdapter) continue;

      const fieldId = `fa_semantic_select_${hashText([
        configuration?.getPageKey?.() || window.location.pathname,
        control.id || "",
        control.getAttribute("name") || "",
        label,
        controlIndex
      ].join("|"))}`;

      if (
        configuration?.atsPlatform === "workday" &&
        window.WorkdayEngine?.getWorkdayEducationFieldDescriptor?.(control)
      ) {
        control.dataset.fa_agent_field_id = fieldId;
      }

      const multiple =
        listbox?.getAttribute("aria-multiselectable") === "true" ||
        /\ball that apply\b|\bselect all\b|\bchoose all\b/i.test(label);

      semanticAgentFields.set(fieldId, {
        control,
        wrapper,
        label,
        options: fieldOptions,
        multiple,
        currentValue,
        valueOwner: U.getValueOwner?.(control) || "",
        searchable: useSearchAdapter
      });

      fields.push({
        fieldId,
        label,
        type: fieldOptions.length > 0 ? "select" : "autocomplete",
        required:
          control.required === true ||
          control.getAttribute("aria-required") === "true" ||
          label.includes("*"),
        options: fieldOptions,
        multiple,
        currentValue,
        maxLength: null,
        valueOwner: U.getValueOwner?.(control) || "",
        validity: {
          valid:
            control.getAttribute("aria-invalid") !== "true" &&
            U.safeCheckValidity(control),
          ariaInvalid: control.getAttribute("aria-invalid") === "true",
          message: cleanText(control.validationMessage || "")
        }
      });
    }

    return fields;
  };

  // ---------------------------------------------------------------------
  // Button-style choice questions (segmented Yes/No pairs, aria-pressed
  // toggle groups). Ashby, Phenom and several career-site frameworks render
  // these as plain <button> elements — no input, no role="radio" — so
  // neither the standard nor the semantic collector could see them.
  // ---------------------------------------------------------------------
  const buttonAgentFields = new Map();

  const CHOICE_BUTTON_ACTION_TEXT =
    /^(add|remove|delete|upload|attach|submit|apply|save|cancel|next|back|continue|close|clear|edit|browse|search|show|hide|view|open|menu|more|expand|collapse|dismiss|previous|skip|autofill|sign in|log ?in|sign up|register|accept all|reject all|manage|got it|learn more|read more|copy|share|print|download|start|finish|retry|refresh|reload)\b/i;

  // Only true selection ARIA states qualify a group as a choice widget.
  // A bare data-state attribute is NOT enough: Radix-style UIs stamp it on
  // accordions and tabs, and treating section toggles as answerable
  // questions would let the agent click them open. data-state still counts
  // when READING pressed-ness of an already-qualified group.
  const choiceButtonHasStateAttribute = button => {
    return button.hasAttribute("aria-pressed") ||
      button.hasAttribute("aria-selected") ||
      button.hasAttribute("aria-checked");
  };

  const isChoiceButtonPressed = button => {
    return button.getAttribute("aria-pressed") === "true" ||
      button.getAttribute("aria-selected") === "true" ||
      button.getAttribute("aria-checked") === "true" ||
      /^(checked|selected|active|on|true)$/i.test(
        button.getAttribute("data-state") || ""
      );
  };

  const getNearbyQuestionText = start => {
    const groupWrap = start?.closest?.(
      'fieldset, [role="group"], [role="radiogroup"]'
    );

    if (groupWrap) {
      const legendText = cleanText(
        groupWrap.querySelector?.("legend")?.innerText
      );
      if (legendText) return legendText;

      const ariaLabel = cleanText(groupWrap.getAttribute?.("aria-label"));
      if (ariaLabel) return ariaLabel;

      const labelledBy = groupWrap.getAttribute?.("aria-labelledby");
      if (labelledBy) {
        const text = labelledBy
          .split(/\s+/)
          .map(id => cleanText(document.getElementById(id)?.innerText))
          .filter(Boolean)
          .join(" ");
        if (text) return text;
      }
    }

    // The question text is usually a plain-text block directly before the
    // buttons (possibly a few ancestors up). Skip siblings holding controls:
    // those are other option rows or unrelated fields.
    let node = start;
    for (let depth = 0; node && depth < 6; depth += 1) {
      let sibling = node.previousElementSibling;
      while (sibling) {
        if (!sibling.querySelector?.("input, button, select, textarea")) {
          const text = cleanText(sibling.innerText);
          if (text.length > 5) return text;
        }
        sibling = sibling.previousElementSibling;
      }
      node = node.parentElement;
    }

    return "";
  };

  const scanButtonChoiceGroups = () => {
    const groups = new Map();

    U.queryAgentElements(document, 'button, [role="button"]').forEach(button => {
      if (!isVisible(button) || button.disabled) return;
      if (button.getAttribute("aria-disabled") === "true") return;
      if (button.matches(
        '[aria-haspopup], [role="radio"], [role="checkbox"], [role="switch"], ' +
        '[role="option"], [role="tab"], [type="submit"], [type="reset"]'
      )) return;
      if (button.closest(
        'header, nav, footer, [role="banner"], [role="navigation"], ' +
        '[role="toolbar"], [class*="toolbar"], [role="listbox"], [role="menu"]'
      )) return;
      if (button.querySelector("input, select, textarea")) return;

      const text = cleanText(button.innerText);
      if (!text || text.length < 2 || text.length > 40) return;
      if (/^\d+$/.test(text)) return;
      if (CHOICE_BUTTON_ACTION_TEXT.test(text)) return;

      const container = button.parentElement;
      if (!container) return;
      if (!groups.has(container)) groups.set(container, []);
      groups.get(container).push(button);
    });

    const results = [];

    groups.forEach((buttons, container) => {
      if (buttons.length < 2 || buttons.length > 8) return;

      const texts = buttons.map(button => cleanText(button.innerText));
      const textKeys = texts.map(normalizeText);
      if (new Set(textKeys).size !== textKeys.length) return;

      const stateful = buttons.every(choiceButtonHasStateAttribute);
      const yesNoPair = textKeys.length === 2 &&
        textKeys.includes("yes") &&
        textKeys.includes("no");
      if (!stateful && !yesNoPair) return;

      const label = cleanText(getNearbyQuestionText(container)).slice(0, 500);
      if (!label || /\bcookies?\b/i.test(label)) return;

      results.push({ buttons, container, texts, stateful, label });
    });

    return results;
  };

  const collectButtonChoiceFields = () => {
    buttonAgentFields.clear();
    // Workday renders every choice as radio inputs or listbox widgets that
    // the existing collectors already own — leave its field set untouched.
    if (configuration?.atsPlatform === "workday") return [];

    const fields = [];

    scanButtonChoiceGroups().forEach(group => {
      const owners = [...new Set(
        group.buttons.map(button => U.getValueOwner?.(button) || "").filter(Boolean)
      )];
      const valueOwner = owners.includes("user")
        ? "user"
        : owners.includes("agent")
          ? "agent"
          : owners[0] || "";
      const pressedTexts = group.buttons
        .filter(isChoiceButtonPressed)
        .map(button => cleanText(button.innerText));
      const currentValue = pressedTexts[0] || "";

      // A stateless group something already answered cannot be audited
      // reliably (there is no attribute revealing which button won) — skip
      // it rather than risk clicking a second time.
      if (
        !group.stateful &&
        (valueOwner || group.buttons.some(button => {
          return button.dataset.fa_filled === "true";
        }))
      ) return;

      // Content-based id: stable across re-scans and wave audits even when
      // sibling groups appear or disappear. Identical twin groups (same
      // question, same options) fall back to an encounter-order suffix.
      const baseFieldId = `fa_buttons_${hashText([
        configuration?.getPageKey?.() || window.location.pathname,
        group.label,
        group.texts.map(normalizeText).join("|")
      ].join("::"))}`;
      let fieldId = baseFieldId;
      let suffix = 2;
      while (buttonAgentFields.has(fieldId)) {
        fieldId = `${baseFieldId}_${suffix}`;
        suffix += 1;
      }

      buttonAgentFields.set(fieldId, {
        buttons: group.buttons,
        container: group.container,
        label: group.label,
        options: group.texts,
        stateful: group.stateful,
        currentValue,
        valueOwner
      });

      fields.push({
        fieldId,
        label: group.label,
        type: "radio",
        required:
          group.container.getAttribute?.("aria-required") === "true" ||
          /\*/.test(group.label),
        options: group.texts,
        multiple: false,
        currentValue,
        maxLength: null,
        valueOwner,
        validity: { valid: true, ariaInvalid: false, message: "" }
      });
    });

    return fields;
  };

  const markButtonState = (field, state, reason = "") => {
    const target = field.container || field.buttons?.[0];
    if (!target) return;

    target.dataset.fa_agent_processed = "true";
    target.dataset.fa_agent_state = state;
    target.dataset.fa_agent_reason = reason;

    try {
      target.style.border = state === "review"
        ? "2px solid #f59e0b"
        : state === "unresolved"
          ? "2px dashed #ef4444"
          : "2px solid #06b6d4";
    } catch (_) {}
  };

  const refreshButtonFieldNodes = field => {
    if (field.buttons.every(button => button?.isConnected)) return true;

    const wantedKey = `${normalizeText(field.label)}::${
      field.options.map(normalizeText).join("|")
    }`;
    const match = scanButtonChoiceGroups().find(group => {
      return `${normalizeText(group.label)}::${
        group.texts.map(normalizeText).join("|")
      }` === wantedKey;
    });

    if (!match) return false;
    field.buttons = match.buttons;
    field.container = match.container;
    return true;
  };

  const clickChoiceButton = button => {
    try {
      button.focus?.();
      if (typeof PointerEvent === "function") {
        button.dispatchEvent(new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          pointerType: "mouse",
          isPrimary: true
        }));
      }
      button.dispatchEvent(new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        view: window
      }));
      if (typeof PointerEvent === "function") {
        button.dispatchEvent(new PointerEvent("pointerup", {
          bubbles: true,
          cancelable: true,
          pointerType: "mouse",
          isPrimary: true
        }));
      }
      button.dispatchEvent(new MouseEvent("mouseup", {
        bubbles: true,
        cancelable: true,
        view: window
      }));
      button.click();
      return true;
    } catch (_) {
      return false;
    }
  };

  const applyButtonChoiceAnswer = async (answer, field) => {
    if (!refreshButtonFieldNodes(field)) {
      answer.action = "unresolved";
      answer.value = "";
      answer.requiresReview = true;
      answer.reviewReason =
        "The choice buttons were replaced or removed after the page audit.";
      markButtonState(field, "unresolved", answer.reviewReason);
      return { filled: false, unresolved: true };
    }

    const liveOwners = [...new Set(
      field.buttons.map(button => U.getValueOwner?.(button) || "").filter(Boolean)
    )];
    const liveOwner = liveOwners.includes("user")
      ? "user"
      : liveOwners.includes("agent")
        ? "agent"
        : liveOwners[0] || field.valueOwner;
    const pressedNow = field.buttons
      .filter(isChoiceButtonPressed)
      .map(button => cleanText(button.innerText));
    const liveValue = field.stateful
      ? (pressedNow[0] || "")
      : field.currentValue;

    const target = cleanText(
      Array.isArray(answer.value) ? answer.value[0] : answer.value
    );

    if (!target) {
      if (liveOwner === "user" && liveValue) {
        answer.action = "keep";
        answer.value = liveValue;
        answer.source = "user";
        answer.confidence = 1;
        answer.requiresReview = false;
        answer.reviewReason = "";
        markButtonState(field, "filled");
        return { filled: true, unresolved: false, kept: true };
      }

      answer.action = "unresolved";
      answer.requiresReview = true;
      answer.reviewReason = answer.reviewReason ||
        "No supported answer was available for this question.";
      markButtonState(field, "unresolved", answer.reviewReason);
      return { filled: false, unresolved: true };
    }

    if (normalizeText(liveValue) !== normalizeText(field.currentValue)) {
      answer.action = "conflict";
      answer.value = "";
      answer.requiresReview = true;
      answer.reviewReason =
        "The question changed after the scan, so FastApply preserved the newer choice.";
      markButtonState(field, "review", answer.reviewReason);
      return { filled: false, unresolved: true, conflict: true };
    }

    if (liveValue && normalizeText(liveValue) === normalizeText(target)) {
      answer.action = "keep";
      markButtonState(field, "filled");
      return { filled: true, unresolved: false, kept: true };
    }

    if (liveValue && liveOwner === "user") {
      answer.action = "conflict";
      answer.value = "";
      answer.requiresReview = true;
      answer.reviewReason =
        "FastApply found a different answer but preserved the manually selected choice.";
      markButtonState(field, "review", answer.reviewReason);
      return { filled: false, unresolved: true, conflict: true };
    }

    const matchedOption = field.options.find(option => {
      return normalizeText(option) === normalizeText(target);
    });
    const targetButton = matchedOption
      ? field.buttons.find(button => {
          return normalizeText(cleanText(button.innerText)) ===
            normalizeText(matchedOption);
        })
      : null;

    if (!targetButton) {
      answer.value = "";
      answer.requiresReview = true;
      answer.reviewReason =
        "The answer did not exactly match one of the available buttons.";
      markButtonState(field, "unresolved", answer.reviewReason);
      return { filled: false, unresolved: true };
    }

    answer.action = liveValue ? "replace" : "fill";
    clickChoiceButton(targetButton);
    await delay(180);

    if (field.stateful) {
      if (!refreshButtonFieldNodes(field)) {
        answer.value = "";
        answer.requiresReview = true;
        answer.reviewReason =
          "The page replaced the buttons before the choice could be verified.";
        markButtonState(field, "unresolved", answer.reviewReason);
        return { filled: false, unresolved: true };
      }

      const confirmed = field.buttons.find(button => {
        return normalizeText(cleanText(button.innerText)) ===
          normalizeText(matchedOption);
      });

      if (!confirmed || !isChoiceButtonPressed(confirmed)) {
        answer.value = "";
        answer.requiresReview = true;
        answer.reviewReason = "The page did not confirm the selected choice.";
        markButtonState(field, "unresolved", answer.reviewReason);
        return { filled: false, unresolved: true };
      }
    }

    answer.value = matchedOption;
    field.currentValue = matchedOption;
    field.buttons.forEach(button => {
      button.dataset.fa_filled = "true";
      U.setValueOwner?.(button, "agent");
    });
    markButtonState(
      field,
      answer.requiresReview ? "review" : "filled",
      answer.reviewReason || ""
    );
    return { filled: true, unresolved: false, kept: false };
  };

  const collectDefaultFields = async () => {
    const semanticFields = await collectSemanticFields();
    const buttonFields = collectButtonChoiceFields();
    const standardFields = U.collectAuditableFields();

    const unique = new Map();

    [...standardFields, ...semanticFields, ...buttonFields].forEach(field => {
      unique.set(field.fieldId, field);
    });

    return [...unique.values()];
  };

  const findSemanticOption = async (field, target, settings = {}) => {
    openSemanticDropdown(field.control);
    const listbox = await waitForSemanticListbox(field.control);
    const scrollContainer = getSemanticScrollContainer(listbox);
    const findRendered = () => {
      const options = getSemanticOptions(listbox);
      return U.findBestSemanticMatch?.(
        options,
        target,
        option => option.innerText || option.textContent || ""
      ) || options.find(option => {
        return normalizeText(option.innerText || option.textContent) ===
          normalizeText(target);
      }) || null;
    };

    let match = findRendered();
    const firstRendered = getSemanticOptions(listbox)[0] || null;
    if (match || !scrollContainer) {
      return match || (settings.selectTopResult === true ? firstRendered : null);
    }

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

    return findRendered() ||
      (settings.selectTopResult === true ? firstRendered : null);
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

  const setSemanticSearchValue = (control, value) => {
    const target = String(value ?? "");
    if (!control || control.tagName !== "INPUT") return false;

    if (window.WorkdayEngine?.typeInputValue) {
      return window.WorkdayEngine.typeInputValue(control, target);
    }

    try {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )?.set;
      control.focus();
      if (setter) setter.call(control, target);
      else control.value = target;
      control.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        data: target,
        inputType: "insertText"
      }));
      control.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    } catch (_) {
      return false;
    }
  };

  const refreshSemanticFieldNodes = field => {
    if (field.control?.isConnected && field.wrapper?.isConnected) return true;

    let control = null;
    if (field.control?.id) {
      control = document.getElementById(field.control.id);
    }

    if (!control && field.control?.getAttribute?.("name")) {
      try {
        control = document.querySelector(
          `[name="${CSS.escape(field.control.getAttribute("name"))}"]`
        );
      } catch (_) {}
    }

    if (!control) {
      control = getSemanticControls().find(candidate => {
        return normalizeText(getSemanticLabel(candidate, getSemanticWrapper(candidate))) ===
          normalizeText(field.label);
      });
    }

    if (!control) return false;
    field.control = control;
    field.wrapper = getSemanticWrapper(control);
    return Boolean(field.wrapper);
  };

  const clickSemanticOption = async (option, control = null) => {
    if (!option) return false;

    try {
      if (
        configuration?.atsPlatform === "workday" &&
        window.WorkdayEngine?.isWorkdayEducationLookupControl?.(control) &&
        window.WorkdayEngine?.commitWorkdayEducationLookupOption
      ) {
        return await window.WorkdayEngine.commitWorkdayEducationLookupOption(
          option,
          control
        );
      }

      if (
        configuration?.atsPlatform === "workday" &&
        window.WorkdayEngine?.selectWorkdayOption
      ) {
        const selected = await window.WorkdayEngine.selectWorkdayOption(
          option,
          null,
          { control }
        );
        if (selected) return true;
        // The click landed if the option unmounted with its popup; the
        // caller verifies the resulting field value itself afterwards.
        return !option.isConnected || !isVisible(option);
      }
      option.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      if (typeof PointerEvent === "function") {
        option.dispatchEvent(new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          pointerType: "mouse",
          isPrimary: true
        }));
      }
      option.dispatchEvent(new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        view: window
      }));
      option.dispatchEvent(new MouseEvent("mouseup", {
        bubbles: true,
        cancelable: true,
        view: window
      }));
      if (typeof PointerEvent === "function") {
        option.dispatchEvent(new PointerEvent("pointerup", {
          bubbles: true,
          cancelable: true,
          pointerType: "mouse",
          isPrimary: true
        }));
      }
      option.click();
      return true;
    } catch (_) {
      return false;
    }
  };

  const applySearchableSemanticAnswer = async (answer, field) => {
    const target = cleanText(
      Array.isArray(answer.value) ? answer.value[0] : answer.value
    );
    const liveBefore = getSemanticCurrentValue(field.control, field.wrapper);

    if (!target) {
      answer.action = "unresolved";
      answer.requiresReview = true;
      answer.reviewReason = answer.reviewReason ||
        "No supported answer was available for this searchable field.";
      markSemanticState(field, "unresolved", answer.reviewReason);
      return { filled: false, unresolved: true };
    }

    if (!semanticValuesMatch(liveBefore, field.currentValue)) {
      answer.action = "conflict";
      answer.value = "";
      answer.requiresReview = true;
      answer.reviewReason =
        "The field changed after the scan, so FastApply preserved the newer value.";
      markSemanticState(field, "review", answer.reviewReason);
      return { filled: false, unresolved: true, conflict: true };
    }

    if (
      semanticValuesMatch(liveBefore, target) &&
      (
        configuration?.atsPlatform !== "workday" ||
        hasCommittedSearchSelection(field)
      )
    ) {
      answer.action = "keep";
      field.control.dataset.fa_agent_validated = "true";
      markSemanticState(field, answer.requiresReview ? "review" : "filled");
      return { filled: true, unresolved: false, kept: true };
    }

    if (hasFieldValue(liveBefore) && field.valueOwner === "user") {
      answer.action = "conflict";
      answer.value = "";
      answer.requiresReview = true;
      answer.reviewReason =
        "FastApply preserved the manually entered searchable value.";
      markSemanticState(field, "review", answer.reviewReason);
      return { filled: false, unresolved: true, conflict: true };
    }

    if (hasFieldValue(liveBefore)) {
      const removeButtons = U.queryAgentElements(
        field.wrapper,
        [
          'button[aria-label^="Remove " i]',
          '[data-automation-id^="selectedItem"] button',
          '[data-automation-id^="selectedItem"][role="button"]'
        ].join(",")
      ).filter(isVisible);
      removeButtons.forEach(button => button.click());
      await delay(180);
      if (!refreshSemanticFieldNodes(field)) {
        answer.value = "";
        answer.requiresReview = true;
        answer.reviewReason =
          "The searchable control was replaced before the correction could be applied.";
        markSemanticState(field, "unresolved", answer.reviewReason);
        return { filled: false, unresolved: true };
      }
    }

    openSemanticDropdown(field.control);
    if (!setSemanticSearchValue(field.control, target)) {
      answer.value = "";
      answer.requiresReview = true;
      answer.reviewReason = "The searchable field would not accept input.";
      markSemanticState(field, "unresolved", answer.reviewReason);
      return { filled: false, unresolved: true };
    }

    const normalizedLabel = normalizeText(field.label);
    const educationDescriptor = configuration?.atsPlatform === "workday"
      ? window.WorkdayEngine?.getWorkdayEducationFieldDescriptor?.(field.control)
      : null;
    const isSchoolLookup = educationDescriptor?.kind === "school" ||
      /\b(school|university|institution)\b/.test(normalizedLabel);

    if (configuration?.atsPlatform === "workday" && isSchoolLookup) {
      await delay(120);
      window.WorkdayEngine?.triggerWorkdayLookupEnter?.(field.control);
    }

    await delay(250);
    const option = await findSemanticOption(field, target, {
      // Education lookups must select a compatible result, never merely the
      // first row returned by Workday's search ranking.
      selectTopResult: false
    });
    const selectedOptionLabel = cleanText(option?.innerText || option?.textContent || "");
    if (!option || !selectedOptionLabel || !await clickSemanticOption(option, field.control)) {
      answer.value = "";
      answer.requiresReview = true;
      answer.reviewReason =
        "No unambiguous selectable option represented the supported answer.";
      await closeSemanticDropdown(field.control);
      markSemanticState(field, "unresolved", answer.reviewReason);
      return { filled: false, unresolved: true };
    }

    await delay(350);
    if (!refreshSemanticFieldNodes(field)) {
      answer.value = "";
      answer.requiresReview = true;
      answer.reviewReason =
        "The searchable control was replaced before its selection could be verified.";
      markSemanticState(field, "unresolved", answer.reviewReason);
      return { filled: false, unresolved: true };
    }
    const selected = getSemanticCurrentValue(field.control, field.wrapper);
    const retained = (
      semanticValuesMatch(selected, selectedOptionLabel) ||
      U.smartMatch?.(selected, selectedOptionLabel) === true
    ) && (
      hasCommittedSearchSelection(field) ||
      field.control.getAttribute("aria-expanded") !== "true"
    );
    if (!retained) {
      answer.value = "";
      answer.requiresReview = true;
      answer.reviewReason =
        "The page did not confirm the selected searchable option.";
      markSemanticState(field, "unresolved", answer.reviewReason);
      return { filled: false, unresolved: true };
    }

    answer.action = hasFieldValue(liveBefore) ? "replace" : "fill";
    answer.value = selectedOptionLabel;
    field.control.dataset.fa_filled = "true";
    field.control.dataset.fa_agent_filled = "true";
    U.setValueOwner?.(field.control, "agent");
    markSemanticState(
      field,
      answer.requiresReview ? "review" : "filled",
      answer.reviewReason || ""
    );
    return { filled: true, unresolved: false, kept: false };
  };

  const applySemanticAnswer = async (answer, field) => {
    if (!refreshSemanticFieldNodes(field)) {
      answer.action = "unresolved";
      answer.value = "";
      answer.requiresReview = true;
      answer.reviewReason =
        "The field was replaced or removed after the page audit.";
      markSemanticState(field, "unresolved", answer.reviewReason);
      return { filled: false, unresolved: true };
    }

    field.valueOwner = U.getValueOwner?.(field.control) || field.valueOwner;

    const incomingValues = Array.isArray(answer.value)
      ? answer.value
      : [answer.value];

    if (!incomingValues.some(hasFieldValue)) {
      const liveValue = getSemanticCurrentValue(field.control, field.wrapper);
      if (!semanticValuesMatch(liveValue, field.currentValue)) {
        answer.action = "conflict";
        answer.value = "";
        answer.requiresReview = true;
        answer.reviewReason =
          "The field changed after the audit, so FastApply preserved the newer value.";
        markSemanticState(field, "review", answer.reviewReason);
        return { filled: false, unresolved: true, conflict: true };
      }

      const isValid = field.control.getAttribute("aria-invalid") !== "true" &&
        U.safeCheckValidity(field.control);
      if (field.valueOwner === "user" && hasFieldValue(liveValue) && isValid) {
        answer.action = "keep";
        answer.value = liveValue;
        answer.source = "user";
        answer.confidence = 1;
        answer.requiresReview = false;
        answer.reviewReason = "";
        field.control.dataset.fa_agent_validated = "true";
        markSemanticState(field, "filled");
        return { filled: true, unresolved: false, kept: true };
      }

      answer.action = "unresolved";
      answer.requiresReview = true;
      answer.reviewReason = answer.reviewReason ||
        "No supported answer was available for this field.";
      markSemanticState(field, "unresolved", answer.reviewReason);
      return {
        filled: false,
        unresolved: true
      };
    }

    if (field.searchable && field.options.length === 0) {
      return applySearchableSemanticAnswer(answer, field);
    }

    const exactValues = incomingValues.map(value => {
      return field.options.find(option => {
        return normalizeText(option) === normalizeText(value);
      });
    }).filter(Boolean);
    const requestedValues = incomingValues.filter(hasFieldValue);

    if (
      exactValues.length === 0 ||
      exactValues.length !== requestedValues.length ||
      (!field.multiple && exactValues.length !== 1)
    ) {
      answer.value = "";
      answer.requiresReview = true;
      answer.reviewReason =
        "The answer did not exactly match an available dropdown option.";
      markSemanticState(field, "unresolved", answer.reviewReason);
      return {
        filled: false,
        unresolved: true
      };
    }

    const valuesToApply = field.multiple
      ? [...new Set(exactValues)]
      : [exactValues[0]];

    const targetValue = field.multiple
      ? valuesToApply
      : valuesToApply[0];
    const liveBefore = getSemanticCurrentValue(field.control, field.wrapper);

    if (!semanticValuesMatch(liveBefore, field.currentValue)) {
      answer.action = "conflict";
      answer.value = "";
      answer.requiresReview = true;
      answer.reviewReason =
        "The field changed after the scan, so FastApply preserved the newer value.";
      markSemanticState(field, "review", answer.reviewReason);
      return {
        filled: false,
        unresolved: true,
        conflict: true
      };
    }

    if (semanticValuesMatch(liveBefore, targetValue)) {
      answer.action = "keep";
      field.control.dataset.fa_agent_validated = "true";
      markSemanticState(
        field,
        answer.requiresReview ? "review" : "filled",
        answer.reviewReason || ""
      );
      return {
        filled: true,
        unresolved: false,
        kept: true
      };
    }

    if (
      hasFieldValue(liveBefore) &&
      field.valueOwner === "user"
    ) {
      answer.action = "conflict";
      answer.value = "";
      answer.requiresReview = true;
      answer.reviewReason =
        "FastApply found a different answer but preserved the manually entered value.";
      markSemanticState(field, "review", answer.reviewReason);
      return {
        filled: false,
        unresolved: true,
        conflict: true
      };
    }

    answer.action = hasFieldValue(liveBefore) ? "replace" : "fill";

    for (const target of valuesToApply) {
      const option = await findSemanticOption(field, target);

      if (!option) {
        answer.value = "";
        answer.requiresReview = true;
        answer.reviewReason =
          "The exact option exists, but it could not be rendered for selection.";
        await closeSemanticDropdown(field.control);
        markSemanticState(field, "unresolved", answer.reviewReason);
        return {
          filled: false,
          unresolved: true
        };
      }

      if (!await clickSemanticOption(option, field.control)) {
        answer.value = "";
        answer.requiresReview = true;
        answer.reviewReason = "The exact option could not be clicked.";
        markSemanticState(field, "unresolved", answer.reviewReason);
        return { filled: false, unresolved: true };
      }

      const expectedSoFar = field.multiple
        ? valuesToApply.slice(0, valuesToApply.indexOf(target) + 1)
        : target;

      let confirmed = false;
      for (let attempt = 0; attempt < 18; attempt += 1) {
        await delay(100);
        if (!refreshSemanticFieldNodes(field)) continue;
        const selected = getSemanticCurrentValue(field.control, field.wrapper);
        if (semanticValuesMatch(selected, expectedSoFar)) {
          confirmed = true;
          break;
        }
      }

      if (!confirmed) {
        answer.value = "";
        answer.requiresReview = true;
        answer.reviewReason =
          "The page did not confirm the selected dropdown option.";
        markSemanticState(field, "unresolved", answer.reviewReason);
        return {
          filled: false,
          unresolved: true
        };
      }

      if (!field.multiple) {
        await closeSemanticDropdown(field.control);
        await delay(100);
      }
    }

    answer.value = targetValue;
    field.control.dataset.fa_agent_filled = "true";
    field.control.dataset.fa_filled = "true";
    U.setValueOwner?.(field.control, "agent");
    markSemanticState(
      field,
      answer.requiresReview ? "review" : "filled",
      answer.reviewReason || ""
    );
    return {
      filled: true,
      unresolved: false,
      kept: false
    };
  };

  const applyDefaultAnswers = async answers => {
    const standardAnswers = [];
    const summary = {
      answered: 0,
      reviewRequired: 0,
      unresolved: 0,
      kept: 0,
      corrected: 0,
      conflicts: 0
    };

    const accumulate = (result, answer) => {
      if (result.filled) summary.answered += 1;
      if (result.unresolved) summary.unresolved += 1;
      if (result.kept) summary.kept += 1;
      if (result.filled && answer?.action === "replace") {
        summary.corrected += 1;
      }
      if (result.conflict) summary.conflicts += 1;

      if (result.filled && answer.requiresReview) {
        summary.reviewRequired += 1;
      }
    };

    for (const answer of answers) {
      const buttonField = buttonAgentFields.get(answer?.fieldId);

      if (buttonField) {
        accumulate(await applyButtonChoiceAnswer(answer, buttonField), answer);
        continue;
      }

      const field = semanticAgentFields.get(answer?.fieldId);

      if (!field) {
        standardAnswers.push(answer);
        continue;
      }

      accumulate(await applySemanticAnswer(answer, field), answer);
    }

    const standardSummary = await U.applyAgentAnswers(standardAnswers);

    return {
      answered: summary.answered + standardSummary.answered,
      reviewRequired:
        summary.reviewRequired + standardSummary.reviewRequired,
      unresolved: summary.unresolved + standardSummary.unresolved,
      kept: summary.kept + (standardSummary.kept || 0),
      corrected: summary.corrected + (standardSummary.corrected || 0),
      conflicts: summary.conflicts + (standardSummary.conflicts || 0)
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

  const scanPage = async (options = {}) => {
    if (!configuration) {
      return {
        success: false,
        error:
          "The FastApply engine has not registered this page yet."
      };
    }

    if (agent2InFlight && options.internal !== true) {
      return {
        success: false,
        error: "Agent 2 is currently auditing this page."
      };
    }

    if (scanInFlight) {
      return {
        success: false,
        error: "A page inspection is already in progress."
      };
    }

    scanInFlight = true;

    try {
      const profile = await getProfile();

      if (
        typeof configuration.prepareScan === "function"
      ) {
        await configuration.prepareScan(profile);
      }

      await waitForDeterministicDropdowns();
      await delay(250);

      resetPreviousUnresolvedMarkers();

      const jobContext = getJobContext();
      const pageIdentity =
        buildPageIdentity(jobContext);
      const pageKey = cleanText(
        configuration.getPageKey?.() ||
        window.location.pathname
      );

      if (
        latestScan &&
        latestScan.pageIdentity !== pageIdentity
      ) {
        currentApplicationId = "";
      }

      const fields = await collectFields();
      const scriptFilled =
        countDeterministicFields();
      const repairOnlyFields = fields.filter(field => field?.repairOnly === true);
      const auditableFields = fields.filter(field => field?.repairOnly !== true);
      const emptyFields = auditableFields.filter(field => {
        return !hasFieldValue(field?.currentValue);
      });
      const invalidFields = auditableFields.filter(field => {
        return field?.validity?.valid === false;
      });
      const attentionFields = auditableFields.filter(field => {
        return !hasFieldValue(field?.currentValue) ||
          field?.validity?.valid === false;
      });

      latestScan = {
        scanId: `scan_${Date.now()}`,
        pageIdentity,
        pageKey,
        pageUrl: window.location.href,
        pageTitle: cleanText(document.title),
        atsPlatform:
          configuration.atsPlatform ||
          "generic",
        jobContext,
        totalFields: auditableFields.length,
        scriptFilled,
        auditableFields: auditableFields.length,
        missingFields: emptyFields.length + repairOnlyFields.length,
        invalidFields: invalidFields.length,
        structuralIssues: repairOnlyFields.length,
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
        requestedFields: auditableFields.length,
        answered: 0,
        reviewRequired: 0,
        unresolved: attentionFields.length + repairOnlyFields.length,
        error: "",
        updatedAt:
          new Date().toISOString()
      };

      await writeStorage({
        lastPageScan: latestScan,
        lastAgent2Result: null,
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
    } finally {
      scanInFlight = false;
    }
  };

  const runAgent2 = async () => {
    if (agent2InFlight) {
      return {
        success: false,
        error: "Agent 2 is already processing this page."
      };
    }

    agent2InFlight = true;

    /*
     * Reuse a fresh scan of this exact page when one exists. The audit used
     * to always re-sweep every dropdown (open → collect → close) even though
     * the user typically just ran Inspect; on Workday that second rapid
     * sweep could trip the tenant's session recovery, which threw the
     * candidate back to step one of the wizard. With a reusable scan the
     * audit touches nothing on the page until the answers arrive.
     */
    let scanResponse = null;

    try {
      const livePageKey = cleanText(
        configuration?.getPageKey?.() || window.location.pathname
      );
      const scanAge = latestScan?.scannedAt
        ? Date.now() - new Date(latestScan.scannedAt).getTime()
        : Number.POSITIVE_INFINITY;
      if (
        latestScan &&
        latestScan.pageKey === livePageKey &&
        latestScan.pageIdentity === buildPageIdentity(getJobContext()) &&
        Number.isFinite(scanAge) &&
        scanAge < 3 * 60 * 1000
      ) {
        scanResponse = { success: true, data: latestScan };
      }
    } catch (_) {
      scanResponse = null;
    }

    if (!scanResponse) {
      try {
        scanResponse = await scanPage({ internal: true });
      } catch (error) {
        agent2InFlight = false;
        return {
          success: false,
          error: error?.message || "The page audit failed."
        };
      }
    }

    if (!scanResponse.success) {
      agent2InFlight = false;
      return scanResponse;
    }

    let scan = scanResponse.data;
    let repairOnlyFields = scan.fields.filter(field => field?.repairOnly === true);

    if (
      repairOnlyFields.length > 0 &&
      typeof configuration?.repairFields === "function"
    ) {
      try {
        await configuration.repairFields(repairOnlyFields);
      } catch (error) {
        agent2InFlight = false;
        return {
          success: false,
          error: error?.message || "The page structure could not be prepared."
        };
      }
      await delay(250);
      scanResponse = await scanPage({ internal: true });

      if (!scanResponse.success) {
        agent2InFlight = false;
        return scanResponse;
      }

      scan = scanResponse.data;
      repairOnlyFields = scan.fields.filter(field => field?.repairOnly === true);
    }

    const agentFields = scan.fields.filter(field => field?.repairOnly !== true);

    if (agentFields.length === 0) {
      const repairOnlyUnresolved = repairOnlyFields.length;
      const summary = {
        applicationId:
          currentApplicationId,
        status: repairOnlyUnresolved > 0
          ? "ready_for_review"
          : "complete",
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
        unresolved: repairOnlyUnresolved,
        updatedAt:
          new Date().toISOString()
      };

      await writeStorage({
        lastAgent2Result: null,
        lastAgent2Summary: summary,
        agent2RunState: {
          ...summary,
          error: ""
        }
      });

      agent2InFlight = false;

      return {
        success: true,
        data: {
          result: null,
          summary,
          scan
        }
      };
    }

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
          agentFields.length,
        answered: 0,
        reviewRequired: 0,
        unresolved:
          agentFields.length + repairOnlyFields.length,
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
        pageKey:
          scan.pageKey,
        pageIdentity:
          scan.pageIdentity,
        jobContext:
          scan.jobContext,
        scriptStats: {
          totalFields:
            scan.totalFields,
          scriptFilled:
            scan.scriptFilled
        },
        fields:
          agentFields
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
          "Agent 2 could not audit the application fields."
        );
      }

      currentApplicationId =
        response.data?.applicationId ||
        currentApplicationId;

      const livePageKey = cleanText(
        configuration.getPageKey?.() || window.location.pathname
      );
      const livePageIdentity = buildPageIdentity(getJobContext());
      if (
        livePageKey !== scan.pageKey ||
        comparableIdentityUrl(livePageIdentity) !==
          comparableIdentityUrl(scan.pageIdentity)
      ) {
        throw new Error(
          "The application page changed while Agent 2 was auditing it. Inspect the current page and run the audit again."
        );
      }

      let combinedAnswers = [...(response.data?.answers || [])];
      let responseData = { ...response.data, answers: combinedAnswers };
      const appliedSummary =
        await applyAnswers(combinedAnswers);
      const addSummary = next => {
        for (const key of [
          "answered", "reviewRequired", "unresolved", "kept", "corrected", "conflicts"
        ]) {
          appliedSummary[key] = (appliedSummary[key] || 0) + (next?.[key] || 0);
        }
      };

      const seenFieldIds = new Set(agentFields.map(field => field.fieldId));

      // Most ATS forms reveal dependent questions after a controlling answer
      // is applied (Workday dropdown chains, SuccessFactors/Oracle/Phenom
      // conditional sections, "If yes, explain" follow-ups). Audit those
      // newly rendered fields automatically during the same button click
      // instead of making the applicant run Agent 2 again. Greenhouse keeps
      // its original single-pass behavior: its custom collector re-sweeps
      // every dropdown, which is too disruptive to repeat unprompted.
      if (configuration?.atsPlatform !== "greenhouse") {
        for (let wave = 0; wave < 2; wave += 1) {
          await delay(550);

          try {
            const profile = await getProfile();
            if (typeof configuration.runDeterministic === "function") {
              await configuration.runDeterministic(profile);
              await delay(350);
            }
          } catch (_) {}

          const waveFields = (await collectFields()).filter(field => {
            return field?.repairOnly !== true && !seenFieldIds.has(field.fieldId);
          });
          waveFields.forEach(field => seenFieldIds.add(field.fieldId));
          if (waveFields.length === 0) break;

          const waveResponse = await sendBackgroundMessage({
            action: "ANSWER_APPLICATION_FIELDS",
            payload: {
              applicationId: currentApplicationId,
              atsPlatform: scan.atsPlatform,
              pageKey: scan.pageKey,
              pageIdentity: scan.pageIdentity,
              jobContext: scan.jobContext,
              scriptStats: {
                totalFields: scan.totalFields + waveFields.length,
                scriptFilled: countDeterministicFields()
              },
              fields: waveFields
            }
          });

          if (!waveResponse?.success) {
            console.warn(
              "[FastApply] Conditional follow-up audit could not be completed:",
              waveResponse?.error || "Unknown error"
            );
            break;
          }

          currentApplicationId = waveResponse.data?.applicationId || currentApplicationId;
          const waveAnswers = waveResponse.data?.answers || [];
          combinedAnswers = [...combinedAnswers, ...waveAnswers];
          responseData = {
            ...responseData,
            ...waveResponse.data,
            answers: combinedAnswers
          };
          addSummary(await applyAnswers(waveAnswers));
        }
      }

      await delay(350);
      // Stats only — use the cheap standard collection; a full semantic
      // sweep here re-opened every dropdown a third time for numbers alone.
      const postApplyFields = U.collectAuditableFields();
      const postApplyAuditable = postApplyFields.filter(field => {
        return field?.repairOnly !== true;
      });
      const emptyAfterApply = postApplyAuditable.filter(field => {
        return !hasFieldValue(field?.currentValue);
      }).length;
      const invalidAfterApply = postApplyAuditable.filter(field => {
        return field?.validity?.valid === false;
      }).length;
      const attentionAfterApply = postApplyAuditable.filter(field => {
        return !hasFieldValue(field?.currentValue) ||
          field?.validity?.valid === false;
      }).length;
      const verifiedUnresolved = Math.max(
        appliedSummary.unresolved || 0,
        attentionAfterApply + repairOnlyFields.length
      );

      const syncResponse = currentApplicationId
        ? await sendBackgroundMessage({
            action: "SYNC_APPLICATION_ANSWERS",
            payload: {
              applicationId: currentApplicationId,
              answers: combinedAnswers
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
        ...responseData,
        applicationId:
          currentApplicationId,
        pageUrl:
          scan.pageUrl,
        pageKey:
          scan.pageKey,
        pageIdentity:
          scan.pageIdentity,
        atsPlatform:
          scan.atsPlatform,
        scriptFilled:
          scan.scriptFilled,
        appliedFields:
          appliedSummary.answered,
        validatedFields:
          appliedSummary.kept || 0,
        correctedFields:
          appliedSummary.corrected || 0,
        conflictFields:
          appliedSummary.conflicts || 0,
        reviewRequiredFields:
          appliedSummary.reviewRequired,
        unresolvedAfterApply:
          verifiedUnresolved,
        emptyAfterApply,
        invalidAfterApply,
        fieldsAfterApply:
          postApplyFields,
        persistenceWarning,
        completedAt
      };

      const summary = {
        applicationId:
          currentApplicationId,
        status:
          verifiedUnresolved > 0 ||
          (appliedSummary.conflicts || 0) > 0 ||
          appliedSummary.reviewRequired > 0
            ? "ready_for_review"
            : "complete",
        pageUrl:
          scan.pageUrl,
        pageKey:
          scan.pageKey,
        atsPlatform:
          scan.atsPlatform,
        company:
          responseData?.jobContext
            ?.company ||
          scan.jobContext.company ||
          "",
        jobTitle:
          responseData?.jobContext
            ?.jobTitle ||
          scan.jobContext.jobTitle ||
          "",
        totalFields:
          scan.totalFields,
        scriptFilled:
          scan.scriptFilled,
        requestedFields:
          seenFieldIds.size,
        answered:
          appliedSummary.answered,
        validated:
          appliedSummary.kept || 0,
        corrected:
          appliedSummary.corrected || 0,
        conflicts:
          appliedSummary.conflicts || 0,
        reviewRequired:
          appliedSummary.reviewRequired,
        unresolved:
          verifiedUnresolved,
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
        pageKey:
          cleanText(
            configuration?.getPageKey?.() || window.location.pathname
          ),
        supportedControls:
          U.queryAgentElements(
            document,
            "input, select, textarea, [role='combobox'], [contenteditable='true']"
          ).length,
        scan:
          latestScan,
        agent2InFlight,
        scanInFlight
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
      repairFields:
        options?.repairFields,
      prepareScan:
        options?.prepareScan,
      getPageKey:
        options?.getPageKey,
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
    getPageState,
    collectDefaultFields,
    applyDefaultAnswers
  };
})();
