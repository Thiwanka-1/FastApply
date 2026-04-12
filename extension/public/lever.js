// public/lever.js
console.log("[FastApply] Lever Engine Active.");

const handleCustomQuestions = (profile) => {
  let filledAnything = false;
  const pInfo = profile.personalInfo || {};
  const cInfo = profile.contactInfo || {};
  const eeo = profile.eeo || {};
  const highestEdu = profile.educationHistory && profile.educationHistory.length > 0 ? profile.educationHistory[0].degree : '';

  const questionBlocks = document.querySelectorAll('.application-question, .custom-question, label, .eeo-question');

  questionBlocks.forEach(block => {
    const questionText = block.innerText.toLowerCase();
    const selects = block.querySelectorAll('select') || [block.nextElementSibling?.querySelector('select')].filter(Boolean);
    const radios = block.querySelectorAll('input[type="radio"]');
    const checkboxes = block.querySelectorAll('input[type="checkbox"]');

    // --- Education & General ---
    if (questionText.includes('highest level of education') && selects.length > 0 && highestEdu) {
      if (window.FastApplyUtils.fillDropdown(selects[0], highestEdu)) filledAnything = true;
    }
    if ((questionText.includes('18+ years old') || questionText.includes('18 or older')) && radios.length > 0) {
      if (window.FastApplyUtils.fillRadio(radios, 'yes')) filledAnything = true;
    }
    if (questionText.includes('native language') && selects.length > 0) {
      const nativeLang = pInfo.languages?.find(l => l.proficiency?.toLowerCase() === 'native');
      if (nativeLang && window.FastApplyUtils.fillDropdown(selects[0], nativeLang.language)) filledAnything = true;
    }
    if (questionText.includes('fluent') && selects.length > 0) {
      const fluentLang = pInfo.languages?.find(l => l.fluent === true || l.proficiency?.toLowerCase() === 'fluent');
      if (fluentLang && window.FastApplyUtils.fillDropdown(selects[0], fluentLang.language)) filledAnything = true;
    }
    if (questionText.includes('country do you currently live in') && selects.length > 0 && cInfo.country) {
      if (window.FastApplyUtils.fillDropdown(selects[0], cInfo.country)) filledAnything = true;
    }

    // --- NEW: Work Authorization & Visa ---
    if ((questionText.includes('authorized to work') || questionText.includes('entitled to work')) && radios.length > 0 && eeo.authorizedToWork) {
      if (window.FastApplyUtils.fillRadio(radios, eeo.authorizedToWork)) filledAnything = true;
    }
    if ((questionText.includes('sponsorship') || questionText.includes('visa')) && radios.length > 0 && eeo.requireVisaFuture) {
      if (window.FastApplyUtils.fillRadio(radios, eeo.requireVisaFuture)) filledAnything = true;
    }
    if (questionText.includes('background check') && radios.length > 0) {
      if (window.FastApplyUtils.fillRadio(radios, 'yes')) filledAnything = true; // Auto-yes for background checks
    }

    // --- Demographics / EEO ---
    if (questionText.includes('gender') || questionText.includes('sex') || questionText.includes('identify as')) {
      const target = eeo.optOut ? "decline" : eeo.gender;
      if (target && target.trim() !== "") { 
        if (selects.length > 0 && window.FastApplyUtils.fillDropdown(selects[0], target)) filledAnything = true; 
        else if (radios.length > 0 && window.FastApplyUtils.fillRadio(radios, target)) filledAnything = true;
      }
    }
    if (questionText.includes('race') || questionText.includes('ethnic')) {
      const target = eeo.optOut ? "decline" : eeo.ethnicity;
      if (target && target.trim() !== "") { 
        if (selects.length > 0 && window.FastApplyUtils.fillDropdown(selects[0], target)) filledAnything = true; 
        else if (radios.length > 0 && window.FastApplyUtils.fillRadio(radios, target)) filledAnything = true;
        else if (checkboxes.length > 0 && window.FastApplyUtils.fillCheckbox(checkboxes, target)) filledAnything = true;
      }
    }
    if (questionText.includes('pronoun') && checkboxes.length > 0 && pInfo.pronouns) {
      if (window.FastApplyUtils.fillCheckbox(checkboxes, pInfo.pronouns)) filledAnything = true;
    }
  });
  return filledAnything;
};

const attemptAutofill = (profile) => {
  const pInfo = profile.personalInfo || {};
  const cInfo = profile.contactInfo || {};
  const links = profile.websitesAndSkills || {};
  const currentCompany = profile.workHistory && profile.workHistory.length > 0 ? profile.workHistory[0].company : '';
  let filledAnything = false;

  const fNameInput = document.querySelector('input[name*="first_name"]') || document.querySelector('#first_name');
  const lNameInput = document.querySelector('input[name*="last_name"]') || document.querySelector('#last_name');
  const fullNameInput = document.querySelector('input[name="name"]') || document.querySelector('input[name="fullname"]');
  const emailInput = document.querySelector('input[name*="email"]') || document.querySelector('#email');
  const phoneInput = document.querySelector('input[name*="phone"]') || document.querySelector('#phone');
  
  const locationInput = document.querySelector('input[name*="location"]');
  const hiddenLocationInput = document.querySelector('input[name="selectedLocation"]'); 
  const companyInput = document.querySelector('input[name*="org"]') || document.querySelector('input[name*="company"]');
  const linkedinInput = document.querySelector('input[name*="urls[LinkedIn]"]') || document.querySelector('input[name*="linkedin"]');
  const githubInput = document.querySelector('input[name*="urls[GitHub]"]') || document.querySelector('input[name*="github"]');
  const twitterInput = document.querySelector('input[name*="urls[Twitter]"]') || document.querySelector('input[name*="twitter"]');
  const portfolioInput = document.querySelector('input[name*="urls[Portfolio]"]') || document.querySelector('input[name*="portfolio"]') || document.querySelector('input[name*="website"]');

  if (window.FastApplyUtils.fillField(fNameInput, pInfo.firstName)) filledAnything = true;
  if (window.FastApplyUtils.fillField(lNameInput, pInfo.lastName)) filledAnything = true;
  if (window.FastApplyUtils.fillField(fullNameInput, `${pInfo.firstName} ${pInfo.lastName || ''}`.trim())) filledAnything = true;
  if (window.FastApplyUtils.fillField(emailInput, cInfo.email)) filledAnything = true;
  if (window.FastApplyUtils.fillField(phoneInput, cInfo.phone)) filledAnything = true;
  
  if (locationInput && cInfo.city && locationInput.dataset.fa_filled !== "true") { 
    const locString = `${cInfo.city}, ${cInfo.country || ''}`.trim();
    if (window.FastApplyUtils.fillAutocomplete(locationInput, hiddenLocationInput, locString)) filledAnything = true;
  }
  
  if (window.FastApplyUtils.fillField(companyInput, currentCompany)) filledAnything = true;
  if (window.FastApplyUtils.fillField(linkedinInput, links.linkedin)) filledAnything = true;
  if (window.FastApplyUtils.fillField(githubInput, links.github)) filledAnything = true;
  if (window.FastApplyUtils.fillField(twitterInput, links.twitter)) filledAnything = true;
  if (window.FastApplyUtils.fillField(portfolioInput, links.portfolio)) filledAnything = true;

  if (handleCustomQuestions(profile)) filledAnything = true;

  return filledAnything;
};

const startEngine = () => {
  chrome.storage.local.get(['autofillEnabled', 'profileData'], (res) => {
    if (res.autofillEnabled === false || !res.profileData) return;
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (attemptAutofill(res.profileData)) console.log(`[FastApply] ✅ Lever Autofill successful on attempt ${attempts}!`);
      if (attempts >= 20) clearInterval(interval);
    }, 500);
  });
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startEngine);
else startEngine();