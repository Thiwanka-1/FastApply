// public/workday-orchestrator.js
console.log(
  `[FastApply] Workday Orchestrator Active. (build ${
    typeof FASTAPPLY_BUILD === "string" ? FASTAPPLY_BUILD : "unknown"
  })`
);

window.WorkdayEngine = window.WorkdayEngine || {};

(() => {
  const W = window.WorkdayEngine;
  const U = window.FastApplyUtils;

  W.debug = (...details) => {
    try {
      console.debug("[FastApply:workday]", ...details);
    } catch (_) {}
  };

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

  // Workday prompt rows often render their label twice (icon + text node).
  // Collapse an exactly doubled string back to the single option label.
  W.getOptionText = element => {
    const text = W.getElementText(element);
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length > 1 && words.length % 2 === 0) {
      const midpoint = words.length / 2;
      const first = words.slice(0, midpoint).join(" ");
      const second = words.slice(midpoint).join(" ");
      if (W.normalizeText(first) === W.normalizeText(second)) return first;
    }
    return text;
  };

  const WORKDAY_PLACEHOLDER_PATTERN = /^(select|select one|select a value|select all that apply|choose|choose one|please select|search|type to search|one|none selected)$/;

  // Single source of truth for "this dropdown is still empty". Tenants render
  // "Select One", "Select...", "Search", localized variants with trailing dots.
  W.isWorkdayPlaceholder = value => {
    const normalized = W.normalizeText(String(value ?? "").replace(/[.…]+\s*$/, ""));
    return !normalized || WORKDAY_PLACEHOLDER_PATTERN.test(normalized);
  };

  // Label text with decorations ("(Required)", trailing asterisks) removed so
  // anchored question patterns still match.
  W.normalizeQuestion = value => W.normalizeText(value)
    .replace(/\b(required|optional)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

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
      const prototype = element.tagName === "TEXTAREA"
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      const writeValue = nextValue => {
        if (setter) setter.call(element, nextValue);
        else element.value = nextValue;
      };

      // Focus once and defer the change event until the full value has been
      // typed; per-character focus/change churn triggers Workday's masked
      // input validation mid-value and marks the field aria-invalid.
      element.focus();
      writeValue("");
      element.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "deleteContentBackward"
      }));

      for (const character of characters) {
        element.dispatchEvent(new KeyboardEvent("keydown", {
          key: character,
          bubbles: true,
          cancelable: true
        }));
        writeValue(`${element.value || ""}${character}`);
        element.dispatchEvent(new InputEvent("input", {
          bubbles: true,
          data: character,
          inputType: "insertText"
        }));
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
    // aria-selected and data-state "selected"/"active" mark the HIGHLIGHTED
    // (keyboard-focused) row in Workday listboxes — usually the first search
    // result — not a committed choice. Treating them as "already selected"
    // made the engine skip the click on the top result, so nothing was ever
    // actually selected. Only trust real checked state.
    if (
      option.getAttribute?.("aria-checked") === "true" ||
      /^checked$/i.test(option.getAttribute?.("data-state") || "")
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

    // Workday wraps each field in a dedicated formField container. Prefer it:
    // the ancestor walks below can land on a row wrapper that spans the
    // neighbouring field (writing values into the wrong control).
    const formField = label.closest?.('[data-automation-id*="formField" i]');
    if (formField && (!linkedControl || formField.contains(linkedControl))) {
      return formField;
    }

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
        if (current.contains(label)) return current;
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
    const optionKey = option => W.normalizeText(W.getOptionText(option));
    const usable = options.filter(option => optionKey(option));
    const exact = usable.find(option => optionKey(option) === target);
    if (exact) return exact;

    // A parenthetical qualifier does not change an option's identity:
    // "GraphQL (Query Language)" is the option for "GraphQL", "Java
    // (Programming Language)" for "Java".
    const strippedKey = option => W.normalizeText(
      W.getOptionText(option).replace(/\s*\([^)]*\)/g, " ")
    );
    const strippedMatches = usable.filter(option => strippedKey(option) === target);
    if (strippedMatches.length) return strippedMatches[0];

    const wholeValueMatches = usable.filter(option => {
      const optionText = optionKey(option);
      return optionText.startsWith(`${target} `) || optionText.endsWith(` ${target}`);
    });
    if (
      settings.allowAlias === true &&
      wholeValueMatches.length === 1 &&
      (U?.getSemanticMatchScore?.(
        W.getOptionText(wholeValueMatches[0]),
        targetValue
      ) || 0) >= 0.74
    ) {
      return wholeValueMatches[0];
    }
    // Skills-style prompts (allowAlias) return results in Workday relevance
    // order. When the skill name is a whole-word prefix of several options
    // ("Serverless" → "Serverless Computing", "Serverless Security"), the
    // top-ranked one is the intended pick; rejecting all of them left the
    // skill unselectable and burned every retry.
    if (settings.allowAlias === true && wholeValueMatches.length > 1) {
      return wholeValueMatches[0];
    }

    if (settings.allowSemantic === false || settings.exact === true) return null;
    return U?.findBestSemanticMatch?.(
      usable,
      targetValue,
      W.getOptionText,
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
      .map(W.getOptionText)
      .filter(Boolean)
      .join(", ");
    if (selected) return selected;
    if (trigger?.tagName === "INPUT") {
      const value = String(trigger.value || "").trim();
      return W.isWorkdayPlaceholder(value) ? "" : value;
    }
    // Only trust text actually rendered inside the trigger. The aria-label /
    // title fallbacks repeat the field label ("Country"), not the chosen
    // value, and previously made empty dropdowns look filled.
    const rendered = String(trigger?.innerText || trigger?.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!rendered || W.isWorkdayPlaceholder(rendered)) return "";
    const labelText = W.normalizeText(U?.getLabelText?.(trigger) || "");
    if (labelText && W.normalizeText(rendered) === labelText) return "";
    return rendered;
  };

  W.closeDropdown = control => {
    // Only send Escape when this control actually has an open popup that
    // will consume it. A stray Escape bubbles up to Workday's apply overlay
    // (its wizard listens at the container level) and can navigate the
    // candidate out of the flow — observed as "the page reloads back to the
    // first step" during audits.
    if (!getControlledPopup(control)) return;
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

  // Tenants open their prompt widgets from different events (plain click,
  // pointer sequence, keyboard). Try each strategy and verify the popup
  // actually rendered options before giving up — a blind synthetic click can
  // toggle the popup open and instantly closed again.
  W.openDropdown = async (trigger, options = {}) => {
    const timeout = Number(options.timeout) || 4500;
    const readOptions = () => {
      const found = W.getWorkdayOptions(trigger);
      return found.length ? found : null;
    };

    const alreadyOpen = readOptions();
    if (alreadyOpen) return alreadyOpen;

    const strategies = [
      // The pointer-sequence click is the opener proven against live
      // tenants; keep it first so alternate strategies never toggle an
      // already-opening popup shut. A synthetic-Enter strategy existed here
      // once but is deliberately gone: a bubbling Enter can activate the
      // wizard's primary "Save and Continue" action.
      () => W.clickElement(trigger),
      () => {
        try {
          trigger.scrollIntoView?.({ block: "nearest", inline: "nearest" });
          trigger.focus?.();
          trigger.click?.();
          return true;
        } catch (_) {
          return false;
        }
      }
    ];

    const perStrategyTimeout = Math.max(
      1200,
      Math.floor(timeout / strategies.length)
    );
    for (const strategy of strategies) {
      if (!strategy()) continue;
      const opened = await W.waitFor(readOptions, {
        timeout: perStrategyTimeout,
        interval: 120
      });
      if (opened) return opened;
      // If the popup is open but its options are still streaming in, keep
      // waiting instead of moving on — the next strategy's click would
      // toggle the popup closed again.
      if (getControlledPopup(trigger)) {
        const lateOptions = await W.waitFor(readOptions, {
          timeout,
          interval: 150
        });
        if (lateOptions) return lateOptions;
      }
    }
    return null;
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
      let options = await W.openDropdown(trigger, {
        timeout: Number(settings.openTimeout) || 4500
      });
      if (!options) {
        W.debug("dropdown never rendered options for:", target);
      }

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
        // Prompt fields where the trigger itself is the search input have no
        // separate popup search box — type the query into the trigger.
        const searchInput = searchInputs[searchInputs.length - 1] ||
          (trigger.tagName === "INPUT" && !trigger.readOnly ? trigger : null);

        if (searchInput) {
          W.typeInputValue(searchInput, target);
          match = await W.waitFor(() => {
            options = W.getWorkdayOptions(trigger);
            return W.findBestOption(options, target, settings);
          }, { timeout: Number(settings.searchTimeout) || 6000, interval: 180 });
        }
      }

      if (!match) {
        W.debug("no dropdown option matched:", target);
        W.closeDropdown(trigger);
        return false;
      }

      const matchedLabel = W.getOptionText(match) || target;
      const confirmed = await W.selectWorkdayOption(match, () => {
        const selectedValue = W.readDropdownValue(container, trigger);
        if (!selectedValue) return null;
        const normalizedSelected = W.normalizeText(selectedValue);
        return (
          normalizedSelected === W.normalizeText(matchedLabel) ||
          normalizedSelected === W.normalizeText(target) ||
          U?.smartMatch?.(selectedValue, matchedLabel) === true
        )
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

    // The Review page re-renders every prior section's headings, so this must
    // win before the section-specific checks classify it as something else.
    if (hasReviewHeading) return "REVIEW";

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
      const page = getCurrentPage();
      switch (page) {
        case "PERSONAL_INFO":
          return W.handlePersonalInfo?.(profile);
        case "EXPERIENCE_EDUCATION":
          return W.handleExperience?.(profile);
        case "APPLICATION_QUESTIONS":
        case "VOLUNTARY_DISCLOSURES":
          return W.handleEEO?.(profile);
        case "REVIEW":
          return false;
        default:
          // Steps with tenant-specific titles ("Additional Information",
          // "Disclosures", …) still carry Workday form fields; run the
          // generic question handler instead of skipping them silently.
          if (document.querySelector('[data-automation-id*="formField" i]')) {
            W.debug("unrecognized step, running question handler:", W.getPageKey());
            return W.handleEEO?.(profile);
          }
          W.debug("no fillable step detected:", W.getPageKey());
          return false;
      }
    };

    const previousRun = W.deterministicQueue || Promise.resolve();
    const currentRun = previousRun
      .catch(error => {
        W.debug("previous deterministic run failed:", error);
        return false;
      })
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
        } catch (error) {
          W.debug("profile fetch via background failed:", error);
        }
      }

      if (!currentProfile) {
        console.warn("[FastApply] Workday autofill is waiting for profile data.");
      }

      let automaticRunInFlight = false;
      let activePageKey = "";
      let activeControlSignature = "";
      let queuedPageKey = "";
      let pendingRun = 0;
      let lastSeenPageKey = "";
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

      const run = async (expectedPageKey, signatureKey) => {
        if (automaticRunInFlight) {
          queuedPageKey = expectedPageKey;
          return;
        }
        if (expectedPageKey !== W.getPageKey()) {
          // Workday briefly hides/re-renders the wizard heading during step
          // transitions; reschedule instead of dropping this page state
          // (recording it as processed here would block it permanently).
          W.debug("page key changed before run; rescheduling:", expectedPageKey);
          activePageKey = "";
          activeControlSignature = "";
          window.clearTimeout(pendingRun);
          pendingRun = window.setTimeout(scheduleForActivePage, 600);
          return;
        }
        automaticRunInFlight = true;
        try {
          await runWorkdayDeterministic(currentProfile);
          if (signatureKey) processedSignatures.add(signatureKey);
        } catch (error) {
          W.debug("deterministic run failed:", error);
          if (signatureKey) processedSignatures.add(signatureKey);
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

        if (pageKey !== lastSeenPageKey) {
          // A new wizard step — or a return to a previous one via Back /
          // validation re-render — starts fresh. Old signatures must never
          // block re-filling a step the user navigated back to.
          lastSeenPageKey = pageKey;
          processedSignatures.clear();
          pagePassCounts.delete(pageKey);
          activePageKey = "";
          activeControlSignature = "";
        }

        // Unrecognized steps still get a pass when they carry Workday form
        // fields (tenant-titled question pages); pure browse/search pages are
        // skipped.
        if (
          pageKey.startsWith("UNKNOWN:") &&
          !document.querySelector('[data-automation-id*="formField" i]')
        ) return;

        const controlSignature = getControlSignature();
        if (!controlSignature) return;
        const signatureKey = `${pageKey}|${controlSignature}`;
        if (
          pageKey === activePageKey &&
          controlSignature === activeControlSignature
        ) return;
        if (processedSignatures.has(signatureKey)) return;

        activePageKey = pageKey;
        activeControlSignature = controlSignature;
        if (!pagePassCounts.has(pageKey)) pagePassCounts.set(pageKey, 0);
        window.clearTimeout(pendingRun);
        pendingRun = window.setTimeout(() => {
          run(pageKey, signatureKey);
        }, 450);
      };

      // Workday's React tree mutates continuously; computing the control
      // signature per mutation batch forces synchronous layout. Debounce so
      // the (expensive) scheduling pass runs once the DOM settles.
      let observerDebounce = 0;
      const observer = new MutationObserver(() => {
        window.clearTimeout(observerDebounce);
        observerDebounce = window.setTimeout(scheduleForActivePage, 250);
      });
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
