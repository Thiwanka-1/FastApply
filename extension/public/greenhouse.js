// public/greenhouse.js
console.log("[FastApply] Greenhouse Engine Active.");

// Notice: smartMatch is removed from here because it now lives safely in utils.js!

// --- REACT-SELECT GHOST CLICKER ---
const fillReactDropdown = (fieldWrapper, targetValue) => {
  if (fieldWrapper.dataset.fa_dropdown_processing === "true" || fieldWrapper.dataset.fa_filled === "true" || !targetValue) return false;

  const nativeSelect = fieldWrapper.querySelector('select');
  if (nativeSelect) {
    for (let i = 0; i < nativeSelect.options.length; i++) {
      if (smartMatch(nativeSelect.options[i].text, targetValue)) {
        nativeSelect.value = nativeSelect.options[i].value;
        nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
        fieldWrapper.dataset.fa_filled = "true";
        fieldWrapper.style.border = '2px solid #8b5cf6';
        return true;
      }
    }
    fieldWrapper.dataset.fa_filled = "true"; 
    return false;
  }

  const reactContainer = fieldWrapper.querySelector('[class*="-container"]');
  if (reactContainer) {
    const control = reactContainer.querySelector('[class*="-control"]') || reactContainer.firstElementChild;
    const toggleBtn = reactContainer.querySelector('button[aria-label="Toggle flyout"]');
    const clickTarget = toggleBtn || control;

    if (clickTarget) {
      fieldWrapper.dataset.fa_dropdown_processing = "true"; 

      clickTarget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      clickTarget.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      clickTarget.click();

      setTimeout(() => {
        let matchedOption = null;
        const options = document.querySelectorAll('[id*="-option"], [class*="-option"]');

        for (let i = 0; i < options.length; i++) {
          if (smartMatch(options[i].innerText, targetValue)) {
            matchedOption = options[i];
            break;
          }
        }

        if (matchedOption) {
          matchedOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          matchedOption.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
          matchedOption.click();
          
          fieldWrapper.style.border = '2px solid #8b5cf6';
          fieldWrapper.style.borderRadius = '4px';
        } else {
          document.body.click(); 
        }
        
        fieldWrapper.dataset.fa_filled = "true";
        fieldWrapper.dataset.fa_dropdown_processing = "false"; 
      }, 250);

      return true; 
    }
  }
  return false;
};

// --- GREENHOUSE CUSTOM FIELD MAPPER ---
const handleGreenhouseCustoms = (profile) => {
  let filledAnything = false;
  const pInfo = profile.personalInfo || {};
  const cInfo = profile.contactInfo || {};
  const eeo = profile.eeo || {};
  const links = profile.websitesAndSkills || {};

  const fields = document.querySelectorAll('.field, .field-wrapper, .custom-field, .v2-make-it-custom, .select');

  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    if (field.dataset.fa_filled === "true") continue;

    const labelTag = field.querySelector('label');
    if (!labelTag) continue;
    
    const questionText = labelTag.innerText.toLowerCase();
    const textInput = field.querySelector('input[type="text"]');

    // --- 1. Custom Text Inputs (Upgraded for Split Names) ---
    if (questionText.includes('preferred first name') && textInput) {
      if (window.FastApplyUtils.fillField(textInput, pInfo.preferredName || pInfo.firstName)) { field.dataset.fa_filled = "true"; filledAnything = true; }
    }
    else if (questionText.includes('preferred last name') && textInput) {
      if (window.FastApplyUtils.fillField(textInput, pInfo.lastName)) { field.dataset.fa_filled = "true"; filledAnything = true; }
    }
    else if (questionText.includes('legal first name') && textInput) {
      if (window.FastApplyUtils.fillField(textInput, pInfo.firstName)) { field.dataset.fa_filled = "true"; filledAnything = true; }
    }
    else if (questionText.includes('legal last name') && textInput) {
      if (window.FastApplyUtils.fillField(textInput, pInfo.lastName)) { field.dataset.fa_filled = "true"; filledAnything = true; }
    }
    else if (questionText.includes('legal name') && textInput) {
      if (window.FastApplyUtils.fillField(textInput, `${pInfo.firstName} ${pInfo.lastName || ''}`.trim())) { field.dataset.fa_filled = "true"; filledAnything = true; }
    }
    else if (questionText.includes('preferred name') && textInput) {
      if (window.FastApplyUtils.fillField(textInput, pInfo.preferredName || pInfo.firstName)) { field.dataset.fa_filled = "true"; filledAnything = true; }
    }
    else if (questionText.includes('pronouns') && textInput && pInfo.pronouns) {
      if (window.FastApplyUtils.fillField(textInput, pInfo.pronouns)) { field.dataset.fa_filled = "true"; filledAnything = true; }
    }
    else if (questionText.includes('linkedin') && textInput && links.linkedin) {
      if (window.FastApplyUtils.fillField(textInput, links.linkedin)) { field.dataset.fa_filled = "true"; filledAnything = true; }
    }
    else if ((questionText.includes('website') || questionText.includes('portfolio')) && textInput && links.portfolio) {
      if (window.FastApplyUtils.fillField(textInput, links.portfolio)) { field.dataset.fa_filled = "true"; filledAnything = true; }
    }

    // --- 2. Custom Dropdowns ---
    const tryDropdown = (targetVal) => {
      if (fillReactDropdown(field, targetVal)) {
        filledAnything = true;
        return true; 
      }
      return false;
    };

    if (questionText.includes('based in the usa') || questionText.includes('based in the us.')) {
      const country = (cInfo.country || "").toLowerCase();
      const isUS = country === 'us' || country === 'usa' || country === 'united states' || country === 'america';
      if (tryDropdown(isUS ? "Yes" : "No")) return true; 
    }
    // Work/Visa checks
    else if (questionText.includes('authorized to work') || questionText.includes('legally entitled') || questionText.includes('legal right to work')) {
      if (tryDropdown(eeo.authorizedToWork)) return true;
    }
    else if (questionText.includes('visa sponsorship') || questionText.includes('require sponsorship') || questionText.includes('immigration sponsorship')) {
      if (tryDropdown(eeo.requireVisaFuture)) return true;
    }
    
    // --- Demographic EEO ---
    else if ((questionText.includes('hispanic') || questionText.includes('latino') || questionText.includes('latinx')) && !questionText.includes('race')) {
      if (eeo.optOut) {
        if (tryDropdown("decline")) return true;
      } else if (eeo.ethnicity && eeo.ethnicity.trim() !== "") {
        const isHisp = eeo.ethnicity.toLowerCase().includes('hispanic') || eeo.ethnicity.toLowerCase().includes('latino') || eeo.ethnicity.toLowerCase().includes('latinx');
        if (tryDropdown(isHisp ? "Yes" : "No")) return true;
      }
    }
    else if ((questionText.includes('gender') || questionText.includes('sex') || questionText.includes('identify as')) && !questionText.includes('transgender') && !questionText.includes('sexual orientation') && !questionText.includes('ethnicity') && !questionText.includes('race') && !questionText.includes('hispanic')) {
      if (tryDropdown(eeo.optOut ? "decline" : eeo.gender)) return true;
    }
    else if (questionText.includes('race') || questionText.includes('ethnic')) {
      if (tryDropdown(eeo.optOut ? "decline" : eeo.ethnicity)) return true;
    }
    else if (questionText.includes('veteran')) {
      if (tryDropdown(eeo.optOut ? "decline" : eeo.veteran)) return true;
    }
    else if (questionText.includes('disability')) {
      if (tryDropdown(eeo.optOut ? "decline" : eeo.disability)) return true;
    }
    else if (questionText.includes('transgender') && eeo.optOut) {
      if (tryDropdown("decline")) return true;
    }
    else if (questionText.includes('sexual orientation') && eeo.optOut) {
      if (tryDropdown("decline")) return true;
    }
    else if ((questionText.includes('parents/guardians') || questionText.includes('parents')) && eeo.optOut) {
      if (tryDropdown("decline")) return true; 
    }
  }

  return filledAnything;
};

// --- CORE ENGINE ---
const attemptAutofill = (profile) => {
  const pInfo = profile.personalInfo || {};
  const cInfo = profile.contactInfo || {};
  let filledAnything = false;

  const fNameInput = document.getElementById('first_name') || document.querySelector('input[name="first_name"]');
  const lNameInput = document.getElementById('last_name') || document.querySelector('input[name="last_name"]');
  const emailInput = document.getElementById('email') || document.querySelector('input[name="email"]');
  const phoneInput = document.getElementById('phone') || document.querySelector('input[name="phone"]');
  
  const locationInput = document.getElementById('job_application_location') || document.querySelector('input[autocomplete*="location"]') || document.querySelector('input[id*="location"]');
  const hiddenLocationInput = document.getElementById('job_application_location_autocomplete'); 

  if (window.FastApplyUtils.fillField(fNameInput, pInfo.firstName)) filledAnything = true;
  if (window.FastApplyUtils.fillField(lNameInput, pInfo.lastName)) filledAnything = true;
  if (window.FastApplyUtils.fillField(emailInput, cInfo.email)) filledAnything = true;
  if (window.FastApplyUtils.fillField(phoneInput, cInfo.phone)) filledAnything = true;

  if (locationInput && cInfo.city && locationInput.dataset.fa_filled !== "true") {
    const locString = `${cInfo.city}, ${cInfo.country || ''}`.trim();
    if (window.FastApplyUtils.fillAutocomplete(locationInput, hiddenLocationInput, locString)) filledAnything = true;
  }

  if (handleGreenhouseCustoms(profile)) filledAnything = true;

  return filledAnything;
};

const startEngine = () => {
  chrome.storage.local.get(['autofillEnabled', 'profileData'], (res) => {
    if (res.autofillEnabled === false || !res.profileData) return;
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (attemptAutofill(res.profileData)) console.log(`[FastApply] ✅ Greenhouse Autofill successful on attempt ${attempts}!`);
      
      if (attempts >= 20) {
        clearInterval(interval);
        console.log("[FastApply] 🏁 Greenhouse Autofill sequence completed.");
      }
    }, 500);
  });
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startEngine);
else startEngine();