// public/workday-experience-work.js
window.WorkdayEngine = window.WorkdayEngine || {};

(() => {
  const W = window.WorkdayEngine;
  const U = window.FastApplyUtils;

  const matchesQuestion = (pattern, question) => {
    pattern.lastIndex = 0;
    return pattern.test(question);
  };

  const formatMonthYear = (rawDate, fallbackMonth) => {
    const raw = String(rawDate || "").trim();
    if (/^\d{4}$/.test(raw)) {
      return `${String(fallbackMonth || 1).padStart(2, "0")}/${raw}`;
    }
    return W.formatMonthYear(raw);
  };

  const readDateSegmentValue = element => {
    if (!element) return "";
    const ariaNow = element.getAttribute?.("aria-valuenow");
    const raw = element.value ??
      (ariaNow !== null && ariaNow !== "" ? ariaNow : element.textContent) ??
      "";
    return String(raw).replace(/\D/g, "");
  };

  // Div-based date segments (role="spinbutton") have no .value setter;
  // Workday updates them from typed digit keys.
  const typeSpinbuttonDigits = (element, digits) => {
    try {
      element.focus?.();
      for (const character of String(digits)) {
        for (const type of ["keydown", "keypress", "keyup"]) {
          element.dispatchEvent(new KeyboardEvent(type, {
            key: character,
            code: `Digit${character}`,
            keyCode: character.charCodeAt(0),
            which: character.charCodeAt(0),
            bubbles: true,
            cancelable: true
          }));
        }
      }
      return true;
    } catch (_) {
      return false;
    }
  };

  const fillDateSegment = (element, digits) => {
    if (!element) return false;
    const target = String(digits);
    const current = readDateSegmentValue(element);
    if (current) return Number(current) === Number(target);
    if (U?.isProtectedFromDeterministicFill?.(element)) return false;

    if (element.tagName === "INPUT") {
      if (element.disabled || element.readOnly) return false;
      const matchesTarget = () =>
        Number(readDateSegmentValue(element)) === Number(target);

      // Strategy 1: the browser's native editing pipeline. Workday's masked
      // date segments ignore plain value setters (React state stays empty and
      // instantly reverts the write) but accept execCommand-driven insertion
      // exactly like real typing.
      try {
        element.focus();
        element.select?.();
        if (document.execCommand("insertText", false, target) && matchesTarget()) {
          element.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }
      } catch (_) {}

      // Strategy 2: native setter + input event.
      try {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value"
        )?.set;
        if (setter) setter.call(element, target);
        else element.value = target;
        element.dispatchEvent(new InputEvent("input", {
          bubbles: true,
          data: target,
          inputType: "insertText"
        }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      } catch (_) {
        return false;
      }
      if (matchesTarget()) return true;

      // Strategy 3: per-keystroke typing for tenants whose segments only
      // accept key-driven digits (masking/auto-advance handlers).
      W.typeInputValue?.(element, target);
      return matchesTarget();
    }

    typeSpinbuttonDigits(element, target);
    return Number(readDateSegmentValue(element)) === Number(target);
  };

  W.fillWorkdayDate = (container, rawDate, options = {}) => {
    if (!container) return false;
    if (!rawDate) {
      W.debug?.("date fill skipped — profile has no value for this date field");
      return false;
    }
    const formatted = formatMonthYear(rawDate, options.fallbackMonth);
    const [month, year] = formatted.split("/");
    if (!month || !year) {
      W.debug?.("date fill skipped — could not parse date value:", rawDate);
      return false;
    }

    // The date widget's segments can sit in a sibling wrapper next to the
    // label's immediate container; search the field's formField root too.
    const searchRoots = [container];
    const formField = container.closest?.('[data-automation-id*="formField" i]');
    if (formField && formField !== container) searchRoots.push(formField);
    // Selectors are tried strictly in priority order. A single comma-joined
    // querySelector returns whichever element comes FIRST IN THE DOM, which
    // handed back Workday's read-only "-display" element instead of the real
    // input (writes silently vanished: "month: (empty) year: (empty)").
    const findSegment = selectors => {
      for (const selector of selectors) {
        for (const root of searchRoots) {
          const found = root.querySelector(selector);
          if (found) return found;
        }
      }
      return null;
    };

    // A display/spinbutton element usually has the real editable input as a
    // sibling inside the same date wrapper — resolve to it when present.
    const resolveSegmentInput = (element, kind) => {
      if (!element || element.tagName === "INPUT") return element;
      const wrapper = element.closest('[data-automation-id="dateInputWrapper"]') ||
        element.parentElement;
      if (!wrapper) return element;
      const kindId = kind === "month" ? "Month" : "Year";
      const placeholder = kind === "month" ? "MM" : "YYYY";
      return wrapper.querySelector(`input[data-automation-id="dateSection${kindId}-input"]`) ||
        wrapper.querySelector(`input[aria-label*="${kind}" i]`) ||
        wrapper.querySelector(`input[placeholder="${placeholder}" i]`) ||
        element;
    };

    const combinedInput = findSegment([
      'input[type="month"]',
      'input[placeholder*="MM/YYYY" i]',
      'input[placeholder*="MM / YYYY" i]',
      'input[data-automation-id*="monthYear" i]',
      'input[name*="monthYear" i]'
    ]);

    if (combinedInput) {
      const target = combinedInput.type === "month"
        ? `${year}-${month}`
        : formatted;
      const filled = W.fillDeterministicText(combinedInput, target, {
        typeCharacters: combinedInput.type !== "month"
      });
      if (!filled) W.debug?.("combined date input did not accept:", formatted);
      return filled;
    }

    const monthSegment = resolveSegmentInput(findSegment([
      'input[data-automation-id="dateSectionMonth-input"]',
      'input[placeholder="MM" i]',
      'input[aria-label*="month" i]:not([aria-label*="year" i])',
      'input[name*="month" i]',
      '[data-automation-id="dateSectionMonth-display"]',
      '[role="spinbutton"][aria-label*="month" i]'
    ]), "month");
    const yearSegment = resolveSegmentInput(findSegment([
      'input[data-automation-id="dateSectionYear-input"]',
      'input[placeholder="YYYY" i]',
      'input[aria-label*="year" i]:not([aria-label*="month" i])',
      'input[name*="year" i]',
      '[data-automation-id="dateSectionYear-display"]',
      '[role="spinbutton"][aria-label*="year" i]'
    ]), "year");

    if (monthSegment && yearSegment) {
      // Fill both halves before judging validity: Workday flags the whole
      // field aria-invalid while only one segment is populated, which the
      // per-segment fill previously misread as a failure.
      const monthFilled = fillDateSegment(monthSegment, month);
      const yearFilled = fillDateSegment(yearSegment, year);
      const confirmed = monthFilled && yearFilled &&
        Number(readDateSegmentValue(monthSegment)) === Number(month) &&
        Number(readDateSegmentValue(yearSegment)) === Number(year);
      if (confirmed) {
        for (const segment of [monthSegment, yearSegment]) {
          try {
            segment.dataset.fa_filled = "true";
            segment.dataset.fa_fill_type = "date";
          } catch (_) {}
          U?.setValueOwner?.(segment, "deterministic");
        }
      } else {
        W.debug?.(
          "date segments did not confirm:",
          formatted,
          "month:", readDateSegmentValue(monthSegment),
          "year:", readDateSegmentValue(yearSegment)
        );
      }
      return confirmed;
    }

    // Some tenants expose a single MM/YYYY input using the historical
    // dateSectionMonth automation ID. Never fall back to "first input in the
    // container" — over-broad containers made that write dates into
    // neighbouring text fields.
    const singleSegment = monthSegment || yearSegment;
    if (singleSegment && singleSegment.tagName === "INPUT") {
      return W.fillDeterministicText(singleSegment, formatted, {
        typeCharacters: true
      });
    }
    W.debug?.("no date inputs found for:", formatted);
    return false;
  };

  const setCurrentWorkCheckbox = (checkbox, shouldBeChecked) => {
    if (!checkbox || checkbox.disabled || shouldBeChecked !== true) return false;
    if (checkbox.checked) return true;
    if (
      checkbox.dataset.fa_user_owned === "true" ||
      checkbox.dataset.fa_manual === "true" ||
      checkbox.dataset.fa_agent_filled === "true" ||
      U?.isProtectedFromDeterministicFill?.(checkbox)
    ) {
      return false;
    }
    checkbox.click();
    if (!checkbox.checked) return false;
    checkbox.dataset.fa_filled = "true";
    checkbox.dataset.fa_fill_type = "checkbox";
    U?.setValueOwner?.(checkbox, "deterministic");
    return true;
  };

  const getControl = (label, container) => {
    const linked = label?.control || (() => {
      const labelFor = label?.getAttribute?.("for");
      return labelFor
        ? (label.getRootNode()?.getElementById?.(labelFor) || document.getElementById(labelFor))
        : null;
    })();

    return linked || container?.querySelector(
      "input:not([type='hidden']):not([type='checkbox']):not([type='radio']), textarea"
    );
  };

  const WORK_ANCHOR = /^(job title|position title)$/;

  W.handleWork = async workHistory => {
    if (!Array.isArray(workHistory) || workHistory.length === 0) return false;
    const sectionKeywords = [
      "work experience",
      "employment history",
      "professional experience"
    ];
    // Prefer Workday's own section container: heading-based boundaries fail on
    // tenant/custom headings, which previously let the last work entry absorb
    // the Education section's labels (work dates written into education).
    const getSectionRoot = () => document.querySelector(
      '[data-automation-id="workExperienceSection"]'
    );
    let sectionRoot = getSectionRoot();
    let section = W.findSection(sectionKeywords);
    if (!section && !sectionRoot) {
      // Give a still-rendering page a brief chance before giving up.
      await W.waitFor(() => {
        sectionRoot = getSectionRoot();
        section = W.findSection(sectionKeywords);
        return section || sectionRoot ? true : null;
      }, { timeout: 3000, interval: 250 });
    }
    if (!section && !sectionRoot) {
      W.debug?.("work experience section not found");
      return false;
    }

    await W.ensureSectionEntries({
      section,
      sectionKeywords,
      expectedCount: workHistory.length,
      anchorPattern: WORK_ANCHOR,
      sectionRoot
    });

    section = W.findSection(sectionKeywords) || section;
    const labels = (sectionRoot
      ? Array.from(sectionRoot.querySelectorAll("label"))
      : W.querySection(section, "label")
    ).filter(W.isVisible);
    const anchorIndexes = labels
      .map((label, index) => ({
        index,
        question: (W.normalizeQuestion || W.normalizeText)(W.getElementText(label))
      }))
      .filter(item => matchesQuestion(WORK_ANCHOR, item.question))
      .map(item => item.index);

    for (let workIndex = 0; workIndex < anchorIndexes.length; workIndex += 1) {
      const work = workHistory[workIndex];
      if (!work) break;
      const start = anchorIndexes[workIndex];
      const end = anchorIndexes[workIndex + 1] ?? labels.length;
      const entryLabels = labels.slice(start, end);

      for (const label of entryLabels) {
        const question = (W.normalizeQuestion || W.normalizeText)(W.getElementText(label));
        const container = W.getFieldContainer(label);
        if (!container) continue;
        const input = getControl(label, container);

        if (matchesQuestion(WORK_ANCHOR, question)) {
          W.fillDeterministicText(input, work.jobTitle);
        } else if (question === "company" || question.includes("company name")) {
          W.fillDeterministicText(input, work.company);
        } else if (question === "location" || question === "job location") {
          W.fillDeterministicText(input, work.location);
        } else if (
          question.includes("role description") ||
          question === "description" ||
          question.includes("responsibilities")
        ) {
          W.fillDeterministicText(input, work.description);
        } else if (
          question.includes("currently work") ||
          question.includes("current position")
        ) {
          setCurrentWorkCheckbox(
            label.control || container.querySelector('input[type="checkbox"]'),
            work.currentlyWorkHere === true
          );
        } else if (/^(from|start date|start)$/.test(question)) {
          W.fillWorkdayDate(container, work.startDate, { fallbackMonth: 1 });
        } else if (/^(to|end date|end)$/.test(question)) {
          if (!work.currentlyWorkHere) {
            W.fillWorkdayDate(container, work.endDate, { fallbackMonth: 12 });
          }
        }
      }
    }

    return W.getSectionEntryCount(section, WORK_ANCHOR, sectionRoot) >= workHistory.length;
  };
})();
