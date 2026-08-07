// public/workday-experience-education.js
window.WorkdayEngine = window.WorkdayEngine || {};

(() => {
  const W = window.WorkdayEngine;

  const getLookupOptions = input => W.getWorkdayOptions(input);

  W.fillLookupInputAsync = async (input, value) => {
    const target = String(value ?? "").trim();
    if (!input || !target || input.dataset.fa_lookup_processing === "true") return false;

    const container = W.getFieldContainer(
      input.id ? document.querySelector(`label[for="${CSS.escape(input.id)}"]`) : null
    ) || input.parentElement;
    const selectedText = Array.from(container?.querySelectorAll?.(
      '[data-automation-id="selectedItem"], [aria-selected="true"]'
    ) || []).map(W.getElementText).join(" ");

    if (
      selectedText &&
      window.FastApplyUtils.smartMatch(selectedText, target)
    ) {
      input.dataset.fa_filled = "true";
      return true;
    }

    input.dataset.fa_lookup_processing = "true";
    delete input.dataset.fa_filled;

    try {
      W.clickElement(input);
      W.setInputValue(input, target);

      const match = await W.waitFor(() => {
        return W.findBestOption(getLookupOptions(input), target);
      }, { timeout: 6500, interval: 180 });

      if (!match) {
        W.setInputValue(input, "");
        W.closeDropdown(input);
        return false;
      }

      if (!W.clickElement(match)) return false;
      await W.wait(400);

      const confirmedText = [
        input.value,
        ...Array.from(container?.querySelectorAll?.(
          '[data-automation-id="selectedItem"], [aria-selected="true"]'
        ) || []).map(W.getElementText)
      ].join(" ");
      const confirmed = window.FastApplyUtils.smartMatch(confirmedText, target) ||
        !match.isConnected || !W.isVisible(match);

      if (!confirmed) return false;
      input.dataset.fa_filled = "true";
      input.dataset.fa_fill_type = "autocomplete";
      return true;
    } finally {
      delete input.dataset.fa_lookup_processing;
    }
  };

  W.safeFillEduDropdown = (container, targetValue) => {
    return W.fillWorkdayDropdown(container, targetValue);
  };

  const getTextControl = container => container?.querySelector(
    "input:not([type='hidden']):not([type='checkbox']):not([type='radio']), textarea"
  );

  const isLookupControl = input => Boolean(
    input?.matches?.(
      'input[role="combobox"], input[aria-haspopup="listbox"], input[data-automation-id="searchBox"]'
    )
  );

  W.handleEducation = async educationHistory => {
    if (!Array.isArray(educationHistory) || educationHistory.length === 0) return false;
    if (W.isEducating) return false;

    const section = W.findSection("education");
    if (!section) return false;
    W.isEducating = true;

    try {
      await W.ensureSectionEntries({
        section,
        expectedCount: educationHistory.length,
        anchorPattern: /^(school|school or university|university)$/
      });

      let educationIndex = -1;
      const labels = W.querySection(section, "label");

      for (const label of labels) {
        const question = W.normalizeText(W.getElementText(label));
        if (/^(school|school or university|university)$/.test(question)) {
          educationIndex += 1;
        }

        const education = educationHistory[educationIndex];
        if (!education) continue;
        const container = W.getFieldContainer(label);
        if (!container) continue;
        const input = getTextControl(container);

        if (/^(school|school or university|university)$/.test(question)) {
          if (isLookupControl(input)) await W.fillLookupInputAsync(input, education.school);
          else W.fillTextField(input, education.school);
        } else if (question === "degree" || question.includes("degree received")) {
          const hasDropdown = container.querySelector(
            '[data-automation-id="selectWidget"], [role="combobox"], [aria-haspopup="listbox"]'
          );
          if (hasDropdown) await W.safeFillEduDropdown(container, education.degree);
          else W.fillTextField(input, education.degree);
        } else if (
          question.includes("field of study") ||
          question === "major" ||
          question.includes("area of study")
        ) {
          if (isLookupControl(input)) await W.fillLookupInputAsync(input, education.major);
          else W.fillTextField(input, education.major);
        } else if (question === "minor" || question.includes("minor field")) {
          W.fillTextField(input, education.minor);
        } else if (
          question.includes("school location") ||
          question.includes("institution location")
        ) {
          W.fillTextField(input, education.institutionLocation);
        } else if (question === "gpa" || question.includes("grade point average")) {
          W.fillTextField(input, education.gpa);
        } else if (question.includes("gpa scale") || question.includes("out of")) {
          W.fillTextField(input, education.gpaScale);
        } else if (/^(from|start date|start)$/.test(question)) {
          W.fillWorkdayDate(container, education.startDate);
        } else if (/^(to|end date|end|expected graduation date)$/.test(question)) {
          W.fillWorkdayDate(container, education.endDate);
        }
      }

      return W.getSectionEntryCount(
        section,
        /^(school|school or university|university)$/
      ) >= educationHistory.length;
    } finally {
      W.isEducating = false;
    }
  };
})();
