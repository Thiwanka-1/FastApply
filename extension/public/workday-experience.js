// public/workday-experience.js
window.WorkdayEngine = window.WorkdayEngine || {};

(() => {
  const W = window.WorkdayEngine;

  const buttonText = button => W.normalizeText(
    W.getElementText(button) || button.getAttribute("aria-label")
  );

  const resolveSection = (section, keywords) => {
    const resolved = keywords ? W.findSection(keywords) : null;
    if (resolved) return resolved;
    return section?.heading?.isConnected ? section : null;
  };

  const getSectionKey = (section, keywords) => {
    const heading = W.normalizeText(W.getElementText(section?.heading));
    const keyword = (Array.isArray(keywords) ? keywords : [keywords])
      .map(W.normalizeText)
      .find(Boolean) || heading;
    return `${window.location.pathname}|${keyword || heading || "section"}`;
  };

  const isAddButton = (button, currentCount) => {
    const text = buttonText(button);
    // Accept "Add", "Add Another", "+ Add", "Add Work Experience", localizable
    // decorations stripped by normalizeText. The old exact-equality rules
    // rejected e.g. "Add Another Work Experience" rendered at count 0.
    if (!text || !/^add\b/.test(text)) return false;
    if (/\b(file|attachment|resume|document|cover letter)\b/.test(text)) return false;
    return true;
  };

  W.getSectionEntryCount = (section, anchorPattern, sectionRoot = null) => {
    const labels = sectionRoot
      ? Array.from(sectionRoot.querySelectorAll("label"))
      : (section ? W.querySection(section, "label") : []);
    return labels
      .filter(W.isVisible)
      .filter(label => {
        anchorPattern.lastIndex = 0;
        return anchorPattern.test(
          (W.normalizeQuestion || W.normalizeText)(W.getElementText(label))
        );
      })
      .length;
  };

  W.ensureSectionEntries = async ({
    section,
    sectionKeywords,
    expectedCount,
    anchorPattern,
    sectionRoot = null
  }) => {
    if ((!section && !sectionRoot) || expectedCount <= 0) return 0;
    const cappedExpected = Math.min(Number(expectedCount) || 0, 25);
    const blockedAdds = W.sectionAddBlocks || new Map();
    W.sectionAddBlocks = blockedAdds;

    let liveSection = resolveSection(section, sectionKeywords);
    const liveRoot = () => (sectionRoot?.isConnected ? sectionRoot : null);
    let currentCount = W.getSectionEntryCount(liveSection, anchorPattern, liveRoot());
    let additionsAttempted = 0;

    while (
      (liveSection || liveRoot()) &&
      currentCount < cappedExpected &&
      additionsAttempted < cappedExpected
    ) {
      const sectionKey = getSectionKey(liveSection, sectionKeywords);
      const blockKey = `${sectionKey}|${cappedExpected}:${currentCount}`;
      // Two strikes per exact state instead of a permanent block: one flaky
      // click (React re-render mid-add) must not disable the section forever.
      if ((blockedAdds.get(blockKey) || 0) >= 2) {
        W.debug?.("section add blocked after repeated failures:", blockKey);
        break;
      }

      const root = liveRoot();
      const buttons = (root
        ? Array.from(root.querySelectorAll("button"))
        : W.querySection(liveSection, "button")
      ).filter(W.isVisible);
      const addButton = buttons.find(button => isAddButton(button, currentCount));

      if (!addButton || addButton.dataset.fa_add_processing === "true") {
        break;
      }

      const countBeforeClick = currentCount;
      addButton.dataset.fa_add_processing = "true";
      const clicked = W.clickElement(addButton);
      additionsAttempted += 1;

      if (!clicked) {
        delete addButton.dataset.fa_add_processing;
        blockedAdds.set(blockKey, (blockedAdds.get(blockKey) || 0) + 1);
        break;
      }

      const increasedCount = await W.waitFor(() => {
        liveSection = resolveSection(liveSection, sectionKeywords);
        const count = W.getSectionEntryCount(liveSection, anchorPattern, liveRoot());
        return count > countBeforeClick ? count : null;
      }, { timeout: 6500, interval: 180 });

      if (addButton.isConnected) delete addButton.dataset.fa_add_processing;

      if (!increasedCount) {
        blockedAdds.set(blockKey, (blockedAdds.get(blockKey) || 0) + 1);
        break;
      }

      blockedAdds.delete(blockKey);
      currentCount = increasedCount;
      await W.wait(250);
    }

    return currentCount;
  };

  W.resetSectionAddBlocks = () => {
    W.sectionAddBlocks?.clear?.();
  };

  W.normalizeHttpUrl = W.normalizeHttpUrl || (value => {
    const raw = String(value || "").trim();
    if (!raw) return "";

    const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(raw)
      ? raw
      : `https://${raw.replace(/^\/+/, "")}`;

    try {
      const parsed = new URL(candidate);
      if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname.includes(".")) {
        return "";
      }
      return parsed.toString();
    } catch (_) {
      return "";
    }
  });

  W.getExpectedWebsiteUrls = profile => {
    const links = profile?.websitesAndSkills || {};
    const preferred = [links.portfolio, links.github, links.twitter]
      .map(W.normalizeHttpUrl)
      .filter(Boolean);
    const fallback = preferred.length ? [] : [W.normalizeHttpUrl(links.linkedin)].filter(Boolean);
    const values = [...preferred, ...fallback];
    return [...new Map(values.map(value => [value.toLowerCase(), value])).values()];
  };

  const fillWebsites = async profile => {
    const links = profile.websitesAndSkills || {};
    const normalizedLinks = {
      linkedin: W.normalizeHttpUrl(links.linkedin),
      github: W.normalizeHttpUrl(links.github),
      twitter: W.normalizeHttpUrl(links.twitter),
      facebook: W.normalizeHttpUrl(links.facebook),
      portfolio: W.normalizeHttpUrl(links.portfolio)
    };
    const websiteUrls = W.getExpectedWebsiteUrls(profile);
    let section = W.findSection(["websites", "website"]);

    if (section && websiteUrls.length) {
      await W.ensureSectionEntries({
        section,
        sectionKeywords: ["websites", "website"],
        expectedCount: websiteUrls.length,
        anchorPattern: /^(url|website url|website)$/
      });
      section = W.findSection(["websites", "website"]) || section;
    }

    const allLabels = Array.from(document.querySelectorAll("label")).filter(W.isVisible);
    let genericWebsiteIndex = 0;
    let filledAnything = false;

    for (const label of allLabels) {
      const question = W.normalizeText(W.getElementText(label));
      const inWebsiteSection = section ? W.isInSection(label, section) : false;
      const container = W.getFieldContainer(label);
      const linked = label.control || (() => {
        const labelFor = label.getAttribute("for");
        return labelFor
          ? (label.getRootNode()?.getElementById?.(labelFor) || document.getElementById(labelFor))
          : null;
      })();
      const input = linked || container?.querySelector(
        "input:not([type='hidden']):not([type='checkbox']):not([type='radio']), textarea"
      );
      if (!input) continue;

      let target = "";
      if (question.includes("linkedin")) target = normalizedLinks.linkedin;
      else if (question.includes("github")) target = normalizedLinks.github;
      else if (question.includes("twitter")) target = normalizedLinks.twitter;
      else if (question.includes("facebook")) target = normalizedLinks.facebook;
      else if (question.includes("portfolio")) target = normalizedLinks.portfolio;
      else if (
        inWebsiteSection &&
        /^(url|website url|website)$/.test(question)
      ) {
        target = websiteUrls[genericWebsiteIndex] || "";
        genericWebsiteIndex += 1;
      }

      if (target) {
        filledAnything = W.fillDeterministicText(input, target) || filledAnything;
      }
    }

    return filledAnything;
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

    const workSection = W.findSection([
      "work experience",
      "employment history",
      "professional experience"
    ]);
    if (workSection && workHistory.length) {
      const actual = W.getSectionEntryCount(workSection, /^(job title|position title)$/);
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

    const educationSection = W.findSection(["education", "education history", "academic history"]);
    if (educationSection && educationHistory.length) {
      const actual = W.getSectionEntryCount(
        educationSection,
        /^(school|school or university|university|institution)$/
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

    const expectedWebsites = W.getExpectedWebsiteUrls(profile);
    const websiteSection = W.findSection(["websites", "website"]);
    if (websiteSection && expectedWebsites.length) {
      const actual = W.getSectionEntryCount(
        websiteSection,
        /^(url|website url|website)$/
      );
      if (actual < expectedWebsites.length) {
        issues.push({
          fieldId: "fa_workday_structure_websites",
          label: `Website entries: ${actual} of ${expectedWebsites.length} are present`,
          type: "structure",
          required: false,
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
      const missingSkills = skills.filter(skill => {
        if (typeof W.isExpectedSkillSelected === "function") {
          return !W.isExpectedSkillSelected(skill);
        }
        const selectedKeys = new Set((W.getSelectedSkills?.() || []).map(W.normalizeText));
        return !selectedKeys.has(W.normalizeText(skill));
      });
      if (missingSkills.length) {
        issues.push({
          fieldId: "fa_workday_structure_skills",
          label: `Skills not selected: ${missingSkills.join(", ")}`,
          type: "structure",
          required: false,
          options: [],
          currentValue: (W.getSelectedSkills?.() || []).join(", "),
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

      await fillWebsites(profile);
      if (W.handleWork) await W.handleWork(workHistory);

      if (W.handleEducation && educationHistory.length) {
        // handleWork may have just added rows; let React settle before
        // scanning the education section — filling it mid-re-render silently
        // no-oped on the first automatic pass (observed live).
        await W.wait(400);
        let educationDone = await W.handleEducation(educationHistory);
        if (!educationDone) {
          W.debug?.("education pass incomplete; retrying once after settle");
          await W.wait(700);
          educationDone = await W.handleEducation(educationHistory);
        }
      }

      if (W.handleSkills) await W.handleSkills(skills);

      W.lastReconciliationIssues = W.collectReconciliationIssues(profile);
      return W.lastReconciliationIssues.length === 0;
    } finally {
      W.isProcessingExperience = false;
    }
  };
})();
