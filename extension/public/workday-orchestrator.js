// public/workday-orchestrator.js
console.log("[FastApply] Workday Orchestrator Active.");

window.WorkdayEngine = window.WorkdayEngine || {};

(() => {
  const W = window.WorkdayEngine;
  const U = window.FastApplyUtils;

  W.wait = milliseconds => new Promise(resolve => {
    window.setTimeout(resolve, milliseconds);
  });

  W.waitFor = async (predicate, options = {}) => {
    const timeout = Number(options.timeout) || 5000;
    const interval = Number(options.interval) || 120;
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeout) {
      try {
        const result = predicate();
        if (result) return result;
      } catch (_) {}

      await W.wait(interval);
    }

    return null;
  };

  W.normalizeText = value => String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/[’']/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase()
    .trim();

  W.getElementText = element => String(
    element?.innerText ||
    element?.textContent ||
    element?.getAttribute?.("aria-label") ||
    element?.getAttribute?.("title") ||
    ""
  ).replace(/\s+/g, " ").trim();

  W.getTodayDate = () => {
    const today = new Date();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${month}/${day}/${today.getFullYear()}`;
  };

  W.formatMonthYear = value => {
    const raw = String(value || "").trim();
    if (!raw) return "";

    let match = raw.match(/^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?/);
    if (match) return `${String(match[2]).padStart(2, "0")}/${match[1]}`;

    match = raw.match(/^(\d{1,2})[-/](\d{4})$/);
    if (match) return `${String(match[1]).padStart(2, "0")}/${match[2]}`;

    match = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (match) {
      const first = Number(match[1]);
      const second = Number(match[2]);
      const month = first > 12 ? second : first;
      if (month >= 1 && month <= 12) {
        return `${String(month).padStart(2, "0")}/${match[3]}`;
      }
    }

    match = raw.match(/^(\d{4})$/);
    if (match) return `01/${match[1]}`;

    const months = {
      jan: "01", feb: "02", mar: "03", apr: "04",
      may: "05", jun: "06", jul: "07", aug: "08",
      sep: "09", oct: "10", nov: "11", dec: "12"
    };
    const parts = raw.replace(/,/g, " ").split(/\s+/).filter(Boolean);
    const month = months[String(parts[0] || "").toLowerCase().slice(0, 3)];
    const year = parts.find(part => /^\d{4}$/.test(part));
    return month && year ? `${month}/${year}` : "";
  };

  W.isVisible = element => {
    if (!element?.isConnected) return false;
    const style = window.getComputedStyle(element);
    const rectangle = element.getBoundingClientRect();
    return style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity) !== 0 &&
      rectangle.width > 0 &&
      rectangle.height > 0;
  };

  W.setInputValue = (element, value) => {
    if (!element || element.disabled || element.readOnly) return false;
    const normalized = String(value ?? "");

    try {
      const prototype = element.tagName === "TEXTAREA"
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      element.focus();
      if (setter) setter.call(element, normalized);
      else element.value = normalized;
      element.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        data: normalized,
        inputType: "insertText"
      }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    } catch (_) {
      return false;
    }
  };

  W.fillTextField = (element, value) => {
    const target = String(value ?? "").trim();
    if (!element || !target || element.disabled || element.readOnly) return false;

    if (W.normalizeText(element.value) !== W.normalizeText(target)) {
      if (!W.setInputValue(element, target)) return false;
      element.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
    }

    if (W.normalizeText(element.value) !== W.normalizeText(target)) return false;
    element.dataset.fa_filled = "true";
    element.dataset.fa_fill_type = "field";
    return true;
  };

  W.clickElement = element => {
    if (!element || !W.isVisible(element) || element.disabled) return false;

    try {
      element.dispatchEvent(new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        view: window
      }));
      element.dispatchEvent(new MouseEvent("mouseup", {
        bubbles: true,
        cancelable: true,
        view: window
      }));
      element.click();
      return true;
    } catch (_) {
      return false;
    }
  };

  W.getFieldContainer = label => {
    if (!label) return null;
    const labelFor = label.getAttribute("for");
    const linkedControl = labelFor
      ? (label.getRootNode()?.getElementById?.(labelFor) || document.getElementById(labelFor))
      : null;

    const selector = [
      "input:not([type='hidden'])",
      "select",
      "textarea",
      '[data-automation-id="selectWidget"]',
      '[role="combobox"]'
    ].join(",");

    if (linkedControl) {
      let current = linkedControl.parentElement;
      for (let depth = 0; current && depth < 5; depth += 1) {
        if (current.contains(label) || current.querySelector("label")) return current;
        current = current.parentElement;
      }
      return linkedControl.parentElement;
    }

    let current = label.parentElement;
    for (let depth = 0; current && depth < 7; depth += 1) {
      if (current.querySelector(selector)) return current;
      current = current.parentElement;
    }
    return null;
  };

  const sectionHeadingPattern = /^(work experience|education|skills|websites|certifications?|languages?|resume|documents?|voluntary disclosures?|application questions?)\b/i;

  W.findSection = keywords => {
    const wanted = (Array.isArray(keywords) ? keywords : [keywords])
      .map(W.normalizeText)
      .filter(Boolean);
    const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5"))
      .filter(W.isVisible);
    const heading = headings.find(element => {
      const text = W.normalizeText(W.getElementText(element));
      return wanted.some(keyword => text === keyword || text.startsWith(`${keyword} `));
    });
    if (!heading) return null;

    const headingIndex = headings.indexOf(heading);
    const headingLevel = Number(heading.tagName.slice(1)) || 6;
    const currentKeyword = wanted.find(keyword => {
      const text = W.normalizeText(W.getElementText(heading));
      return text === keyword || text.startsWith(`${keyword} `);
    });
    const boundary = headings.slice(headingIndex + 1).find(element => {
      const elementLevel = Number(element.tagName.slice(1)) || 6;
      const elementText = W.normalizeText(W.getElementText(element));
      return elementLevel <= headingLevel &&
        (!currentKeyword || !elementText.startsWith(currentKeyword)) &&
        sectionHeadingPattern.test(W.getElementText(element).trim());
    }) || null;

    return { heading, boundary };
  };

  W.isInSection = (element, section) => {
    if (!element || !section?.heading) return false;
    const followsHeading = Boolean(
      section.heading.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING
    );
    if (!followsHeading) return false;
    if (!section.boundary) return true;
    return Boolean(
      element.compareDocumentPosition(section.boundary) & Node.DOCUMENT_POSITION_FOLLOWING
    );
  };

  W.querySection = (section, selector) => {
    if (!section) return [];
    return Array.from(document.querySelectorAll(selector))
      .filter(element => W.isInSection(element, section));
  };

  const getControlledPopup = control => {
    const ids = [
      control?.getAttribute?.("aria-controls"),
      control?.getAttribute?.("aria-owns")
    ].filter(Boolean);

    for (const id of ids) {
      const popup = document.getElementById(id);
      if (popup) return popup;
    }
    return null;
  };

  W.getWorkdayOptions = control => {
    const popup = getControlledPopup(control);
    const root = popup || document;
    return Array.from(root.querySelectorAll(
      '[data-automation-id="promptOption"], [role="option"]'
    )).filter(W.isVisible);
  };

  W.findBestOption = (options, targetValue) => {
    const target = W.normalizeText(targetValue);
    if (!target) return null;
    const usable = options.filter(option => W.normalizeText(W.getElementText(option)));
    const exact = usable.find(option => W.normalizeText(W.getElementText(option)) === target);
    if (exact) return exact;

    const wholeValueMatches = usable.filter(option => {
      const optionText = W.normalizeText(W.getElementText(option));
      return optionText.startsWith(`${target} `) || optionText.endsWith(` ${target}`);
    });
    if (wholeValueMatches.length === 1) return wholeValueMatches[0];

    const smartMatches = usable.filter(option => {
      return U?.smartMatch?.(W.getElementText(option), targetValue) === true;
    });
    return smartMatches.length === 1 ? smartMatches[0] : null;
  };

  W.readDropdownValue = (container, trigger) => {
    const selected = Array.from(container?.querySelectorAll?.(
      '[data-automation-id="selectedItem"], [aria-selected="true"], [data-testid*="selected"]'
    ) || [])
      .map(W.getElementText)
      .filter(Boolean)
      .join(", ");
    if (selected) return selected;
    if (trigger?.tagName === "INPUT") return String(trigger.value || "").trim();
    return W.getElementText(trigger)
      .replace(/^(select|choose)\s*/i, "")
      .trim();
  };

  W.closeDropdown = control => {
    control?.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape",
      code: "Escape",
      bubbles: true
    }));
  };

  W.fillWorkdayDropdown = async (container, targetValue) => {
    const target = String(targetValue ?? "").trim();
    if (!container || !target || container.dataset.fa_dropdown_processing === "true") {
      return false;
    }

    const trigger = container.querySelector([
      '[data-automation-id="selectWidget"]',
      '[role="combobox"][aria-haspopup="listbox"]',
      'input[role="combobox"]',
      '[aria-haspopup="listbox"]'
    ].join(","));
    if (!trigger || trigger.disabled) return false;

    const currentValue = W.readDropdownValue(container, trigger);
    if (currentValue && U?.smartMatch?.(currentValue, target)) {
      trigger.dataset.fa_filled = "true";
      container.dataset.fa_filled = "true";
      return true;
    }

    container.dataset.fa_dropdown_processing = "true";

    try {
      if (!W.clickElement(trigger)) return false;

      let options = await W.waitFor(() => {
        const found = W.getWorkdayOptions(trigger);
        return found.length ? found : null;
      }, { timeout: 4500 });

      let match = W.findBestOption(options || [], target);

      if (!match) {
        const popup = getControlledPopup(trigger);
        const searchInputs = Array.from((popup || document).querySelectorAll(
          'input[data-automation-id="searchBox"], input[role="combobox"]'
        )).filter(input => {
          return W.isVisible(input) &&
            input !== trigger &&
            !input.closest('[data-automation-id="formField-skills"]');
        });
        const searchInput = searchInputs[searchInputs.length - 1];

        if (searchInput) {
          W.setInputValue(searchInput, target);
          match = await W.waitFor(() => {
            options = W.getWorkdayOptions(trigger);
            return W.findBestOption(options, target);
          }, { timeout: 6000, interval: 180 });
        }
      }

      if (!match) {
        W.closeDropdown(trigger);
        return false;
      }

      if (!W.clickElement(match)) return false;
      await W.wait(350);

      const selectedValue = W.readDropdownValue(container, trigger);
      const confirmed = Boolean(
        (selectedValue && U?.smartMatch?.(selectedValue, target)) ||
        !match.isConnected ||
        !W.isVisible(match)
      );

      if (!confirmed) return false;
      trigger.dataset.fa_filled = "true";
      trigger.dataset.fa_fill_type = "dropdown";
      container.dataset.fa_filled = "true";
      return true;
    } finally {
      delete container.dataset.fa_dropdown_processing;
    }
  };

  W.workdaySmartMatch = (optionText, targetValue) => {
    return U?.smartMatch?.(optionText, targetValue) === true;
  };

  const getCurrentPage = () => {
    const labelText = Array.from(document.querySelectorAll("label"))
      .filter(W.isVisible)
      .map(W.getElementText)
      .join(" ")
      .toLowerCase();
    const headingText = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5"))
      .filter(W.isVisible)
      .map(W.getElementText)
      .join(" ")
      .toLowerCase();

    if (
      headingText.includes("work experience") ||
      headingText.includes("education") ||
      labelText.includes("type to add skills")
    ) {
      return "EXPERIENCE_EDUCATION";
    }

    if (
      labelText.includes("given name") ||
      labelText.includes("family name") ||
      labelText.includes("address line 1") ||
      document.querySelector('input[data-automation-id="legalNameSection_firstName"]')
    ) {
      return "PERSONAL_INFO";
    }

    if (
      headingText.includes("voluntary disclosure") ||
      headingText.includes("self identify") ||
      labelText.includes("gender") ||
      labelText.includes("veteran") ||
      labelText.includes("ethnicity") ||
      document.querySelector('[role="combobox"], input[type="radio"], input[type="checkbox"]')
    ) {
      return "APPLICATION_QUESTIONS";
    }

    return "UNKNOWN";
  };

  W.getCurrentPage = getCurrentPage;

  const runWorkdayDeterministic = async profile => {
    if (!profile) return false;
    W.lastProfile = profile;

    const execute = async () => {
      switch (getCurrentPage()) {
        case "PERSONAL_INFO":
          return W.handlePersonalInfo?.(profile);
        case "EXPERIENCE_EDUCATION":
          return W.handleExperience?.(profile);
        case "APPLICATION_QUESTIONS":
          return W.handleEEO?.(profile);
        default:
          return false;
      }
    };

    const previousRun = W.deterministicQueue || Promise.resolve();
    const currentRun = previousRun
      .catch(() => false)
      .then(execute);
    W.deterministicQueue = currentRun;

    try {
      return await currentRun;
    } finally {
      if (W.deterministicQueue === currentRun) W.deterministicQueue = null;
    }
  };

  const collectWorkdayFields = async () => {
    const standardFields = await window.FastApplyAgent2Controller.collectDefaultFields();
    const structuralFields = getCurrentPage() === "EXPERIENCE_EDUCATION"
      ? (W.collectReconciliationIssues?.(W.lastProfile) || [])
      : [];
    return [...standardFields, ...structuralFields];
  };

  const repairWorkdayFields = async () => {
    if (!W.lastProfile) return;
    await runWorkdayDeterministic(W.lastProfile);
  };

  const startEngine = () => {
    chrome.storage.local.get(["autofillEnabled", "profileData"], values => {
      if (values.autofillEnabled === false || !values.profileData) return;

      let automaticRunInFlight = false;
      const run = async () => {
        if (automaticRunInFlight) return;
        automaticRunInFlight = true;
        try {
          await runWorkdayDeterministic(values.profileData);
        } finally {
          automaticRunInFlight = false;
        }
      };

      run();
      window.setInterval(run, 2500);
    });
  };

  window.FastApplyAgent2Controller?.register({
    atsPlatform: "workday",
    runDeterministic: runWorkdayDeterministic,
    collectFields: collectWorkdayFields,
    repairFields: repairWorkdayFields
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startEngine, { once: true });
  } else {
    startEngine();
  }
})();
