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
    .replace(/[\u2018\u2019\u02BC]/g, "")
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

  W.typeInputValue = (element, value) => {
    if (!element || element.disabled || element.readOnly) return false;
    const target = String(value ?? "");
    const inputDescription = W.normalizeText(
      `${element.getAttribute?.("type") || ""} ${element.getAttribute?.("placeholder") || ""} ${U?.getLabelText?.(element) || ""}`
    );
    const usesPageMask = element.getAttribute?.("type") === "tel" ||
      /\b(phone|telephone|mobile|mm yyyy|month year)\b/.test(inputDescription);
    const characters = usesPageMask ? target.replace(/\D/g, "") : target;

    try {
      element.focus();
      W.setInputValue(element, "");

      for (const character of characters) {
        element.dispatchEvent(new KeyboardEvent("keydown", {
          key: character,
          bubbles: true,
          cancelable: true
        }));
        W.setInputValue(element, `${element.value || ""}${character}`);
        element.dispatchEvent(new KeyboardEvent("keyup", {
          key: character,
          bubbles: true,
          cancelable: true
        }));
      }

      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    } catch (_) {
      return false;
    }
  };

  W.valuesEquivalent = (element, currentValue, targetValue) => {
    const current = String(currentValue ?? "").trim();
    const target = String(targetValue ?? "").trim();
    if (!current || !target) return false;

    const label = W.normalizeText(
      `${element?.getAttribute?.("type") || ""} ${U?.getLabelText?.(element) || ""}`
    );

    if (/\b(phone|telephone|mobile|tel)\b/.test(label)) {
      const currentDigits = current.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
      const targetDigits = target.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
      return Boolean(currentDigits) && currentDigits === targetDigits;
    }

    if (/\b(date|from|to|start|end|month year|mm yyyy)\b/.test(label)) {
      const currentDigits = current.replace(/\D/g, "");
      const targetDigits = target.replace(/\D/g, "");
      return currentDigits.length >= 4 && currentDigits === targetDigits;
    }

    if (/\b(url|website|portfolio|linkedin|github)\b/.test(label)) {
      return U?.ensureHttpUrl?.(current) === U?.ensureHttpUrl?.(target);
    }

    return W.normalizeText(current) === W.normalizeText(target);
  };

  W.canDeterministicallyWrite = element => {
    if (!element || element.disabled || element.readOnly) return false;
    if (U?.isProtectedFromDeterministicFill?.(element)) return false;
    return !String(element.value ?? element.textContent ?? "").trim();
  };

  W.fillTextField = (element, value, options = {}) => {
    const target = String(value ?? "").trim();
    if (!element || !target || element.disabled || element.readOnly) return false;

    const currentValue = String(element.value || "").trim();
    if (currentValue) {
      return W.valuesEquivalent(element, currentValue, target);
    }

    if (!W.canDeterministicallyWrite(element)) return false;

    const shouldTypeCharacters = options.typeCharacters === true ||
      element.getAttribute("type") === "tel" ||
      element.getAttribute("role") === "spinbutton";
    const applied = shouldTypeCharacters
      ? W.typeInputValue(element, target)
      : W.setInputValue(element, target);
    if (!applied) return false;

    element.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
    element.blur?.();
    if (!W.valuesEquivalent(element, element.value, target)) return false;
    if (
      element.getAttribute?.("aria-invalid") === "true" ||
      element.validity?.valid === false
    ) {
      return false;
    }
    element.dataset.fa_filled = "true";
    element.dataset.fa_fill_type = "field";
    U?.setValueOwner?.(element, "deterministic");
    return true;
  };

  W.clickElement = element => {
    if (!element || !W.isVisible(element) || element.disabled) return false;

    try {
      element.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      if (typeof PointerEvent === "function") {
        element.dispatchEvent(new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          pointerType: "mouse",
          isPrimary: true
        }));
      }
      element.dispatchEvent(new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 0,
        buttons: 1
      }));
      if (typeof PointerEvent === "function") {
        element.dispatchEvent(new PointerEvent("pointerup", {
          bubbles: true,
          cancelable: true,
          pointerType: "mouse",
          isPrimary: true
        }));
      }
      element.dispatchEvent(new MouseEvent("mouseup", {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 0,
        buttons: 0
      }));
      element.click();
      return true;
    } catch (_) {
      return false;
    }
  };

  W.isWorkdayOptionSelected = option => {
    if (!option) return false;
    if (
      option.getAttribute?.("aria-selected") === "true" ||
      option.getAttribute?.("aria-checked") === "true" ||
      /^(checked|selected|active)$/i.test(option.getAttribute?.("data-state") || "")
    ) return true;

    const choice = option.matches?.(
      'input[type="checkbox"], input[type="radio"], [role="checkbox"], [role="radio"]'
    )
      ? option
      : option.querySelector?.(
          'input[type="checkbox"], input[type="radio"], [role="checkbox"], [role="radio"]'
        );

    return choice?.checked === true ||
      choice?.getAttribute?.("aria-checked") === "true";
  };

  W.selectWorkdayOption = async (option, confirmSelection, settings = {}) => {
    if (!option) return null;

    const visibleNestedTargets = Array.from(option.querySelectorAll?.([
      '[role="checkbox"]',
      '[role="radio"]',
      "label",
      "button",
      '[role="button"]',
      '[data-automation-id*="checkbox" i]',
      '[data-automation-id*="radio" i]',
      '[data-automation-id*="label" i]'
    ].join(",")) || []).filter(target => {
      return W.isVisible(target) &&
        !target.disabled &&
        target.getAttribute?.("aria-disabled") !== "true";
    });
    const nativeTargets = Array.from(option.querySelectorAll?.(
      'input[type="checkbox"], input[type="radio"]'
    ) || []).filter(target => {
      return !target.disabled && target.getAttribute?.("aria-disabled") !== "true";
    });
    // Workday attaches the real selection handler to different nodes between
    // tenants. Try the visible option row first (the user's actual click), then
    // its visible choice/label, and use a hidden native input only as fallback.
    const targets = [...new Set([option, ...visibleNestedTargets, ...nativeTargets])];
    const perTargetTimeout = Number(settings.perTargetTimeout) || 1400;
    const finalTimeout = Number(settings.finalTimeout) || 3500;

    const readConfirmation = () => {
      try {
        if (typeof confirmSelection === "function") {
          return confirmSelection() || null;
        }
        return W.isWorkdayOptionSelected(option) ? true : null;
      } catch (_) {
        return null;
      }
    };

    for (const target of targets) {
      const alreadyConfirmed = readConfirmation();
      if (alreadyConfirmed) return alreadyConfirmed;
      if (W.isWorkdayOptionSelected(option)) return true;

      let clicked = W.clickElement(target);
      if (!clicked && target?.isConnected && typeof target.click === "function") {
        try {
          target.click();
          clicked = true;
        } catch (_) {}
      }
      if (!clicked) continue;

      const confirmed = await W.waitFor(readConfirmation, {
        timeout: perTargetTimeout,
        interval: 100
      });
      if (confirmed) return confirmed;

      if (W.isWorkdayOptionSelected(option)) {
        const settled = await W.waitFor(readConfirmation, {
          timeout: finalTimeout,
          interval: 120
        });
        return settled || true;
      }
    }

    const hasChoiceControl = Boolean(option.querySelector?.(
      'input[type="checkbox"], input[type="radio"], [role="checkbox"], [role="radio"]'
    ));
    const keyboardTarget = hasChoiceControl
      ? visibleNestedTargets.find(target => target.matches?.(
          '[role="checkbox"], [role="radio"], label'
        )) || option
      : settings.control?.isConnected
        ? settings.control
        : option;
    const key = hasChoiceControl ? " " : "Enter";
    try {
      keyboardTarget.focus?.();
      keyboardTarget.dispatchEvent(new KeyboardEvent("keydown", {
        key,
        code: key === " " ? "Space" : "Enter",
        keyCode: key === " " ? 32 : 13,
        which: key === " " ? 32 : 13,
        bubbles: true,
        cancelable: true
      }));
      keyboardTarget.dispatchEvent(new KeyboardEvent("keyup", {
        key,
        code: key === " " ? "Space" : "Enter",
        keyCode: key === " " ? 32 : 13,
        which: key === " " ? 32 : 13,
        bubbles: true,
        cancelable: true
      }));
    } catch (_) {}

    return await W.waitFor(readConfirmation, {
      timeout: finalTimeout,
      interval: 120
    });
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

    if (control?.id) {
      try {
        const associated = document.querySelector(
          `[data-associated-widget="${CSS.escape(control.id)}"]`
        );
        if (associated) return associated;
      } catch (_) {}
    }

    const fieldRoot = control?.closest?.(
      '[data-automation-id*="formField" i], [role="group"], fieldset'
    );
    if (fieldRoot) {
      const localPopup = Array.from(fieldRoot.querySelectorAll([
        '[data-automation-activepopup="true"]',
        '[data-automation-id="selectWidget-SuggestionPopup"]',
        '[role="listbox"]'
      ].join(","))).filter(W.isVisible).pop();
      if (localPopup) return localPopup;

      const hasLocalOptions = fieldRoot.querySelector([
        '[data-automation-id="promptOption"]',
        '[data-automation-id="multiSelectOption"]',
        '[role="option"]'
      ].join(","));
      if (hasLocalOptions) return fieldRoot;
    }

    const visiblePopups = Array.from(document.querySelectorAll([
      '[data-automation-activepopup="true"]',
      '[data-automation-id="selectWidget-SuggestionPopup"]',
      '[role="listbox"]'
    ].join(","))).filter(popup => {
      return W.isVisible(popup) && popup.querySelector([
        '[data-automation-id="promptOption"]',
        '[data-automation-id="multiSelectOption"]',
        '[data-automation-id="menuItem"]',
        '[role="option"]'
      ].join(","));
    });

    if (visiblePopups.length === 1) return visiblePopups[0];
    if (visiblePopups.length > 1 && control?.getBoundingClientRect) {
      const controlRect = control.getBoundingClientRect();
      return visiblePopups
        .map(popup => {
          const rect = popup.getBoundingClientRect();
          const verticalDistance = Math.min(
            Math.abs(rect.top - controlRect.bottom),
            Math.abs(controlRect.top - rect.bottom)
          );
          const horizontalDistance = Math.abs(rect.left - controlRect.left);
          return { popup, distance: verticalDistance + horizontalDistance };
        })
        .sort((first, second) => first.distance - second.distance)[0]?.popup || null;
    }
    return null;
  };

  W.getWorkdayPopup = getControlledPopup;

  W.getWorkdayOptions = control => {
    const popup = getControlledPopup(control);
    if (!popup) return [];
    const root = popup;
    return Array.from(root.querySelectorAll(
      [
        '[data-automation-id="promptOption"]',
        '[data-automation-id="multiSelectOption"]',
        '[data-automation-id="menuItem"]',
        '[role="option"]'
      ].join(",")
    )).filter(option => {
      return W.isVisible(option) &&
        !option.closest('[data-automation-id^="selectedItem"]');
    });
  };

  W.findBestOption = (options, targetValue, settings = {}) => {
    const target = W.normalizeText(targetValue);
    if (!target) return null;
    const usable = options.filter(option => W.normalizeText(W.getElementText(option)));
    const exact = usable.find(option => W.normalizeText(W.getElementText(option)) === target);
    if (exact) return exact;

    const wholeValueMatches = usable.filter(option => {
      const optionText = W.normalizeText(W.getElementText(option));
      return optionText.startsWith(`${target} `) || optionText.endsWith(` ${target}`);
    });
    if (
      settings.allowAlias === true &&
      wholeValueMatches.length === 1 &&
      (U?.getSemanticMatchScore?.(
        W.getElementText(wholeValueMatches[0]),
        targetValue
      ) || 0) >= 0.74
    ) {
      return wholeValueMatches[0];
    }

    if (settings.allowSemantic === false || settings.exact === true) return null;
    return U?.findBestSemanticMatch?.(
      usable,
      targetValue,
      W.getElementText,
      {
        minimumScore: settings.minimumScore,
        minimumGap: settings.minimumGap
      }
    ) || null;
  };

  W.readDropdownValue = (container, trigger) => {
    const selected = Array.from(container?.querySelectorAll?.(
      '[data-automation-id^="selectedItem"], [aria-selected="true"], [data-testid*="selected"]'
    ) || [])
      .map(W.getElementText)
      .filter(Boolean)
      .join(", ");
    if (selected) return selected;
    if (trigger?.tagName === "INPUT") {
      const value = String(trigger.value || "").trim();
      return /^(select|select one|choose|choose one|please select)$/i.test(value)
        ? ""
        : value;
    }
    const value = W.getElementText(trigger)
      .replace(/^(select|choose)\s*/i, "")
      .trim();
    return /^(one|please select)$/i.test(value) ? "" : value;
  };

  W.closeDropdown = control => {
    for (const type of ["keydown", "keyup"]) {
      control?.dispatchEvent(new KeyboardEvent(type, {
        key: "Escape",
        code: "Escape",
        keyCode: 27,
        which: 27,
        bubbles: true,
        cancelable: true
      }));
    }
  };

  W.fillWorkdayDropdown = async (container, targetValue, settings = {}) => {
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
    if (currentValue) {
      return W.normalizeText(currentValue) === W.normalizeText(target) ||
        U?.smartMatch?.(currentValue, target) === true;
    }
    if (
      U?.isProtectedFromDeterministicFill?.(trigger) ||
      U?.isProtectedFromDeterministicFill?.(container)
    ) return false;

    container.dataset.fa_dropdown_processing = "true";

    try {
      if (!W.clickElement(trigger)) return false;

      let options = await W.waitFor(() => {
        const found = W.getWorkdayOptions(trigger);
        return found.length ? found : null;
      }, { timeout: 4500 });

      let match = W.findBestOption(options || [], target, settings);

      if (!match) {
        const popup = getControlledPopup(trigger);
        const searchInputs = Array.from(popup?.querySelectorAll?.(
          'input[data-automation-id="searchBox"], input[role="combobox"]'
        ) || []).filter(input => {
          return W.isVisible(input) &&
            input !== trigger &&
            !input.closest('[data-automation-id="formField-skills"]');
        });
        const searchInput = searchInputs[searchInputs.length - 1];

        if (searchInput) {
          W.typeInputValue(searchInput, target);
          match = await W.waitFor(() => {
            options = W.getWorkdayOptions(trigger);
            return W.findBestOption(options, target, settings);
          }, { timeout: 6000, interval: 180 });
        }
      }

      if (!match) {
        W.closeDropdown(trigger);
        return false;
      }

      const matchedLabel = W.getElementText(match) || target;
      const confirmed = await W.selectWorkdayOption(match, () => {
        const selectedValue = W.readDropdownValue(container, trigger);
        return W.normalizeText(selectedValue) === W.normalizeText(matchedLabel)
          ? selectedValue
          : null;
      }, {
        perTargetTimeout: 1000,
        finalTimeout: 3500
      });

      if (!confirmed) return false;
      trigger.dataset.fa_filled = "true";
      trigger.dataset.fa_fill_type = "dropdown";
      container.dataset.fa_filled = "true";
      U?.setValueOwner?.(trigger, "deterministic");
      U?.setValueOwner?.(container, "deterministic");
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
      .join(" ");
    const headingText = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5"))
      .filter(W.isVisible)
      .map(W.getElementText)
      .join(" ");
    const normalizedLabels = W.normalizeText(labelText);
    const normalizedHeadings = W.normalizeText(headingText);

    const hasReviewHeading = Array.from(
      document.querySelectorAll("h1, h2, h3, h4, h5")
    ).filter(W.isVisible).some(element => {
      return /^(review|review your application)$/i.test(W.getElementText(element).trim());
    });

    if (/voluntary disclosures?|self identification/.test(normalizedHeadings)) {
      return "VOLUNTARY_DISCLOSURES";
    }

    if (/application questions?/.test(normalizedHeadings)) {
      return "APPLICATION_QUESTIONS";
    }

    if (
      /\bmy experience\b|\bwork experience\b|\beducation\b/.test(normalizedHeadings) ||
      normalizedLabels.includes("type to add skills") ||
      document.querySelector('[data-automation-id="workExperienceSection"], [data-automation-id="educationSection"]')
    ) {
      return "EXPERIENCE_EDUCATION";
    }

    if (
      /\bmy information\b/.test(normalizedHeadings) ||
      normalizedLabels.includes("given name") ||
      normalizedLabels.includes("first name") ||
      normalizedLabels.includes("family name") ||
      normalizedLabels.includes("last name") ||
      normalizedLabels.includes("address line 1") ||
      document.querySelector([
        'input[data-automation-id="legalNameSection_firstName"]',
        'input[data-automation-id="legalNameSection_lastName"]',
        'input[data-automation-id="addressSection_addressLine1"]',
        'input[data-automation-id="phone-number"]'
      ].join(","))
    ) {
      return "PERSONAL_INFO";
    }

    if (
      normalizedLabels.includes("gender") ||
      normalizedLabels.includes("veteran") ||
      normalizedLabels.includes("ethnicity")
    ) {
      return "APPLICATION_QUESTIONS";
    }

    if (hasReviewHeading) return "REVIEW";

    return "UNKNOWN";
  };

  W.getCurrentPage = getCurrentPage;

  W.getPageKey = () => {
    const page = getCurrentPage();
    const heading = Array.from(
      document.querySelectorAll("h1, h2, h3, h4")
    )
      .filter(W.isVisible)
      .map(W.getElementText)
      .find(text => {
        return /^(my information|my experience|application questions?|voluntary disclosures?|review)\b/i.test(text);
      }) || page;

    return `${page}:${W.normalizeText(heading) || "unknown"}`;
  };

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
        case "VOLUNTARY_DISCLOSURES":
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
    if (typeof W.repairExperienceStructure === "function") {
      await W.repairExperienceStructure(W.lastProfile);
      return;
    }

    if (getCurrentPage() === "EXPERIENCE_EDUCATION") {
      W.resetSectionAddBlocks?.();
      W.resetSkillAttempts?.();
      await W.handleExperience?.(W.lastProfile, { structureOnly: true });
    }
  };

  const extractWorkdayJobContext = () => {
    if (W.cachedJobContext) {
      return {
        ...W.cachedJobContext,
        jobUrl: window.location.href
      };
    }

    const pageHeadingPattern = /^(my information|my experience|application questions?|voluntary disclosures?|review|work experience|education|skills|websites?)\b/i;
    const directTitle = [
      '[data-automation-id="jobPostingTitle"]',
      '[data-automation-id="jobTitle"]',
      '[data-automation-id="jobPostingHeader"]'
    ]
      .map(selector => document.querySelector(selector))
      .map(W.getElementText)
      .find(Boolean);
    const visibleHeading = Array.from(
      document.querySelectorAll("h1, h2, h3, h4")
    )
      .filter(W.isVisible)
      .map(W.getElementText)
      .find(text => text && !pageHeadingPattern.test(text));
    const documentTitle = String(document.title || "")
      .replace(/\s*[-|]\s*workday.*$/i, "")
      .trim();
    const usableDocumentTitle = /^(workday|careers?|jobs?)$/i.test(documentTitle)
      ? ""
      : documentTitle;
    const pathSegments = window.location.pathname
      .split("/")
      .map(segment => decodeURIComponent(segment))
      .filter(Boolean);
    const applyIndex = pathSegments.findIndex(segment => /^apply$/i.test(segment));
    const jobSlug = applyIndex > 0
      ? pathSegments[applyIndex - 1]
          .replace(/_[A-Z0-9-]+$/i, "")
          .replace(/[-_]+/g, " ")
          .trim()
      : "";
    const jobTitle = directTitle || usableDocumentTitle || jobSlug || visibleHeading;
    const tenant = window.location.hostname.split(".")[0] || "";

    W.cachedJobContext = {
      company: tenant,
      jobTitle: String(jobTitle || "").slice(0, 300),
      jobUrl: window.location.href,
      location: "",
      description: "",
      companyDescription: "",
      responsibilities: [],
      requirements: [],
      preferredQualifications: []
    };

    return W.cachedJobContext;
  };

  const startEngine = () => {
    chrome.storage.local.get(["autofillEnabled", "profileData"], async values => {
      if (values.autofillEnabled === false) return;

      let currentProfile = values.profileData || null;

      if (!currentProfile) {
        try {
          const response = await new Promise(resolve => {
            chrome.runtime.sendMessage(
              { action: "FETCH_PROFILE_DATA" },
              result => resolve(chrome.runtime.lastError ? null : result)
            );
          });
          if (response?.success && response.data) {
            currentProfile = response.data;
          }
        } catch (_) {}
      }

      if (!currentProfile) {
        console.warn("[FastApply] Workday autofill is waiting for profile data.");
      }

      let automaticRunInFlight = false;
      let activePageKey = "";
      let activeControlSignature = "";
      let queuedPageKey = "";
      let pendingRun = 0;
      const pagePassCounts = new Map();
      const processedSignatures = new Set();

      const getControlSignature = () => {
        const controls = Array.from(document.querySelectorAll([
          "input:not([type='hidden'])",
          "select",
          "textarea",
          '[data-automation-id="selectWidget"]',
          '[role="combobox"]'
        ].join(","))).filter(element => {
          return W.isVisible(element) &&
            !element.closest('[role="listbox"], [data-automation-activepopup="true"]');
        });

        return controls.map((element, index) => [
          element.tagName,
          element.id || "",
          element.getAttribute("name") || "",
          element.getAttribute("data-automation-id") || "",
          U?.getLabelText?.(element) || "",
          index
        ].join(":"))
          .join("|");
      };

      const run = async expectedPageKey => {
        if (automaticRunInFlight) {
          queuedPageKey = expectedPageKey;
          return;
        }
        if (expectedPageKey !== W.getPageKey()) return;
        automaticRunInFlight = true;
        try {
          await runWorkdayDeterministic(currentProfile);
        } finally {
          automaticRunInFlight = false;
          const completedPasses = (pagePassCounts.get(expectedPageKey) || 0) + 1;
          pagePassCounts.set(expectedPageKey, completedPasses);

          const currentPageKey = W.getPageKey();
          const nextPageKey = queuedPageKey;
          queuedPageKey = "";

          if (nextPageKey && nextPageKey === currentPageKey) {
            window.setTimeout(() => run(nextPageKey), 0);
          } else if (
            expectedPageKey === currentPageKey &&
            completedPasses < 2
          ) {
            // One bounded follow-up catches controls revealed by country,
            // preferred-name and other conditional Workday choices.
            window.setTimeout(() => run(currentPageKey), 450);
          }
        }
      };

      const scheduleForActivePage = () => {
        if (!currentProfile) return;
        const pageKey = W.getPageKey();
        if (pageKey.startsWith("UNKNOWN:")) return;

        const controlSignature = getControlSignature();
        if (!controlSignature) return;
        const signatureKey = `${pageKey}|${controlSignature}`;
        if (
          pageKey === activePageKey &&
          controlSignature === activeControlSignature
        ) return;
        if (processedSignatures.has(signatureKey)) return;

        processedSignatures.add(signatureKey);
        activePageKey = pageKey;
        activeControlSignature = controlSignature;
        if (!pagePassCounts.has(pageKey)) pagePassCounts.set(pageKey, 0);
        window.clearTimeout(pendingRun);
        pendingRun = window.setTimeout(() => {
          run(pageKey);
        }, 450);
      };

      const observer = new MutationObserver(scheduleForActivePage);
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });

      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local") return;
        if (changes.profileData?.newValue) {
          currentProfile = changes.profileData.newValue;
          W.lastProfile = currentProfile;
          activeControlSignature = "";
          scheduleForActivePage();
        }
      });

      scheduleForActivePage();
    });
  };

  window.FastApplyAgent2Controller?.register({
    atsPlatform: "workday",
    runDeterministic: runWorkdayDeterministic,
    collectFields: collectWorkdayFields,
    repairFields: repairWorkdayFields,
    prepareScan: profile => {
      W.lastProfile = profile;
    },
    getPageKey: W.getPageKey,
    extractJobContext: extractWorkdayJobContext
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      window.setTimeout(startEngine, 0);
    }, { once: true });
  } else {
    window.setTimeout(startEngine, 0);
  }
})();
