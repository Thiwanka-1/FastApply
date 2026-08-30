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
      [/^(bachelor|bachelors)$/, "Bachelor's Degree"],
      [/^(master|masters)$/, "Master's Degree"],
      [/^(doctor|doctorate|doctoral)$/, "Doctorate Degree"],
      [/^(associate|associates)$/, "Associate's Degree"],
      [/^(b e|be|beng|bachelors? of engineering)$/, "Bachelor of Engineering"],
      [/^(b a|ba|bachelors? of arts)$/, "Bachelor of Arts"],
      [/^(b s|bs|bsc|bachelors? of science)$/, "Bachelor of Science"],
      [/^(bba|bachelor of business administration)$/, "Bachelor of Business Administration"],
      [/^(bcom|b comm|bachelor of commerce)$/, "Bachelor of Commerce"],
      [/^(m a|ma|masters? of arts)$/, "Master of Arts"],
      [/^(m s|ms|msc|masters? of science)$/, "Master of Science"],
      [/^(mba|master of business administration)$/, "Master of Business Administration"],
      [/^(phd|ph d|doctor of philosophy)$/, "Doctor of Philosophy"],
      [/^(jd|j d|juris doctor)$/, "Juris Doctor"]
    ];
    return aliases.find(([pattern]) => pattern.test(key))?.[1] || raw;
  };

  W.normalizeWorkdayDegree = normalizeDegree;

  const getDegreeLevel = value => {
    const normalized = W.normalizeText(value);
    if (/\b(high school|secondary school|ged)\b/.test(normalized)) return "high-school";
    if (/\b(associate|associates)\b/.test(normalized)) return "associate";
    if (/\b(bachelor|bachelors|baccalaureate)\b/.test(normalized)) return "bachelor";
    if (/\b(master|masters)\b/.test(normalized)) return "master";
    if (/\b(doctor|doctorate|doctoral|phd|juris doctor)\b/.test(normalized)) {
      return "doctorate";
    }
    if (/\b(certificate|certification)\b/.test(normalized)) return "certificate";
    if (/\bdiploma\b/.test(normalized)) return "diploma";
    return "";
  };

  const resolveDegreeOption = (options, targetValue) => {
    const candidates = Array.from(options || []).filter(Boolean);
    const target = normalizeDegree(targetValue);
    if (!target || candidates.length === 0) return null;

    const getText = option => typeof option === "string"
      ? option
      : W.getOptionText(option);
    const exact = candidates.find(option => {
      return W.normalizeText(getText(option)) === W.normalizeText(target);
    });
    if (exact) return exact;

    const semantic = U?.findBestSemanticMatch?.(
      candidates,
      target,
      getText,
      { minimumScore: 0.8, minimumGap: 0.08 }
    );
    if (semantic) return semantic;

    // A generic profile value such as "Master's Degree" must never fall
    // through to the first option in the menu. Restrict any fallback to the
    // same degree level, and only choose it when Workday exposes one clear
    // generic/unique option at that level.
    const targetLevel = getDegreeLevel(target);
    if (!targetLevel) return null;
    const sameLevel = candidates.filter(option => {
      return getDegreeLevel(getText(option)) === targetLevel;
    });
    if (sameLevel.length === 1) return sameLevel[0];

    const genericAtLevel = sameLevel.filter(option => {
      const normalized = W.normalizeText(getText(option));
      return /\b(degree|degree level|not specified|other)\b/.test(normalized) &&
        !/\b(science|arts|engineering|business|commerce|administration|law|medicine)\b/.test(
          normalized
        );
    });
    return genericAtLevel.length === 1 ? genericAtLevel[0] : null;
  };

  W.resolveWorkdayEducationDegreeOption = resolveDegreeOption;

  const readLookupSelections = container => {
    if (!container) return [];
    const values = Array.from(container.querySelectorAll([
      '[data-automation-id="selectedItem"]',
      '[data-automation-id*="selected" i]',
      '[class*="selectedItem"]',
      '[class*="multiValue"]',
      'button[aria-label^="Remove " i]'
    ].join(","))).filter(element => {
      return !element.closest(
        '[role="option"], [data-automation-id="promptOption"], ' +
        '[data-automation-id="multiSelectOption"]'
      );
    }).map(element => {
      const ariaLabel = element.getAttribute("aria-label") || "";
      const title = element.getAttribute("title") || "";
      const text = /^remove\s+/i.test(ariaLabel)
        ? ariaLabel.replace(/^remove\s+/i, "")
        : title || W.getElementText(element);
      return cleanSelectedText(text);
    }).filter(value => value && !W.isWorkdayPlaceholder(value));

    return [...new Map(values.map(value => [W.normalizeText(value), value])).values()];
  };

  const lookupValuesMatch = (first, second) => {
    const firstKey = W.normalizeText(first);
    const secondKey = W.normalizeText(second);
    return Boolean(firstKey && secondKey) && (
      firstKey === secondKey ||
      U?.smartMatch?.(first, second) === true
    );
  };

  const getEducationFieldKind = question => {
    const normalized = (W.normalizeQuestion || W.normalizeText)(question);
    if (matchesQuestion(EDUCATION_ANCHOR, normalized)) return "school";
    if (normalized === "degree" || normalized.includes("degree received")) return "degree";
    if (
      normalized.includes("field of study") ||
      normalized === "major" ||
      normalized.includes("area of study")
    ) return "major";
    return "";
  };

  const getEducationSectionRoot = () => {
    return document.querySelector('[data-automation-id="educationSection"]');
  };

  const getEducationFieldDescriptor = control => {
    if (!control) return null;
    const sectionRoot = getEducationSectionRoot();
    const section = W.findSection?.(["education", "education history", "academic history"]);
    const labels = (sectionRoot
      ? Array.from(sectionRoot.querySelectorAll("label"))
      : W.querySection(section, "label")
    ).filter(W.isVisible);
    const linkedLabel = (
      control.id
        ? control.getRootNode()?.querySelector?.(`label[for="${CSS.escape(control.id)}"]`)
        : null
    );
    const label = linkedLabel || labels.find(candidate => {
      const candidateContainer = W.getFieldContainer?.(candidate);
      return candidate.control === control || candidateContainer?.contains(control);
    });
    if (!label) return null;

    const isInEducation = sectionRoot?.contains(label) || W.isInSection?.(label, section);
    if (!isInEducation) return null;
    const kind = getEducationFieldKind(W.getElementText(label));
    if (!kind) return null;

    const container = W.getFieldContainer?.(label) || control.parentElement;
    const labelIndex = labels.indexOf(label);
    const anchorsBefore = labels.slice(0, labelIndex + 1).filter(candidate => {
      return getEducationFieldKind(W.getElementText(candidate)) === "school";
    }).length;

    return {
      kind,
      index: Math.max(0, anchorsBefore - 1),
      label,
      container
    };
  };

  W.getWorkdayEducationFieldDescriptor = getEducationFieldDescriptor;
  W.isWorkdayEducationLookupControl = control => {
    const kind = getEducationFieldDescriptor(control)?.kind;
    return kind === "school" || kind === "major";
  };

  const committedLookupValues = new Map();

  const getLookupCommitKey = descriptor => {
    return descriptor ? `${descriptor.index}:${descriptor.kind}` : "";
  };

  W.hasCommittedEducationLookupSelection = (control, wrapper = null) => {
    if (!control || !W.isWorkdayEducationLookupControl(control)) return false;
    const descriptor = getEducationFieldDescriptor(control);
    const container = descriptor?.container || wrapper;
    if (readLookupSelections(container).length > 0) return true;
    const rememberedValue = committedLookupValues.get(getLookupCommitKey(descriptor));
    if (rememberedValue && lookupValuesMatch(control.value, rememberedValue)) return true;
    return control.dataset.fa_education_lookup_committed === "true" &&
      Boolean(String(control.dataset.fa_education_lookup_value || "").trim());
  };

  const closeEducationLookupPopup = async input => {
    try {
      document.body.click();
    } catch (_) {}
    await W.waitFor(() => {
      return W.getWorkdayOptions(input).length === 0 ? true : null;
    }, { timeout: 1800, interval: 120 });
    await W.wait(180);
  };

  W.commitWorkdayEducationLookupOption = async (option, input) => {
    if (!option || !input || !W.isWorkdayEducationLookupControl(input)) return false;
    const descriptor = getEducationFieldDescriptor(input);
    const container = descriptor?.container || input.parentElement;
    const beforeKeys = new Set(readLookupSelections(container).map(W.normalizeText));
    const optionLabel = W.getOptionText(option);
    const optionContainer = option.closest?.("li") ||
      option.closest?.('[role="option"]') || option;
    const commitTarget = optionContainer.querySelector?.([
      ".wd-icon-container",
      'input[type="checkbox"]',
      'input[type="radio"]',
      '[role="checkbox"]',
      '[role="radio"]',
      '[data-automation-id*="checkbox" i]',
      '[data-automation-id*="radio" i]'
    ].join(",")) || optionContainer;

    const isAcknowledged = () => {
      if (!optionContainer.isConnected || !W.isVisible(optionContainer)) return true;
      if (W.isWorkdayOptionSelected?.(optionContainer)) return true;
      return readLookupSelections(container).some(value => {
        return !beforeKeys.has(W.normalizeText(value));
      });
    };

    if (!isAcknowledged()) {
      let clicked = W.clickElement(commitTarget);
      if (!clicked && commitTarget?.isConnected && typeof commitTarget.click === "function") {
        try {
          commitTarget.click();
          clicked = true;
        } catch (_) {}
      }
      if (!clicked) return false;

      let acknowledged = await W.waitFor(isAcknowledged, {
        timeout: 1800,
        interval: 120
      });
      if (!acknowledged && commitTarget !== optionContainer) {
        W.clickElement(optionContainer);
        acknowledged = await W.waitFor(isAcknowledged, {
          timeout: 1500,
          interval: 120
        });
      }
      if (!acknowledged) return false;
    }

    await closeEducationLookupPopup(input);
    const selectedValues = readLookupSelections(container);
    const currentValue = String(input.value || "").trim();
    const retained = selectedValues.some(value => {
      return lookupValuesMatch(value, optionLabel);
    }) || (
      W.getWorkdayOptions(input).length === 0 &&
      lookupValuesMatch(currentValue, optionLabel)
    );

    if (!retained) return false;
    committedLookupValues.set(
      getLookupCommitKey(descriptor),
      optionLabel || currentValue
    );
    input.dataset.fa_education_lookup_committed = "true";
    input.dataset.fa_education_lookup_value = optionLabel || currentValue;
    return true;
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
      return existingSelections.some(selection => lookupValuesMatch(selection, target));
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
      W.typeInputValue(input, target);

      if (settings.pressEnter === true) {
        await W.wait(120);
        triggerLookupEnter(input);
      }

      const match = await W.waitFor(() => {
        const options = W.getWorkdayOptions(input);
        const exact = options.find(option => {
          return W.normalizeText(W.getElementText(option)) === targetKey;
        });
        return exact || W.findBestOption(options, target, {
          minimumScore: Number(settings.minimumScore) || 0.74,
          minimumGap: Number(settings.minimumGap) || 0.06
        });
      }, { timeout: 6500, interval: 180 });

      if (!match) {
        W.debug?.("no lookup option matched:", target);
        if (W.normalizeText(input.value) === targetKey) W.setInputValue(input, "");
        W.closeDropdown(input);
        input.dataset.fa_lookup_failed_target = targetKey;
        return false;
      }

      await W.wait(240);
      const liveOptions = W.getWorkdayOptions(input);
      const liveMatch = W.findBestOption(liveOptions, target, {
        minimumScore: Number(settings.minimumScore) || 0.74,
        minimumGap: Number(settings.minimumGap) || 0.06
      }) || match;
      const confirmed = await W.commitWorkdayEducationLookupOption(liveMatch, input);

      if (!confirmed) {
        W.debug?.("lookup selection did not confirm:", target);
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

  W.safeFillEduDropdown = async (container, targetValue) => {
    const target = normalizeDegree(targetValue);
    if (!container || !target) return false;
    const trigger = container.querySelector([
      '[data-automation-id="selectWidget"]',
      '[role="combobox"][aria-haspopup="listbox"]',
      'input[role="combobox"]',
      '[aria-haspopup="listbox"]'
    ].join(","));
    if (!trigger) return false;

    const current = W.readDropdownValue(container, trigger);
    if (current) {
      return W.normalizeText(current) === W.normalizeText(target) ||
        (
          getDegreeLevel(current) &&
          getDegreeLevel(current) === getDegreeLevel(target) &&
          U?.smartMatch?.(current, target) === true
        );
    }

    const options = await W.openDropdown(trigger, { timeout: 4500 });
    const match = resolveDegreeOption(options, target);
    if (!match) {
      W.debug?.("no unambiguous education degree option matched:", target);
      W.closeDropdown(trigger);
      return false;
    }

    return W.fillDeterministicDropdown(
      container,
      W.getOptionText(match),
      { exact: true }
    );
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

  const educationAgentTargets = new Map();
  W.educationAgentTargets = educationAgentTargets;

  W.prepareWorkdayEducationAgentFields = (fields, educationHistory) => {
    educationAgentTargets.clear();
    const history = Array.isArray(educationHistory) ? educationHistory : [];

    return Array.from(fields || []).map(field => {
      let control = null;
      try {
        control = document.querySelector(
          `[data-fa_agent_field_id="${CSS.escape(String(field?.fieldId || ""))}"]`
        );
      } catch (_) {}

      const descriptor = getEducationFieldDescriptor(control);
      if (!descriptor || !history[descriptor.index]) return field;

      const education = history[descriptor.index];
      const profileKey = descriptor.kind === "school"
        ? "school"
        : descriptor.kind === "degree"
          ? "degree"
          : "major";
      const profileValue = String(education?.[profileKey] || "").trim();
      if (!profileValue) return field;

      let value = profileValue;
      let unresolvedReason = "";
      if (descriptor.kind === "degree" && Array.isArray(field.options)) {
        const option = resolveDegreeOption(field.options, profileValue);
        if (option) {
          value = typeof option === "string" ? option : W.getOptionText(option);
        } else if (field.options.length > 0) {
          value = "";
          unresolvedReason =
            `No unambiguous ${getDegreeLevel(profileValue) || "matching"} degree option was available.`;
        }
      }

      educationAgentTargets.set(field.fieldId, {
        value,
        unresolvedReason,
        index: descriptor.index,
        profileKey
      });

      return {
        ...field,
        label: `Education ${descriptor.index + 1} - ${field.label}`
      };
    });
  };

  W.applyWorkdayEducationAgentTargets = answers => {
    return Array.from(answers || []).map(answer => {
      const target = educationAgentTargets.get(answer?.fieldId);
      if (!target) return answer;

      if (!target.value) {
        return {
          ...answer,
          value: "",
          source: "profile",
          confidence: 0,
          requiresReview: true,
          reviewReason: target.unresolvedReason ||
            "The profile education value could not be mapped to a Workday option."
        };
      }

      return {
        ...answer,
        value: target.value,
        source: "profile",
        confidence: 1,
        requiresReview: false,
        reviewReason: ""
      };
    });
  };

  W.handleEducation = async educationHistory => {
    if (!Array.isArray(educationHistory) || educationHistory.length === 0) return false;
    if (W.isEducating) return false;

    const sectionKeywords = ["education", "education history", "academic history"];
    // Prefer Workday's own section container over heading-based boundaries;
    // see the matching comment in handleWork.
    const getSectionRoot = () => document.querySelector(
      '[data-automation-id="educationSection"]'
    );
    let sectionRoot = getSectionRoot();
    let section = W.findSection(sectionKeywords);
    if (!section && !sectionRoot) {
      // The section may still be rendering (typically right after work rows
      // were added). Wait briefly before concluding it does not exist.
      await W.waitFor(() => {
        sectionRoot = getSectionRoot();
        section = W.findSection(sectionKeywords);
        return section || sectionRoot ? true : null;
      }, { timeout: 3000, interval: 250 });
    }
    if (!section && !sectionRoot) {
      W.debug?.("education section not found");
      return false;
    }
    W.isEducating = true;

    try {
      await W.ensureSectionEntries({
        section,
        sectionKeywords,
        expectedCount: educationHistory.length,
        anchorPattern: EDUCATION_ANCHOR,
        sectionRoot
      });

      // Wait for at least one education entry's anchor label to be visible;
      // scanning while the rows are still mounting produced a silent no-op.
      await W.waitFor(() => {
        sectionRoot = getSectionRoot() || sectionRoot;
        section = W.findSection(sectionKeywords) || section;
        return W.getSectionEntryCount(
          section,
          EDUCATION_ANCHOR,
          sectionRoot?.isConnected ? sectionRoot : null
        ) >= 1
          ? true
          : null;
      }, { timeout: 4000, interval: 200 });

      section = W.findSection(sectionKeywords) || section;
      const labels = (sectionRoot?.isConnected
        ? Array.from(sectionRoot.querySelectorAll("label"))
        : W.querySection(section, "label")
      ).filter(W.isVisible);
      const anchorIndexes = labels
        .map((label, index) => ({
          index,
          question: (W.normalizeQuestion || W.normalizeText)(W.getElementText(label))
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
          const question = (W.normalizeQuestion || W.normalizeText)(W.getElementText(label));
          const container = W.getFieldContainer(label);
          if (!container) continue;
          const input = getControl(label, container);

          if (matchesQuestion(EDUCATION_ANCHOR, question)) {
            if (isLookupControl(input)) {
              await W.fillLookupInputAsync(input, education.school, {
                pressEnter: true
              });
            }
            else W.fillDeterministicText(input, education.school);
          } else if (question === "degree" || question.includes("degree received")) {
            const hasDropdown = container.querySelector(
              '[data-automation-id="selectWidget"], [role="combobox"], [aria-haspopup="listbox"]'
            );
            if (hasDropdown) {
              await W.safeFillEduDropdown(container, education.degree);
            }
            else W.fillDeterministicText(input, education.degree);
          } else if (
            question.includes("field of study") ||
            question === "major" ||
            question.includes("area of study")
          ) {
            if (isLookupControl(input)) {
              await W.fillLookupInputAsync(input, education.major, {
                pressEnter: false
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

      return W.getSectionEntryCount(section, EDUCATION_ANCHOR, sectionRoot) >= educationHistory.length;
    } finally {
      W.isEducating = false;
    }
  };
})();
