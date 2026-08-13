// public/icims-engine.js
console.log("[FastApply] iCIMS Engine Active.");

// Engine scripts share one isolated world; an IIFE keeps top-level
// declarations from colliding with utils.js or other scripts.
(() => {

window.ICIMSEngine = window.ICIMSEngine || {};
window.ICIMSEngine.wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- 1. CORE INJECTOR ---
// Delegates to the shared implementation in utils.js (identical logic
// previously copy-pasted into each engine).
window.ICIMSEngine.setNativeValue = (element, value) =>
    window.FastApplyUtils.setEngineFieldValue(element, value);

// --- 2. FUZZY MATCHER (Upgraded for Degrees & Countries) ---
// utils.js always loads first, so the old inline fallback (a loose
// substring matcher) was dead code with dangerous semantics if ever hit.
window.ICIMSEngine.smartMatch = (optText, targetValue) =>
    window.FastApplyUtils.smartMatch(optText, targetValue) === true;

// --- 3. TARGET LOCATORS (Upgraded for Custom UI & Partial Matches) ---
window.ICIMSEngine.findInputByLabelText = (text, contextKeyword = "", expectedTag = "") => {
    let searchArea = document;

    if (contextKeyword) {
        const blocks = Array.from(document.querySelectorAll('div, section, fieldset'));
        const contextBlock = blocks.find(b => {
            const header = b.querySelector('h2, h3, h4, legend, .iCIMS_SubHeader, .iCIMS_Header, span.label');
            return header && header.innerText.toLowerCase().includes(contextKeyword.toLowerCase());
        });
        if (contextBlock) searchArea = contextBlock;
    }

    const labels = Array.from(searchArea.querySelectorAll('label, .iCIMS_Label'));
    
    // 1st Pass: Try exact match
    let label = labels.find(l => (l.innerText || "").replace(/\*/g, '').trim().toLowerCase() === text.toLowerCase());
    
    // 2nd Pass: Try partial match (Crucial for long iCIMS questions!)
    if (!label) {
        label = labels.find(l => (l.innerText || "").replace(/\*/g, '').trim().toLowerCase().includes(text.toLowerCase()));
    }

    if (label) {
        // If the label is hooked directly to an ID
        if (label.htmlFor) {
            const input = document.getElementById(label.htmlFor);
            if (input && input.dataset.fa_filled !== "true") {
                if (!expectedTag || input.tagName.toLowerCase() === expectedTag.toLowerCase()) return input;
            }
        }
        
        // Search the container 
        let container = label.parentElement;
        for (let i = 0; i < 4; i++) {
            if (!container) break;
            
            // If we are looking specifically for a <select> (bypasses custom search inputs)
            if (expectedTag) {
                const specificInput = container.querySelector(expectedTag);
                if (specificInput && specificInput.dataset.fa_filled !== "true") return specificInput;
            }

            const input = container.querySelector('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select, textarea');
            if (input && input.dataset.fa_filled !== "true") return input;
            container = container.parentElement;
        }
    }
    return null;
};

// Now passes 'select' as the expected tag to bypass the custom text box UI
window.ICIMSEngine.fillSelectDropdown = (labelText, targetValue, contextKeyword = "") => {
    if (!targetValue) return false;
    const select = window.ICIMSEngine.findInputByLabelText(labelText, contextKeyword, 'select'); 
    if (!select || select.dataset.fa_filled === "true") return false;

    const options = Array.from(select.options);
    const match = options.find(o => window.ICIMSEngine.smartMatch(o.text, targetValue));

    if (match) {
        window.ICIMSEngine.setNativeValue(select, match.value);
        return true; 
    }
    return false;
};

// ... (fillRadioGroup remains exactly the same as the previous script)
window.ICIMSEngine.fillRadioGroup = (questionText, answerValue) => {
    if (!answerValue) return;
    const elements = Array.from(document.querySelectorAll('div, p, span, h3, h4, legend, label, .iCIMS_Label'));
    const question = elements.find(el => {
        const cleanText = (el.innerText || "").replace(/\*/g, '').trim().toLowerCase();
        return cleanText.includes(questionText.toLowerCase()); // Upgraded to .includes() for safety
    });

    if (!question) return;

    let container = question.parentElement;
    for (let i = 0; i < 5; i++) {
        if (!container) break;
        const radios = Array.from(container.querySelectorAll('input[type="radio"]'));
        if (
            radios.length > 0 &&
            !radios[0].dataset.fa_filled &&
            !radios.some(radio => radio.checked) &&
            !radios.some(radio => window.FastApplyUtils?.isProtectedFromDeterministicFill?.(radio))
        ) {
            const labels = Array.from(container.querySelectorAll('label'));
            let matchedLabel = labels.find(l => window.ICIMSEngine.smartMatch(l.innerText, answerValue));
            if (matchedLabel) {
                const radio = container.querySelector(`input[id="${matchedLabel.htmlFor}"]`) || matchedLabel.querySelector('input[type="radio"]');
                if (radio && !radio.checked) {
                    radio.click(); 
                    radios.forEach(r => {
                        r.dataset.fa_filled = "true";
                        window.FastApplyUtils?.setValueOwner?.(r, "deterministic");
                    });
                }
            }
            break;
        }
        container = container.parentElement;
    }
};

// --- 4. ORCHESTRATOR LOGIC ---
window.ICIMSEngine.runAutofill = async (profile) => {
    if (window.ICIMSEngine.isRunning) return;
    window.ICIMSEngine.isRunning = true;

    try {
        const p = profile.personalInfo || {};
        const c = profile.contactInfo || {};
        const e = profile.eeo || {};
        
        const fullLegalName = p.firstName && p.lastName ? `${p.firstName} ${p.lastName}` : "";
        const preferredName = p.preferredName || p.firstName;

        // PAGE 1: Personal Info
        window.ICIMSEngine.setNativeValue(window.ICIMSEngine.findInputByLabelText("First Name"), p.firstName);
        window.ICIMSEngine.setNativeValue(window.ICIMSEngine.findInputByLabelText("Preferred First Name"), preferredName);
        window.ICIMSEngine.setNativeValue(window.ICIMSEngine.findInputByLabelText("Last Name"), p.lastName);
        window.ICIMSEngine.setNativeValue(window.ICIMSEngine.findInputByLabelText("Full Legal Name for Offer"), fullLegalName);
        window.ICIMSEngine.setNativeValue(window.ICIMSEngine.findInputByLabelText("Email"), c.email);
        window.ICIMSEngine.setNativeValue(window.ICIMSEngine.findInputByLabelText("Personal Email"), c.email);

        // PAGE 1: Contact Blocks
        window.ICIMSEngine.fillSelectDropdown("Type", "Mobile", "Phones");
        window.ICIMSEngine.setNativeValue(window.ICIMSEngine.findInputByLabelText("Number", "Phones"), c.phone);

        window.ICIMSEngine.fillSelectDropdown("Type", "Home", "Addresses");
        window.ICIMSEngine.setNativeValue(window.ICIMSEngine.findInputByLabelText("Address", "Addresses"), c.addressLine1);
        window.ICIMSEngine.setNativeValue(window.ICIMSEngine.findInputByLabelText("Address 2", "Addresses"), c.addressLine2);
        window.ICIMSEngine.setNativeValue(window.ICIMSEngine.findInputByLabelText("City", "Addresses"), c.city);
        window.ICIMSEngine.setNativeValue(window.ICIMSEngine.findInputByLabelText("Zip/Postal Code", "Addresses"), c.postalCode);

        // State unlocking logic
        const countryFilled = window.ICIMSEngine.fillSelectDropdown("Country", c.country, "Addresses");
        if (countryFilled) {
            await window.ICIMSEngine.wait(1500); // Increased wait time slightly for the AJAX request to fetch states
        }
        window.ICIMSEngine.fillSelectDropdown("State/Province", c.state, "Addresses");

        // PAGE 2: Candidate Questions
        // Compute Sponsorship Need based on DB model (handles both current and future)
        const visaAnswers = [e.requireVisaNow, e.requireVisaFuture]
            .map(value => String(value || '').trim().toLowerCase())
            .filter(Boolean);
        if (visaAnswers.length > 0) {
            const sponsorshipNeeded = visaAnswers.some(value => value === 'yes') ? "Yes" : "No";
            window.ICIMSEngine.fillSelectDropdown("require sponsorship", sponsorshipNeeded);
        }

        // Education Question mapping
        if (profile.educationHistory && profile.educationHistory.length > 0) {
            // Uses the degree from the first entry in their education array
            window.ICIMSEngine.fillSelectDropdown("highest level of education", profile.educationHistory[0].degree);
        }

        // PAGE 3+: EEO & Visas 
        window.ICIMSEngine.fillSelectDropdown("Gender", e.gender);
        window.ICIMSEngine.fillSelectDropdown("Race", e.race);
        window.ICIMSEngine.fillSelectDropdown("Ethnicity", e.ethnicity);
        window.ICIMSEngine.fillSelectDropdown("Disability", e.disability);
        window.ICIMSEngine.fillSelectDropdown("Veteran", e.veteran);
        
        // Fallbacks for Radio variants
        window.ICIMSEngine.fillRadioGroup("Gender", e.gender);
        window.ICIMSEngine.fillRadioGroup("Race", e.race);
        window.ICIMSEngine.fillRadioGroup("Ethnicity", e.ethnicity);
        window.ICIMSEngine.fillRadioGroup("legally authorized to work", e.authorizedToWork);

    } finally {
        window.ICIMSEngine.isRunning = false;
    }
};

const startICIMSEngine = () => {
    window.FastApplyUtils.loadProfileData((profileData, autofillEnabled) => {
        if (!autofillEnabled || !profileData) return;
        const res = { profileData };
        let currentProfile = res.profileData;
        let pendingRun = 0;
        const run = () => window.ICIMSEngine.runAutofill(currentProfile);
        const schedule = () => {
            clearTimeout(pendingRun);
            pendingRun = setTimeout(run, 300);
        };

        run();
        const observer = new MutationObserver(mutations => {
            const addedFormControls = mutations.some(mutation => {
                return Array.from(mutation.addedNodes || []).some(node => {
                    return node.nodeType === Node.ELEMENT_NODE &&
                        (node.matches?.('input, select, textarea, form') ||
                         node.querySelector?.('input, select, textarea, form'));
                });
            });
            if (addedFormControls) schedule();
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });

        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName === "local" && changes.profileData?.newValue) {
                currentProfile = changes.profileData.newValue;
            }
        });
    });
};

window.FastApplyAgent2Controller?.register({
    atsPlatform: "icims",
    runDeterministic: profile => {
        return window.ICIMSEngine.runAutofill(profile);
    }
});

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startICIMSEngine);
} else {
    startICIMSEngine();
}
})();
