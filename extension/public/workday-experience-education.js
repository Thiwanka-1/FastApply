// public/workday-experience-education.js
window.WorkdayEngine = window.WorkdayEngine || {};

(() => {
  const W = window.WorkdayEngine;
  const U = window.FastApplyUtils;

  const EDUCATION_ANCHOR = /^(school|school or university|university|institution)$/;

  const matchesQuestion = (pattern, question) => {
    pattern.lastIndex = 0;
    return pattern.test(question);
  };

  const cleanSelectedText = value => String(value || "")
    .replace(/^\s*(remove|delete)\s+/i, "")
    .replace(/\s+(remove|delete)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  const triggerLookupEnter = input => {
    if (!input) return false;
    try {
      input.focus();
      for (const type of ["keydown", "keypress", "keyup"]) {
        input.dispatchEvent(new KeyboardEvent(type, {
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true
        }));
      }
      return true;
    } catch (_) {
      return false;
    }
  };

  W.triggerWorkdayLookupEnter = triggerLookupEnter;

  const normalizeDegree = value => {
    const raw = String(value || "").trim();
    const key = W.normalizeText(raw).replace(/\bdegree\b/g, "").trim();
    const aliases = [
      [/^(b e|be|beng|bachelor of engineering)$/, "Bachelor of Engineering"],
      [/^(b a|ba|bachelor of arts)$/, "Bachelor of Arts"],
      [/^(b s|bs|bsc|bachelor of science)$/, "Bachelor of Science"],
      [/^(bba|bachelor of business administration)$/, "Bachelor of Business Administration"],
      [/^(bcom|b comm|bachelor of commerce)$/, "Bachelor of Commerce"],
      [/^(m a|ma|master of arts)$/, "Master of Arts"],
      [/^(m s|ms|msc|master of science)$/, "Master of Science"],
      [/^(mba|master of business administration)$/, "Master of Business Administration"],
      [/^(phd|ph d|doctor of philosophy)$/, "Doctor of Philosophy"],
      [/^(jd|j d|juris doctor)$/, "Juris Doctor"]
    ];
    return aliases.find(([pattern]) => pattern.test(key))?.[1] || raw;
  };

  W.normalizeWorkdayDegree = normalizeDegree;

  const readLookupSelections = container => {
    if (!container) return [];
    const values = Array.from(container.querySelectorAll([
      '[data-automation-id="selectedItem"]',
      '[data-automation-id*="selected" i]',
      '[class*="selectedItem"]',
      '[class*="multiValue"]',
      'button[aria-label^="Remove " i]'
    ].join(","))).map(element => {
      const ariaLabel = element.getAttribute("aria-label") || "";
      const title = element.getAttribute("title") || "";
      const text = /^remove\s+/i.test(ariaLabel)
        ? ariaLabel.replace(/^remove\s+/i, "")
        : title || W.getElementText(element);
      return cleanSelectedText(text);
    }).filter(value => value && !W.isWorkdayPlaceholder(value));

    return [...new Map(values.map(value => [W.normalizeText(value), value])).values()];
  };

  W.fillLookupInputAsync = async (input, value, settings = {}) => {
    const target = String(value ?? "").trim();
    if (!input || !target || input.dataset.fa_lookup_processing === "true") return false;

    const label = input.id
      ? document.querySelector(`label[for="${CSS.escape(input.id)}"]`)
      : null;
    const container = W.getFieldContainer(label) ||
      input.closest('[data-automation-id*="formField" i], [role="group"]') ||
      input.parentElement;
    const existingSelections = readLookupSelections(container);

    // Deterministic autofill never replaces a real lookup choice. Agent audit
    // handles correctness separately.
    if (existingSelections.length) {
      return true;
    }

    const inputOwner = U?.getValueOwner?.(input) || "";
    const rawValue = String(input.value || "").trim();
    if (
      rawValue &&
      (
        inputOwner === "user" ||
        input.dataset.fa_user_owned === "true" ||
        input.dataset.fa_filled === "true"
      )
    ) return false;

    // A typed lookup query is not a committed Workday selection. Previous
    // failed runs can leave that raw query behind; clear and retry it unless it
    // belongs to the applicant or was already verified as selected.
    if (rawValue) W.setInputValue(input, "");
    if (!W.canFillDeterministicControl(input)) return false;

    const targetKey = W.normalizeText(target);

    input.dataset.fa_lookup_processing = "true";
    input.dataset.fa_lookup_script_owned = "true";

    try {
      W.clickElement(input);
      W.setInputValue(input, target);

      if (settings.pressEnter === true) {
        await W.wait(120);
        triggerLookupEnter(input);
      }

      const match = await W.waitFor(() => {
        const options = W.getWorkdayOptions(input);
        const exact = options.find(option => {
          return W.normalizeText(W.getElementText(option)) === targetKey;
        });
        return exact || W.findBestOption(options, target) ||
          (settings.selectTopResult === true ? options[0] : null);
      }, { timeout: 6500, interval: 180 });

      if (!match) {
        if (W.normalizeText(input.value) === targetKey) W.setInputValue(input, "");
        W.closeDropdown(input);
        input.dataset.fa_lookup_failed_target = targetKey;
        return false;
      }

      await W.wait(240);
      const liveOptions = W.getWorkdayOptions(input);
      const liveMatch = W.findBestOption(liveOptions, target) ||
        (settings.selectTopResult === true ? liveOptions[0] : null) ||
        match;
      const matchedLabel = W.getElementText(liveMatch);
      const beforeKeys = new Set(existingSelections.map(W.normalizeText));
      const confirmed = await W.selectWorkdayOption(liveMatch, () => {
        const selected = readLookupSelections(container);
        if (selected.some(item => !beforeKeys.has(W.normalizeText(item)))) return true;

        const current = W.normalizeText(input.value);
        const expected = W.normalizeText(matchedLabel || target);
        return (
          input.getAttribute("aria-expanded") !== "true" &&
          current &&
          current === expected
        );
      }, {
        perTargetTimeout: 1200,
        finalTimeout: 3500,
        control: input
      });

      if (!confirmed) {
        input.dataset.fa_lookup_failed_target = targetKey;
        W.closeDropdown(input);
        return false;
      }

      delete input.dataset.fa_lookup_failed_target;
      input.dataset.fa_filled = "true";
      input.dataset.fa_fill_type = "autocomplete";
      U?.setValueOwner?.(input, "deterministic");
      return true;
    } finally {
      delete input.dataset.fa_lookup_processing;
      delete input.dataset.fa_lookup_script_owned;
    }
  };

  W.safeFillEduDropdown = (container, targetValue) => {
    return W.fillDeterministicDropdown(container, targetValue);
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

  const isLookupControl = input => Boolean(
    input?.matches?.(
      'input[role="combobox"], input[aria-haspopup="listbox"], input[data-automation-id="searchBox"]'
    )
  );

  W.handleEducation = async educationHistory => {
    if (!Array.isArray(educationHistory) || educationHistory.length === 0) return false;
    if (W.isEducating) return false;

    const sectionKeywords = ["education", "education history", "academic history"];
    let section = W.findSection(sectionKeywords);
    if (!section) return false;
    W.isEducating = true;

    try {
      await W.ensureSectionEntries({
        section,
        sectionKeywords,
        expectedCount: educationHistory.length,
        anchorPattern: EDUCATION_ANCHOR
      });

      section = W.findSection(sectionKeywords) || section;
      const labels = W.querySection(section, "label").filter(W.isVisible);
      const anchorIndexes = labels
        .map((label, index) => ({
          index,
          question: W.normalizeText(W.getElementText(label))
        }))
        .filter(item => matchesQuestion(EDUCATION_ANCHOR, item.question))
        .map(item => item.index);

      for (let educationIndex = 0; educationIndex < anchorIndexes.length; educationIndex += 1) {
        const education = educationHistory[educationIndex];
        if (!education) break;
        const start = anchorIndexes[educationIndex];
        const end = anchorIndexes[educationIndex + 1] ?? labels.length;
        const entryLabels = labels.slice(start, end);

        for (const label of entryLabels) {
          const question = W.normalizeText(W.getElementText(label));
          const container = W.getFieldContainer(label);
          if (!container) continue;
          const input = getControl(label, container);

          if (matchesQuestion(EDUCATION_ANCHOR, question)) {
            if (isLookupControl(input)) {
              await W.fillLookupInputAsync(input, education.school, {
                pressEnter: true,
                selectTopResult: true
              });
            }
            else W.fillDeterministicText(input, education.school);
          } else if (question === "degree" || question.includes("degree received")) {
            const hasDropdown = container.querySelector(
              '[data-automation-id="selectWidget"], [role="combobox"], [aria-haspopup="listbox"]'
            );
            if (hasDropdown) {
              await W.safeFillEduDropdown(container, normalizeDegree(education.degree));
            }
            else W.fillDeterministicText(input, education.degree);
          } else if (
            question.includes("field of study") ||
            question === "major" ||
            question.includes("area of study")
          ) {
            if (isLookupControl(input)) {
              await W.fillLookupInputAsync(input, education.major, {
                pressEnter: false,
                selectTopResult: true
              });
            }
            else W.fillDeterministicText(input, education.major);
          } else if (question === "minor" || question.includes("minor field")) {
            W.fillDeterministicText(input, education.minor);
          } else if (
            question.includes("school location") ||
            question.includes("institution location")
          ) {
            W.fillDeterministicText(input, education.institutionLocation);
          } else if (question === "gpa" || question.includes("grade point average")) {
            W.fillDeterministicText(input, education.gpa);
          } else if (question.includes("gpa scale") || question.includes("out of")) {
            W.fillDeterministicText(input, education.gpaScale);
          } else if (/^(from|start date|start)$/.test(question)) {
            W.fillWorkdayDate(container, education.startDate, { fallbackMonth: 1 });
          } else if (/^(to|end date|end|expected graduation date)$/.test(question)) {
            W.fillWorkdayDate(container, education.endDate, { fallbackMonth: 12 });
          }
        }
      }

      return W.getSectionEntryCount(section, EDUCATION_ANCHOR) >= educationHistory.length;
    } finally {
      W.isEducating = false;
    }
  };
})();
