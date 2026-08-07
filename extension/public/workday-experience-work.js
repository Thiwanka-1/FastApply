// public/workday-experience-work.js
window.WorkdayEngine = window.WorkdayEngine || {};

(() => {
  const W = window.WorkdayEngine;

  W.fillWorkdayDate = (container, rawDate) => {
    if (!container || !rawDate) return false;
    const formatted = W.formatMonthYear(rawDate);
    const [month, year] = formatted.split("/");
    if (!month || !year) return false;

    const monthInput = container.querySelector(
      'input[data-automation-id="dateSectionMonth-input"], input[name*="month" i]'
    );
    const yearInput = container.querySelector(
      'input[data-automation-id="dateSectionYear-input"], input[name*="year" i]'
    );
    if (!monthInput || !yearInput) return false;

    const monthFilled = W.fillTextField(monthInput, month);
    const yearFilled = W.fillTextField(yearInput, year);
    return monthFilled && yearFilled;
  };

  const setCheckbox = (checkbox, checked) => {
    if (!checkbox || checkbox.disabled) return false;
    if (checkbox.checked !== checked) checkbox.click();
    if (checkbox.checked !== checked) return false;
    checkbox.dataset.fa_filled = "true";
    return true;
  };

  const getTextControl = container => container?.querySelector(
    "input:not([type='hidden']):not([type='checkbox']):not([type='radio']), textarea"
  );

  W.handleWork = async workHistory => {
    if (!Array.isArray(workHistory) || workHistory.length === 0) return false;
    const section = W.findSection("work experience");
    if (!section) return false;

    await W.ensureSectionEntries({
      section,
      expectedCount: workHistory.length,
      anchorPattern: /^job title$/
    });

    let workIndex = -1;
    const labels = W.querySection(section, "label");

    for (const label of labels) {
      const question = W.normalizeText(W.getElementText(label));
      if (question === "job title") workIndex += 1;
      const work = workHistory[workIndex];
      if (!work) continue;

      const container = W.getFieldContainer(label);
      if (!container) continue;
      const input = getTextControl(container);

      if (question === "job title") W.fillTextField(input, work.jobTitle);
      else if (question === "company" || question.includes("company name")) {
        W.fillTextField(input, work.company);
      } else if (question === "location" || question === "job location") {
        W.fillTextField(input, work.location);
      } else if (
        question.includes("role description") ||
        question === "description" ||
        question.includes("responsibilities")
      ) {
        W.fillTextField(input, work.description);
      } else if (
        question.includes("currently work") ||
        question.includes("current position")
      ) {
        setCheckbox(
          container.querySelector('input[type="checkbox"]'),
          work.currentlyWorkHere === true
        );
      } else if (/^(from|start date|start)$/.test(question)) {
        W.fillWorkdayDate(container, work.startDate);
      } else if (/^(to|end date|end)$/.test(question)) {
        if (!work.currentlyWorkHere) W.fillWorkdayDate(container, work.endDate);
      }
    }

    return W.getSectionEntryCount(section, /^job title$/) >= workHistory.length;
  };
})();
