// public/workday-experience-skills.js
window.WorkdayEngine = window.WorkdayEngine || {};

(() => {
  const W = window.WorkdayEngine;
  const U = window.FastApplyUtils;

  let attemptStates = new WeakMap();
  // Once a skills pass has run on this page, no automatic re-run may touch
  // the widget again — follow-up passes could only do harm after everything
  // was selected (observed live: round 2 toggled selected skills back off).
  let skillsPassCompletedFor = "";
  const skillAliases = W.skillAliases || new Map();
  W.skillAliases = skillAliases;

  const getSkillsWrapper = () => {
    const explicit = document.querySelector('[data-automation-id="formField-skills"]');
    if (explicit) return explicit;

    const label = Array.from(document.querySelectorAll("label"))
      .filter(W.isVisible)
      .find(element => W.normalizeText(W.getElementText(element)).includes("skill"));
    return label?.closest?.(
      '[data-automation-id*="formField" i], [role="group"], fieldset'
    ) || label?.parentElement || null;
  };

  const getSkillsInput = wrapper => {
    return wrapper?.querySelector(
      'input[data-automation-id="searchBox"], input[role="combobox"], input:not([type="hidden"])'
    ) || null;
  };

  // Keep this transaction intentionally separate from the generic dropdown
  // adapter. Workday's skills widget commits a choice through its icon
  // container; clicking the highlighted option row alone does not add a pill.
  const typeNativeSkillQuery = (input, value) => {
    if (!input) return false;
    try {
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )?.set;
      if (setter) setter.call(input, String(value ?? ""));
      else input.value = String(value ?? "");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    } catch (_) {
      return false;
    }
  };

  const pressSkillSearchEnter = input => {
    for (const type of ["keydown", "keyup"]) {
      input.dispatchEvent(new KeyboardEvent(type, {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true
      }));
    }
  };

  const removeDuplicatedText = value => {
    const words = String(value || "").trim().split(/\s+/).filter(Boolean);
    if (words.length > 1 && words.length % 2 === 0) {
      const midpoint = words.length / 2;
      const first = words.slice(0, midpoint).join(" ");
      const second = words.slice(midpoint).join(" ");
      if (W.normalizeText(first) === W.normalizeText(second)) return first;
    }
    return words.join(" ");
  };

  const selectedElementText = element => {
    const ariaLabel = String(element.getAttribute("aria-label") || "").trim();
    const title = String(element.getAttribute("title") || "").trim();
    let value = /^remove\s+/i.test(ariaLabel)
      ? ariaLabel.replace(/^remove\s+/i, "")
      : /^remove\s+/i.test(title)
        ? title.replace(/^remove\s+/i, "")
        : title || W.getElementText(element);

    value = value
      .replace(/^\s*(remove|delete)\s+/i, "")
      .replace(/\s+(remove|delete)\s*$/i, "")
      .replace(/\s+/g, " ")
      .trim();
    return removeDuplicatedText(value);
  };

  W.getSelectedSkills = () => {
    const wrapper = getSkillsWrapper();
    if (!wrapper) return [];

    const selectedElements = Array.from(wrapper.querySelectorAll([
      '[data-automation-id="selectedItem"]',
      '[data-automation-id*="selected" i]',
      '[data-automation-id="multiSelectContainer"] [title]',
      '[class*="selectedItem"]',
      '[class*="multiValue"]',
      'button[aria-label^="Remove " i]'
    ].join(","))).filter(element => {
      return !element.closest('[role="option"], [data-automation-id="promptOption"]');
    });

    const values = selectedElements
      .map(selectedElementText)
      .filter(value => value && !W.isWorkdayPlaceholder(value));

    return [...new Map(values.map(value => [W.normalizeText(value), value])).values()];
  };

  const clearSkillSearch = (wrapper, input) => {
    if (!input) return;
    const automationClear = wrapper.querySelector(
      '[data-automation-id="clearSearchButton"]'
    );
    const clearButton = automationClear || Array.from(wrapper.querySelectorAll("button"))
      .find(button => {
        const text = W.normalizeText(
          button.getAttribute("aria-label") || W.getElementText(button)
        );
        return text === "clear" || text === "clear search";
      });

    if (clearButton && W.isVisible(clearButton)) {
      clearButton.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      clearButton.click?.();
    } else {
      typeNativeSkillQuery(input, "");
    }
  };

  W.isExpectedSkillSelected = target => {
    const targetKey = W.normalizeText(target);
    const selectedKeys = new Set(W.getSelectedSkills().map(W.normalizeText));
    if (selectedKeys.has(targetKey)) return true;

    const alias = skillAliases.get(targetKey);
    return Boolean(alias && selectedKeys.has(W.normalizeText(alias)));
  };

  const getAttemptState = wrapper => {
    let state = attemptStates.get(wrapper);
    if (!state) {
      state = { attempts: new Map() };
      attemptStates.set(wrapper, state);
    }
    return state;
  };

  const isProtected = element => Boolean(
    element?.dataset?.fa_user_owned === "true" ||
    element?.dataset?.fa_manual === "true" ||
    element?.dataset?.fa_agent_filled === "true"
  );

  const getSkillSearchQueries = skill => {
    const raw = String(skill || "").trim();
    const normalized = W.normalizeText(raw);
    const queries = [raw];
    const aliases = new Map([
      ["rfq", "Request for Quotation"],
      ["rfp", "Request for Proposal"],
      ["rfi", "Request for Information"],
      ["okrs", "Objectives and Key Results"],
      ["okr", "Objectives and Key Results"],
      ["soc2", "SOC 2"],
      ["soc 2", "SOC 2"],
      ["mssql", "Microsoft SQL Server"],
      ["ms sql", "Microsoft SQL Server"],
      ["ms sql server", "Microsoft SQL Server"],
      ["postgres", "PostgreSQL"],
      ["k8s", "Kubernetes"],
      ["gcp", "Google Cloud Platform"]
    ]);
    const alias = aliases.get(normalized);
    if (alias) queries.push(alias);

    if (/^[a-z]+\d+$/i.test(raw)) {
      queries.push(raw.replace(/([a-z])(?=\d)/i, "$1 "));
    }

    return [...new Map(queries
      .filter(Boolean)
      .map(query => [W.normalizeText(query), query])).values()];
  };

  const getVisibleSkillOptions = input => {
    const scoped = W.getWorkdayOptions(input);
    if (scoped.length) return scoped;

    // Fallback for Workday's portal-rendered skills popup. Bare "li" was
    // previously included and matched navigation/menu items anywhere on the
    // page; only li elements inside an active popup/listbox are candidates.
    return Array.from(document.querySelectorAll([
      '[data-automation-id="promptOption"]',
      '[data-automation-id="multiSelectOption"]',
      '[role="option"]',
      '[data-automation-activepopup="true"] li',
      '[role="listbox"] li'
    ].join(","))).filter(option => {
      return W.isVisible(option) &&
        !option.closest('[data-automation-id^="selectedItem"]');
    });
  };

  // Note: aria-selected deliberately NOT consulted — Workday sets it on the
  // highlighted (keyboard-focused) row, which is usually the first search
  // result. Reading it as "already picked" skipped the click on the top
  // result and no skill was ever selected.
  const isOptionChecked = (optionContainer, commitTarget) => {
    if (
      commitTarget?.checked === true ||
      commitTarget?.getAttribute?.("aria-checked") === "true" ||
      optionContainer?.getAttribute?.("aria-checked") === "true"
    ) return true;
    // The checked state may live on a checkbox nested elsewhere in the row;
    // missing it here would re-click (and thereby UNSELECT) the option.
    const choice = optionContainer?.querySelector?.(
      'input[type="checkbox"], [role="checkbox"]'
    );
    return choice?.checked === true ||
      choice?.getAttribute?.("aria-checked") === "true";
  };

  // Workday keeps multi-select choices "pending" while the popup stays open
  // and only materializes them as pills once the prompt is dismissed by a
  // real outside interaction. A synthetic blur is NOT enough — pending picks
  // silently vanish when the next search re-renders the list (observed live:
  // pills disappearing one by one). Close the popup with a document-level
  // click and wait until the option list is actually gone.
  const closeSkillPopup = async input => {
    try {
      document.body.click();
    } catch (_) {}
    await W.waitFor(() => {
      return getVisibleSkillOptions(input).length === 0 ? true : null;
    }, { timeout: 1500, interval: 120 });
    await W.wait(200);
  };

  const commitSkillOption = async (option, optionLabel, beforeKeys, input) => {
    const optionContainer = option.closest("li") ||
      option.closest('[role="option"]') ||
      option;
    const commitTarget = optionContainer.querySelector([
      ".wd-icon-container",
      'input[type="checkbox"]',
      '[role="checkbox"]',
      '[data-automation-id*="checkbox" i]'
    ].join(",")) || optionContainer;

    // Never click a row that is already selected — that toggles the skill
    // OFF again (this deselect loop is how previously added skills were
    // being lost and duplicated).
    if (!isOptionChecked(optionContainer, commitTarget)) {
      try {
        commitTarget.scrollIntoView?.({ block: "nearest", inline: "nearest" });
        commitTarget.dispatchEvent(new MouseEvent("mousedown", {
          bubbles: true,
          cancelable: true,
          view: window
        }));
        commitTarget.dispatchEvent(new MouseEvent("mouseup", {
          bubbles: true,
          cancelable: true,
          view: window
        }));
        if (typeof commitTarget.click === "function") commitTarget.click();
        else commitTarget.dispatchEvent(new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          view: window
        }));
      } catch (_) {
        return null;
      }

      const checked = await W.waitFor(() => {
        return isOptionChecked(optionContainer, commitTarget) ||
          W.getSelectedSkills().some(value => {
            return !beforeKeys.has(W.normalizeText(value));
          })
          ? true
          : null;
      }, { timeout: 1500, interval: 120 });
      if (!checked) W.debug?.("skill option click was not acknowledged:", optionLabel);
    }

    // Commit the pending choice by closing the popup, then require a real
    // pill to survive the close before reporting success.
    await closeSkillPopup(input);

    return await W.waitFor(() => {
      const selected = W.getSelectedSkills();
      const exact = selected.find(value => {
        return W.normalizeText(value) === W.normalizeText(optionLabel);
      });
      if (exact) return exact;

      const newValue = selected.find(value => {
        return !beforeKeys.has(W.normalizeText(value));
      });
      return newValue || null;
    }, { timeout: 2500, interval: 150 });
  };

  const selectSkill = async (wrapper, skill) => {
    if (W.isExpectedSkillSelected(skill)) return true;

    const state = getAttemptState(wrapper);
    const targetKey = W.normalizeText(skill);
    const attemptCount = state.attempts.get(targetKey) || 0;
    if (attemptCount >= 2) return false;

    const input = getSkillsInput(wrapper);
    if (!input || isProtected(input) || isProtected(wrapper)) return false;
    if (
      document.activeElement === input &&
      input.dataset.fa_skill_script_owned !== "true"
    ) {
      return false;
    }
    if (
      String(input.value || "").trim() &&
      input.dataset.fa_skill_script_owned !== "true"
    ) {
      return false;
    }

    state.attempts.set(targetKey, attemptCount + 1);
    input.dataset.fa_skill_script_owned = "true";

    try {
      let match = null;
      let matchedQuery = "";
      for (const query of getSkillSearchQueries(skill)) {
        clearSkillSearch(wrapper, input);
        await W.wait(120);
        input.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        input.click();
        input.focus();
        if (!typeNativeSkillQuery(input, query)) continue;
        await W.wait(250);
        pressSkillSearchEnter(input);
        await W.wait(300);

        // Match against the typed query as well as the raw skill: alias
        // queries ("MSSQL" → "Microsoft SQL Server") return options that
        // only the expanded wording matches.
        match = await W.waitFor(() => {
          const options = getVisibleSkillOptions(input);
          const queryKey = W.normalizeText(query);
          const exact = options.find(option => {
            const key = W.normalizeText(W.getOptionText?.(option) ?? W.getElementText(option));
            return key === targetKey || key === queryKey;
          });
          return exact ||
            W.findBestOption(options, query, { allowAlias: true }) ||
            W.findBestOption(options, skill, { allowAlias: true });
        }, { timeout: 2000, interval: 200 });

        // The result list is ranked for the query we just typed; when no
        // exact or semantic candidate stands out, take the top result — the
        // behaviour the pre-agent engine had and what applicants do by hand.
        if (!match) {
          match = await W.waitFor(() => {
            return getVisibleSkillOptions(input)[0] || null;
          }, { timeout: 1200, interval: 150 });
          if (match) {
            W.debug?.("using top search result for skill:", skill, "→", W.getOptionText?.(match));
          }
        }

        if (match) {
          matchedQuery = query;
          break;
        }
      }

      if (!match) {
        W.debug?.("no skill option matched:", skill);
        return false;
      }

      const liveOptions = getVisibleSkillOptions(input);
      const liveMatch = W.findBestOption(liveOptions, matchedQuery || skill, {
        allowAlias: true
      }) || W.findBestOption(liveOptions, skill, {
        allowAlias: true
      }) || match;

      const optionLabel = W.getOptionText?.(liveMatch) ?? W.getElementText(liveMatch);
      const before = W.getSelectedSkills();
      const beforeKeys = new Set(before.map(W.normalizeText));
      const selectedValue = await commitSkillOption(
        liveMatch,
        optionLabel,
        beforeKeys,
        input
      );

      if (!selectedValue) {
        W.debug?.("skill selection did not persist after popup close:", skill);
        return false;
      }
      skillAliases.set(targetKey, selectedValue === true ? optionLabel : selectedValue);
      U?.setValueOwner?.(input, "deterministic");
      return true;
    } finally {
      const latestInput = getSkillsInput(wrapper);
      if (latestInput) {
        clearSkillSearch(wrapper, latestInput);
        if (document.activeElement === latestInput && !isProtected(latestInput)) {
          latestInput.blur?.();
        }
        delete latestInput.dataset.fa_skill_script_owned;
      }
      delete input.dataset.fa_skill_script_owned;
      await W.wait(150);
    }
  };

  W.resetSkillAttempts = () => {
    attemptStates = new WeakMap();
    // Manual repair (the sidepanel button) is an explicit user request to
    // try again; automatic re-runs stay blocked by the completed-pass gate.
    skillsPassCompletedFor = "";
  };

  W.handleSkills = async rawSkills => {
    const inputSkills = Array.isArray(rawSkills)
      ? rawSkills
      : String(rawSkills || "").split(",");
    const skills = [...new Map(inputSkills
      .map(skill => String(skill || "").trim())
      .filter(Boolean)
      .map(skill => [W.normalizeText(skill), skill])).values()];
    if (!skills.length || W.isProcessingSkills) return false;

    // ONE skills pass per page. The scheduler's bounded second pass, the
    // mutation-driven re-runs and Agent 2's wave loop all re-enter this
    // handler; after a completed pass they have nothing to add and re-opening
    // the widget only risks toggling committed selections off.
    if (skillsPassCompletedFor === window.location.pathname) {
      return true;
    }

    const wrapper = getSkillsWrapper();
    if (!wrapper || !getSkillsInput(wrapper)) return false;
    if (skills.every(W.isExpectedSkillSelected)) {
      skillsPassCompletedFor = window.location.pathname;
      wrapper.dataset.fa_skills_done = "true";
      return true;
    }

    W.isProcessingSkills = true;

    try {
      for (const skill of skills) {
        await selectSkill(wrapper, skill);
      }

      // Leave the widget fully closed so no pending selection can be dropped
      // by later page activity.
      const finalInput = getSkillsInput(wrapper);
      if (finalInput) {
        clearSkillSearch(wrapper, finalInput);
        await closeSkillPopup(finalInput);
      }

      const allSelected = skills.every(W.isExpectedSkillSelected);
      if (allSelected) wrapper.dataset.fa_skills_done = "true";
      else delete wrapper.dataset.fa_skills_done;
      // The pass ran to completion — automatic re-runs are done on this page
      // whatever the outcome; only the manual repair button may retry.
      skillsPassCompletedFor = window.location.pathname;
      return allSelected;
    } finally {
      W.isProcessingSkills = false;
    }
  };
})();
