// public/generic.js
console.log("[FastApply] Generic Universal Engine Active.");

const handleGenericCustoms = (profile) => {
    let filledAnything = false;
    const pInfo = profile.personalInfo || {};
    const cInfo = profile.contactInfo || {};
    const eeo = profile.eeo || {};
    const links = profile.websitesAndSkills || {};

    // 1. SCAN ALL STANDARD TEXT FIELDS AND DROPDOWNS
    const fields = document.querySelectorAll('input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), select, textarea');

    fields.forEach(field => {
        if (field.dataset.fa_filled === "true") return;

        // Use our bulletproof utils to extract whatever text is near this box
        const labelText = (window.FastApplyUtils.getLabelText(field) || '').toLowerCase();
        if (!labelText) return;

        let targetValue = null;

        // --- Personal Information ---
        if (/(first|given).*name/i.test(labelText)) targetValue = pInfo.firstName;
        else if (/(last|family|sur).*name/i.test(labelText)) targetValue = pInfo.lastName;
        else if (/(full.*name|^name\*?$)/i.test(labelText)) targetValue = `${pInfo.firstName || ''} ${pInfo.lastName || ''}`.trim();
        else if (/email/i.test(labelText)) targetValue = cInfo.email;
        else if (/(phone|mobile|cell|telephone)/i.test(labelText)) targetValue = String(cInfo.phone || '').replace(/[^\d]/g, '');
        else if (/(address line 1|street address)/i.test(labelText)) targetValue = cInfo.addressLine1;
        else if (/city/i.test(labelText)) targetValue = cInfo.city;
        else if (/(zip|postal)/i.test(labelText)) targetValue = cInfo.postalCode;
        else if (/(state|province)/i.test(labelText)) targetValue = cInfo.state;
        else if (/country/i.test(labelText)) targetValue = cInfo.country;

        // --- Links & Socials ---
        else if (/linkedin/i.test(labelText)) targetValue = links.linkedin;
        else if (/github/i.test(labelText)) targetValue = links.github;
        else if (/(portfolio|website|url)/i.test(labelText)) targetValue = links.portfolio || links.github;

        // --- EEO & Demographics (Dropdowns or Text) ---
        else if (/(gender|sex)/i.test(labelText)) targetValue = eeo.optOut ? "prefer not to answer" : eeo.gender;
        else if (/(race|ethnic)/i.test(labelText)) targetValue = eeo.optOut ? "prefer not to answer" : eeo.ethnicity;
        else if (/veteran/i.test(labelText)) targetValue = eeo.optOut ? "prefer not to answer" : eeo.veteran;
        else if (/(disability|impairment)/i.test(labelText)) targetValue = eeo.optOut ? "don't wish to answer" : eeo.disability;
        else if (/pronoun/i.test(labelText)) targetValue = pInfo.pronouns;

        // Execution
        if (targetValue) {
            if (field.tagName === 'SELECT') {
                if (window.FastApplyUtils.fillDropdown(field, targetValue)) filledAnything = true;
            } else {
                if (window.FastApplyUtils.fillField(field, targetValue)) filledAnything = true;
            }
        }
    });

    // 2. SCAN GENERIC RADIOS
    const radioGroups = {};
    let fallbackId = 0;
    document.querySelectorAll('input[type="radio"]').forEach(radio => {
        let groupKey = radio.name || radio.closest('fieldset')?.id || `generic_fallback_${fallbackId++}`;
        if (!radioGroups[groupKey]) radioGroups[groupKey] = [];
        radioGroups[groupKey].push(radio);
    });

    Object.values(radioGroups).forEach(group => {
        if (group.length === 0 || group[0].dataset.fa_filled === "true") return;

        // Try to find the question text for this group of radios
        const groupText = (window.FastApplyUtils.getLabelText(group[0]) || group[0].closest('fieldset, .form-group, div')?.innerText || '').toLowerCase();
        
        if (/(gender|sex)/i.test(groupText)) {
            const target = eeo.optOut ? "prefer not to answer" : eeo.gender;
            if (window.FastApplyUtils.fillRadio(group, target)) filledAnything = true;
        } 
        else if (/(race|ethnic)/i.test(groupText)) {
            const target = eeo.optOut ? "prefer not to answer" : eeo.ethnicity;
            if (window.FastApplyUtils.fillRadio(group, target)) filledAnything = true;
        } 
        else if (/veteran/i.test(groupText)) {
            const target = eeo.optOut ? "prefer not to answer" : eeo.veteran;
            if (window.FastApplyUtils.fillRadio(group, target)) filledAnything = true;
        } 
        else if (/(disability|impairment)/i.test(groupText)) {
            const target = eeo.optOut ? "don't wish to answer" : (eeo.disability === 'yes' ? 'yes' : 'no');
            if (window.FastApplyUtils.fillRadio(group, target)) filledAnything = true;
        }
        else if (/(sponsor|visa)/i.test(groupText)) {
            if (eeo.requireVisaFuture && window.FastApplyUtils.fillRadio(group, eeo.requireVisaFuture)) filledAnything = true;
        }
        else if (/(authorized|legally)/i.test(groupText)) {
            if (eeo.authorizedToWork && window.FastApplyUtils.fillRadio(group, eeo.authorizedToWork)) filledAnything = true;
        }
    });

    // 3. SCAN GENERIC CHECKBOXES
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
        if (cb.dataset.fa_filled === "true") return;
        const cbText = (window.FastApplyUtils.getLabelText(cb) || cb.parentElement.innerText || '').toLowerCase();

        if (/(disability|impairment)/i.test(cbText)) {
            const target = eeo.optOut ? "don't wish to answer" : (eeo.disability === 'yes' ? 'yes' : 'no');
            if (window.FastApplyUtils.fillCheckbox([cb], target)) filledAnything = true;
        }
    });

    return filledAnything;
};

// --- THE GENERIC OBSERVER ---
const startGenericEngine = () => {
    chrome.storage.local.get(['autofillEnabled', 'profileData'], (res) => {
        if (res.autofillEnabled === false || !res.profileData) return;

        // Only run on pages that look like they contain a form to save browser memory
        if (document.querySelectorAll('form, input').length === 0) return;

        console.log("[FastApply] ⚡ Initiating Generic Universal Observer...");

        // Slower interval (2 seconds) so it doesn't slow down normal web browsing
        setInterval(() => {
            const unfilledInputs = document.querySelectorAll('input:not([data-fa_filled="true"]):not([type="hidden"]), select:not([data-fa_filled="true"]), textarea:not([data-fa_filled="true"])');
            
            if (unfilledInputs.length > 0) {
                handleGenericCustoms(res.profileData);
            }
        }, 2000); 
    });
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startGenericEngine);
} else {
    startGenericEngine();
}