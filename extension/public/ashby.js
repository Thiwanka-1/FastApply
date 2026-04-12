// public/ashby.js
console.log("[FastApply] Ashby Engine Active.");

const clickAshbyButton = (buttons, targetValue) => {
  if (!buttons || buttons.length === 0 || !targetValue) return false;
  const targetLower = targetValue.toLowerCase().trim();
  let clicked = false;
  
  for (let i = 0; i < buttons.length; i++) {
    const btn = buttons[i];
    if (btn.dataset.fa_filled === "true") return false; 

    const btnText = btn.innerText.toLowerCase().trim();
    if (btnText === targetLower) {
      btn.click();
      btn.style.backgroundColor = '#f0fdfa';
      btn.style.border = '2px solid #06b6d4';
      clicked = true;
      break;
    }
  }
  
  if (clicked) {
    buttons.forEach(b => b.dataset.fa_filled = "true"); 
    return true;
  }
  return false;
};

const handleAshbyCustoms = (profile) => {
  let filledAnything = false;
  const pInfo = profile.personalInfo || {};
  const cInfo = profile.contactInfo || {};
  const eeo = profile.eeo || {};
  const links = profile.websitesAndSkills || {};

  // Added 'legend' to ensure we catch wrapped EEO sections
  const questionBlocks = document.querySelectorAll('label, h3, h4, legend');

  questionBlocks.forEach(block => {
    const questionText = block.innerText.toLowerCase().replace('*', '').trim();
    if(!questionText) return;
    
    let textInput = null;
    let radios = [];
    let yesNoButtons = [];
    let selects = [];

    if (block.htmlFor) textInput = document.getElementById(block.htmlFor);

    // Look-ahead traversal (Safely skips lists and descriptions to find inputs)
    let sibling = block.nextElementSibling;
    while (sibling && !['LABEL', 'H3', 'H4', 'H2', 'HR', 'LEGEND'].includes(sibling.tagName)) {
        if (!textInput) {
            if (sibling.tagName.match(/INPUT|TEXTAREA/)) textInput = sibling;
            else {
                const foundTextInput = sibling.querySelector('input[type="text"], input[type="email"], input[type="tel"], input[type="url"], textarea');
                if (foundTextInput) textInput = foundTextInput;
            }
        }

        const foundRadios = sibling.querySelectorAll('input[type="radio"]');
        if (foundRadios.length > 0) radios = [...radios, ...Array.from(foundRadios)];

        const foundButtons = Array.from(sibling.querySelectorAll('button')).filter(b => b.innerText.match(/^(yes|no)$/i));
        if (foundButtons.length > 0) yesNoButtons = [...yesNoButtons, ...foundButtons];

        // Future-proofing: Catch standard dropdowns if Ashby uses them!
        const foundSelects = sibling.querySelectorAll('select');
        if (foundSelects.length > 0) selects = [...selects, ...Array.from(foundSelects)];

        sibling = sibling.nextElementSibling;
    }

    // Fallbacks
    if (!textInput) textInput = block.querySelector('input[type="text"], input[type="email"], input[type="tel"], input[type="url"], textarea');
    if (radios.length === 0) radios = Array.from(block.querySelectorAll('input[type="radio"]'));
    if (selects.length === 0) selects = Array.from(block.querySelectorAll('select'));

    // The Universal Fill Adapter (Handles Radios, Dropdowns, and Buttons seamlessly)
    const attemptFill = (targetVal) => {
        if (!targetVal) return false;
        if (radios.length > 0 && window.FastApplyUtils.fillRadio(radios, targetVal)) return true;
        if (selects.length > 0 && window.FastApplyUtils.fillDropdown(selects[0], targetVal)) return true;
        if (yesNoButtons.length > 0 && clickAshbyButton(yesNoButtons, targetVal)) return true;
        return false;
    };

    // --- 1. BASIC INFO & TEXT FIELDS ---
    if (questionText === 'name' || questionText === 'full name' || questionText === 'legal name') {
        if (textInput && window.FastApplyUtils.fillField(textInput, `${pInfo.firstName} ${pInfo.lastName || ''}`.trim())) filledAnything = true;
    }
    else if (questionText === 'first name') {
        if (textInput && window.FastApplyUtils.fillField(textInput, pInfo.firstName)) filledAnything = true;
    }
    else if (questionText === 'last name') {
        if (textInput && window.FastApplyUtils.fillField(textInput, pInfo.lastName)) filledAnything = true;
    }
    else if (questionText.includes('email')) {
        if (textInput && window.FastApplyUtils.fillField(textInput, cInfo.email)) filledAnything = true;
    }
    else if (questionText.includes('phone')) {
        if (textInput && window.FastApplyUtils.fillField(textInput, cInfo.phone)) filledAnything = true;
    }
    else if (questionText.includes('linkedin')) {
        if (textInput && window.FastApplyUtils.fillField(textInput, links.linkedin)) filledAnything = true;
    }
    else if (questionText.includes('github')) {
        if (textInput && window.FastApplyUtils.fillField(textInput, links.github)) filledAnything = true;
    }
    else if (questionText.includes('portfolio') || questionText === 'website') {
        if (textInput && window.FastApplyUtils.fillField(textInput, links.portfolio)) filledAnything = true;
    }
    else if (questionText.includes('location') || questionText.includes('city')) {
        if (textInput && cInfo.city && textInput.dataset.fa_filled !== "true") {
            const locString = `${cInfo.city}, ${cInfo.country || ''}`.trim();
            if (window.FastApplyUtils.fillField(textInput, locString)) {
                filledAnything = true;
                setTimeout(() => {
                    textInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown', keyCode: 40 }));
                    textInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', keyCode: 13 }));
                    textInput.dispatchEvent(new Event('blur', { bubbles: true }));
                    const ashbyDropdownItem = document.querySelector('[role="listbox"] button, [role="listbox"] li, .location-dropdown-item');
                    if (ashbyDropdownItem) ashbyDropdownItem.click();
                }, 800);
            }
        }
    }
    
    // --- 2. YES/NO & EEO DEMOGRAPHICS ---
    else if (questionText.includes('authorized to work') || questionText.includes('right to work') || questionText.includes('legally authorized')) {
        if (attemptFill(eeo.authorizedToWork)) filledAnything = true;
    }
    else if (questionText.includes('sponsorship') || questionText.includes('visa status')) {
        if (attemptFill(eeo.requireVisaFuture)) filledAnything = true;
    }
    else if (questionText.includes('18 years of age') || questionText.includes('18+') || questionText.includes('older')) {
        if (attemptFill('yes')) filledAnything = true;
    }
    else if ((questionText.includes('gender') || questionText.includes('sex') || questionText.includes('identify as')) && !questionText.includes('transgender') && !questionText.includes('sexual orientation') && !questionText.includes('ethnicity') && !questionText.includes('race') && !questionText.includes('hispanic')) {
        const target = eeo.optOut ? "decline" : eeo.gender;
        if (attemptFill(target)) filledAnything = true;
    }
    else if (questionText.includes('race') || questionText.includes('ethnic') || questionText.includes('hispanic')) {
        const target = eeo.optOut ? "decline" : eeo.ethnicity;
        if (attemptFill(target)) filledAnything = true;
    }
    else if (questionText.includes('veteran')) {
        const target = eeo.optOut ? "decline" : eeo.veteran;
        if (attemptFill(target)) filledAnything = true;
    }
    else if (questionText.includes('disability')) {
        const target = eeo.optOut ? "decline" : eeo.disability;
        if (attemptFill(target)) filledAnything = true;
    }
  });

  return filledAnything;
};

const attemptAutofill = (profile) => {
  const pInfo = profile.personalInfo || {};
  const cInfo = profile.contactInfo || {};
  let filledAnything = false;

  const fullNameInput = document.querySelector('input[name="name"]') || document.querySelector('input[name="fullName"]');
  if (fullNameInput && pInfo.firstName) {
    if (window.FastApplyUtils.fillField(fullNameInput, `${pInfo.firstName} ${pInfo.lastName || ''}`.trim())) filledAnything = true;
  }

  const fNameInput = document.querySelector('input[name*="first"]');
  const lNameInput = document.querySelector('input[name*="last"]');
  if (fNameInput && pInfo.firstName) if (window.FastApplyUtils.fillField(fNameInput, pInfo.firstName)) filledAnything = true;
  if (lNameInput && pInfo.lastName) if (window.FastApplyUtils.fillField(lNameInput, pInfo.lastName)) filledAnything = true;

  const emailInput = document.querySelector('input[type="email"]') || document.querySelector('input[name="email"]');
  const phoneInput = document.querySelector('input[type="tel"]') || document.querySelector('input[name*="phone"]');
  if (emailInput && cInfo.email) if (window.FastApplyUtils.fillField(emailInput, cInfo.email)) filledAnything = true;
  if (phoneInput && cInfo.phone) if (window.FastApplyUtils.fillField(phoneInput, cInfo.phone)) filledAnything = true;

  const locationInput = document.querySelector('input[name="location"]') || document.querySelector('input[placeholder*="typing"]');
  if (locationInput && cInfo.city && locationInput.dataset.fa_filled !== "true") {
    const locString = `${cInfo.city}, ${cInfo.country || ''}`.trim();
    if (window.FastApplyUtils.fillField(locationInput, locString)) {
        filledAnything = true;
        setTimeout(() => {
          locationInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown', keyCode: 40 }));
          locationInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', keyCode: 13 }));
          locationInput.dispatchEvent(new Event('blur', { bubbles: true }));
          const ashbyDropdownItem = document.querySelector('[role="listbox"] button, [role="listbox"] li, .location-dropdown-item');
          if (ashbyDropdownItem) ashbyDropdownItem.click();
        }, 800);
    }
  }

  if (handleAshbyCustoms(profile)) filledAnything = true;

  return filledAnything;
};

const startEngine = () => {
  chrome.storage.local.get(['autofillEnabled', 'profileData'], (res) => {
    if (res.autofillEnabled === false || !res.profileData) return;
    
    console.log("[FastApply] ⚡ Initiating Ashby form lock...");
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (attemptAutofill(res.profileData)) console.log(`[FastApply] ✅ Ashby Autofill successful on attempt ${attempts}!`);
      
      if (attempts >= 20) {
        clearInterval(interval);
        console.log("[FastApply] 🏁 Ashby Autofill sequence completed.");
      }
    }, 500);
  });
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startEngine);
else startEngine();