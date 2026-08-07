// public/workday-experience.js
window.WorkdayEngine = window.WorkdayEngine || {};

(() => {
  const W = window.WorkdayEngine;

  const buttonText = button => W.normalizeText(
    W.getElementText(button) || button.getAttribute("aria-label")
  );

  W.getSectionEntryCount = (section, anchorPattern) => {
    if (!section) return 0;
    return W.querySection(section, "label")
      .filter(label => anchorPattern.test(W.normalizeText(W.getElementText(label))))
      .length;
  };

  W.ensureSectionEntries = async ({
    section,
    expectedCount,
    anchorPattern
  }) => {
    if (!section || expectedCount <= 0) return 0;
    const cappedExpected = Math.min(Number(expectedCount) || 0, 25);
    let currentCount = W.getSectionEntryCount(section, anchorPattern);

    while (currentCount < cappedExpected) {
      const expectedButton = currentCount === 0 ? "add" : "add another";
      const buttons = W.querySection(section, "button").filter(W.isVisible);
      const addButton = buttons.find(button => buttonText(button) === expectedButton) ||
        buttons.find(button => buttonText(button) === "add another") ||
        buttons.find(button => buttonText(button) === "add");

      if (!addButton || addButton.dataset.fa_add_processing === "true") break;

      const countBeforeClick = currentCount;
      addButton.dataset.fa_add_processing = "true";
      const clicked = W.clickElement(addButton);
      delete addButton.dataset.fa_add_processing;
      if (!clicked) break;

      const increasedCount = await W.waitFor(() => {
        const count = W.getSectionEntryCount(section, anchorPattern);
        return count > countBeforeClick ? count : null;
      }, { timeout: 6500, interval: 180 });

      if (!increasedCount) break;
      currentCount = increasedCount;
      await W.wait(250);
    }

    return currentCount;
  };

  const fillWebsites = profile => {
    const links = profile.websitesAndSkills || {};
    const section = W.findSection(["websites", "website"]);
    const labels = section
      ? W.querySection(section, "label")
      : Array.from(document.querySelectorAll("label"));

    labels.forEach(label => {
      const question = W.normalizeText(W.getElementText(label));
      const container = W.getFieldContainer(label);
      const input = container?.querySelector(
        "input:not([type='hidden']):not([type='checkbox']):not([type='radio']), textarea"
      );
      if (!input) return;

      if (question.includes("linkedin")) W.fillTextField(input, links.linkedin);
      else if (question.includes("github")) W.fillTextField(input, links.github);
      else if (question.includes("twitter")) W.fillTextField(input, links.twitter);
      else if (question.includes("facebook")) W.fillTextField(input, links.facebook);
      else if (question.includes("url") || question.includes("website")) {
        W.fillTextField(input, links.portfolio || links.github || links.linkedin);
      }
    });
  };

  W.collectReconciliationIssues = profile => {
    if (!profile) return [];
    const issues = [];
    const workHistory = Array.isArray(profile.workHistory) ? profile.workHistory : [];
    const educationHistory = Array.isArray(profile.educationHistory)
      ? profile.educationHistory
      : [];
    const rawSkills = profile.websitesAndSkills?.skills;
    const skills = (Array.isArray(rawSkills) ? rawSkills : String(rawSkills || "").split(","))
      .map(skill => String(skill || "").trim())
      .filter(Boolean);

    const workSection = W.findSection("work experience");
    if (workSection && workHistory.length) {
      const actual = W.getSectionEntryCount(workSection, /^job title$/);
      if (actual < workHistory.length) {
        issues.push({
          fieldId: "fa_workday_structure_work_history",
          label: `Work Experience entries: ${actual} of ${workHistory.length} are present`,
          type: "structure",
          required: true,
          options: [],
          currentValue: String(actual),
          maxLength: null,
          repairOnly: true
        });
      }
    }

    const educationSection = W.findSection("education");
    if (educationSection && educationHistory.length) {
      const actual = W.getSectionEntryCount(
        educationSection,
        /^(school|school or university|university)$/
      );
      if (actual < educationHistory.length) {
        issues.push({
          fieldId: "fa_workday_structure_education_history",
          label: `Education entries: ${actual} of ${educationHistory.length} are present`,
          type: "structure",
          required: true,
          options: [],
          currentValue: String(actual),
          maxLength: null,
          repairOnly: true
        });
      }
    }

    const skillsFieldPresent = Boolean(
      document.querySelector('[data-automation-id="formField-skills"]') ||
      Array.from(document.querySelectorAll("label")).some(label => {
        return W.isVisible(label) &&
          W.normalizeText(W.getElementText(label)).includes("skill");
      })
    );

    if (skills.length && skillsFieldPresent) {
      const selected = W.getSelectedSkills?.() || [];
      const selectedKeys = new Set(selected.map(W.normalizeText));
      const missingSkills = skills.filter(skill => !selectedKeys.has(W.normalizeText(skill)));
      if (missingSkills.length) {
        issues.push({
          fieldId: "fa_workday_structure_skills",
          label: `Skills not selected: ${missingSkills.join(", ")}`,
          type: "structure",
          required: false,
          options: [],
          currentValue: selected.join(", "),
          maxLength: null,
          repairOnly: true
        });
      }
    }

    return issues;
  };

  W.handleExperience = async profile => {
    if (W.isProcessingExperience) return false;
    W.isProcessingExperience = true;

    try {
      const workHistory = Array.isArray(profile.workHistory) ? profile.workHistory : [];
      const educationHistory = Array.isArray(profile.educationHistory)
        ? profile.educationHistory
        : [];
      const skills = profile.websitesAndSkills?.skills;

      fillWebsites(profile);

      if (W.handleWork) await W.handleWork(workHistory);
      if (W.handleEducation) await W.handleEducation(educationHistory);
      if (W.handleSkills) await W.handleSkills(skills);

      W.lastReconciliationIssues = W.collectReconciliationIssues(profile);
      return W.lastReconciliationIssues.length === 0;
    } finally {
      W.isProcessingExperience = false;
    }
  };
})();
