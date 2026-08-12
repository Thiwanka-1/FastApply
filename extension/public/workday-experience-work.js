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

  W.fillWorkdayDate = (container, rawDate, options = {}) => {
    if (!container || !rawDate) return false;
    const formatted = formatMonthYear(rawDate, options.fallbackMonth);
    const [month, year] = formatted.split("/");
    if (!month || !year) return false;

    const combinedInput = container.querySelector([
      'input[type="month"]',
      'input[placeholder*="MM/YYYY" i]',
      'input[placeholder*="MM / YYYY" i]',
      'input[data-automation-id*="monthYear" i]',
      'input[name*="monthYear" i]'
    ].join(","));

    if (combinedInput) {
      const target = combinedInput.type === "month"
        ? `${year}-${month}`
        : formatted;
      return W.fillDeterministicText(combinedInput, target, {
        typeCharacters: combinedInput.type !== "month"
      });
    }

    const monthInput = container.querySelector(
      'input[data-automation-id="dateSectionMonth-input"], input[name*="month" i]'
    );
    const yearInput = container.querySelector(
      'input[data-automation-id="dateSectionYear-input"], input[name*="year" i]'
    );

    if (monthInput && yearInput) {
      const monthFilled = String(monthInput.value || "").trim()
        ? true
        : W.fillDeterministicText(monthInput, month, { typeCharacters: true });
      const yearFilled = String(yearInput.value || "").trim()
        ? true
        : W.fillDeterministicText(yearInput, year, { typeCharacters: true });
      return monthFilled && yearFilled;
    }

    // Some Workday tenants expose a single MM/YYYY input using the historical
    // dateSectionMonth automation ID.
    const singleInput = monthInput || yearInput || container.querySelector(
      'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])'
    );
    return singleInput
      ? W.fillDeterministicText(singleInput, formatted, { typeCharacters: true })
      : false;
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
    let section = W.findSection(sectionKeywords);
    if (!section) return false;

    await W.ensureSectionEntries({
      section,
      sectionKeywords,
      expectedCount: workHistory.length,
      anchorPattern: WORK_ANCHOR
    });

    section = W.findSection(sectionKeywords) || section;
    const labels = W.querySection(section, "label").filter(W.isVisible);
    const anchorIndexes = labels
      .map((label, index) => ({
        index,
        question: W.normalizeText(W.getElementText(label))
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
        const question = W.normalizeText(W.getElementText(label));
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

    return W.getSectionEntryCount(section, WORK_ANCHOR) >= workHistory.length;
  };
})();
