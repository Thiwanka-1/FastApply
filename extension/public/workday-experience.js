// public/workday-experience.js
window.WorkdayEngine = window.WorkdayEngine || {};

window.WorkdayEngine.openSectionIfNeeded = async (sectionKeyword, hasData) => {
  const headings = Array.from(document.querySelectorAll("h2, h3, h4")).filter(h => h.innerText.toLowerCase().includes(sectionKeyword));
  if (headings.length === 0) return;
  
  const heading = headings[0];
  const sectionRoot = heading.closest('[role="group"]') || heading.parentElement.parentElement; 
  if (!sectionRoot) return;
  
  const addBtn = Array.from(sectionRoot.querySelectorAll("button")).find(b => b.innerText.trim() === "Add" && b.dataset.fa_expanded !== "true");
  
  if (addBtn) {
    addBtn.dataset.fa_expanded = "true"; 
    if (sectionKeyword === "certification" || !hasData) return;
    
    addBtn.click();
    await window.WorkdayEngine.wait(1200); 
  }
};

window.WorkdayEngine.handleExperience = async (profile) => {
  // CRITICAL FIX: THE PAGE LOCK
  // This stops the 1.5s interval from launching a second overlapping run!
  if (window.WorkdayEngine.isProcessingExperience) return;
  window.WorkdayEngine.isProcessingExperience = true;

  try {
      const workArr = profile.workHistory || [];
      const eduArr = profile.educationHistory || [];
      const links = profile.websitesAndSkills || {};

      await window.WorkdayEngine.openSectionIfNeeded("certification", false);
      await window.WorkdayEngine.openSectionIfNeeded("work experience", workArr.length > 0);
      await window.WorkdayEngine.openSectionIfNeeded("education", eduArr.length > 0);
      await window.WorkdayEngine.openSectionIfNeeded("websites", links.portfolio || links.github);

      const labels = document.querySelectorAll("label");
      labels.forEach((label) => {
        const questionText = label.innerText.toLowerCase().replace(/\*/g, "").trim();
        if (!questionText) return;

        let container = label.parentElement;
        for (let i = 0; i < 4; i++) {
          if (container && container.querySelector("input:not([type='hidden']), select, textarea, [data-automation-id='selectWidget']")) break;
          if (container && container.parentElement) container = container.parentElement;
        }
        if (!container) return;

        let textInput = container.querySelector("input:not([type='hidden']):not([type='checkbox']):not([type='radio']), textarea");

        if (textInput && textInput.dataset.fa_filled !== "true") {
          if (questionText.startsWith("url") || questionText.includes("website")) { window.FastApplyUtils.fillField(textInput, links.portfolio || links.github); }
          else if (questionText.includes("linkedin")) { window.FastApplyUtils.fillField(textInput, links.linkedin); }
          else if (questionText.includes("twitter")) { window.FastApplyUtils.fillField(textInput, links.twitter); }
          else if (questionText.includes("facebook")) { window.FastApplyUtils.fillField(textInput, links.facebook); }
        }
      });

      if (window.WorkdayEngine.handleWork) {
        const isExpandingWork = await window.WorkdayEngine.handleWork(workArr);
        if (isExpandingWork) return; 
      }

      if (window.WorkdayEngine.handleEducation) {
        const isExpandingEdu = await window.WorkdayEngine.handleEducation(eduArr);
        if (isExpandingEdu) return; 
      }

      if (window.WorkdayEngine.handleSkills && links.skills) {
        await window.WorkdayEngine.handleSkills(links.skills);
      }
  } finally {
      // RELEASE THE LOCK
      window.WorkdayEngine.isProcessingExperience = false;
  }
};