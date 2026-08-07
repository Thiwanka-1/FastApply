// public/workday-experience-skills.js
window.WorkdayEngine = window.WorkdayEngine || {};

(() => {
  const W = window.WorkdayEngine;

  const getSkillsWrapper = () => {
    return document.querySelector('[data-automation-id="formField-skills"]') ||
      Array.from(document.querySelectorAll("label"))
        .find(label => W.normalizeText(W.getElementText(label)).includes("skill"))
        ?.parentElement ||
      null;
  };

  const getSkillsInput = wrapper => {
    return wrapper?.querySelector(
      'input[data-automation-id="searchBox"], input[role="combobox"], input:not([type="hidden"])'
    ) || null;
  };

  W.getSelectedSkills = () => {
    const wrapper = getSkillsWrapper();
    if (!wrapper) return [];

    const selectedElements = Array.from(wrapper.querySelectorAll([
      '[data-automation-id="selectedItem"]',
      '[data-automation-id="multiSelectContainer"] [title]',
      '[class*="selectedItem"]',
      '[class*="multiValue"]'
    ].join(",")));

    const values = selectedElements.map(element => {
      return String(
        element.getAttribute("title") ||
        W.getElementText(element)
      )
        .replace(/\b(remove|delete)\b/gi, "")
        .trim();
    }).filter(Boolean);

    return [...new Map(values.map(value => [W.normalizeText(value), value])).values()];
  };

  const clearSkillSearch = (wrapper, input) => {
    const clearButton = Array.from(wrapper.querySelectorAll("button"))
      .find(button => {
        const text = W.normalizeText(
          button.getAttribute("aria-label") || W.getElementText(button)
        );
        return text === "clear" || text === "clear search";
      });

    if (clearButton && W.isVisible(clearButton)) W.clickElement(clearButton);
    else W.setInputValue(input, "");
  };

  const isSkillSelected = target => {
    const normalizedTarget = W.normalizeText(target);
    return W.getSelectedSkills().some(skill => W.normalizeText(skill) === normalizedTarget);
  };

  const selectSkill = async (wrapper, skill) => {
    if (isSkillSelected(skill)) return true;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const input = getSkillsInput(wrapper);
      if (!input) return false;

      clearSkillSearch(wrapper, input);
      await W.wait(150);
      W.clickElement(input);
      W.setInputValue(input, skill);

      const match = await W.waitFor(() => {
        const options = W.getWorkdayOptions(input);
        const exact = options.find(option => {
          return W.normalizeText(W.getElementText(option)) === W.normalizeText(skill);
        });
        return exact || W.findBestOption(options, skill);
      }, { timeout: 7000, interval: 200 });

      if (!match) {
        clearSkillSearch(wrapper, input);
        W.closeDropdown(input);
        continue;
      }

      W.clickElement(match);
      const confirmed = await W.waitFor(() => isSkillSelected(skill), {
        timeout: 3500,
        interval: 150
      });

      if (confirmed) {
        clearSkillSearch(wrapper, getSkillsInput(wrapper));
        W.closeDropdown(getSkillsInput(wrapper));
        await W.wait(250);
        return true;
      }

      clearSkillSearch(wrapper, getSkillsInput(wrapper));
      W.closeDropdown(getSkillsInput(wrapper));
      await W.wait(300);
    }

    return false;
  };

  W.handleSkills = async rawSkills => {
    const skills = (Array.isArray(rawSkills) ? rawSkills : String(rawSkills || "").split(","))
      .map(skill => String(skill || "").trim())
      .filter(Boolean);
    if (!skills.length || W.isProcessingSkills) return false;

    const wrapper = getSkillsWrapper();
    if (!wrapper || !getSkillsInput(wrapper)) return false;
    W.isProcessingSkills = true;

    try {
      for (const skill of skills) {
        await selectSkill(wrapper, skill);
      }

      const allSelected = skills.every(isSkillSelected);
      if (allSelected) wrapper.dataset.fa_skills_done = "true";
      else delete wrapper.dataset.fa_skills_done;
      return allSelected;
    } finally {
      W.isProcessingSkills = false;
    }
  };
})();
