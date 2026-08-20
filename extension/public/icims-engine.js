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
    const cleanLabel = l => (l.innerText || "").replace(/\*/g, '').trim();

    let label;
    if (text instanceof RegExp) {
        // Regex mode for long job-specific questions with tenant-specific
        // wording ("Are you currently a CHA Employee?").
        label = labels.find(l => text.test(cleanLabel(l)));
    } else {
        // 1st Pass: Try exact match
        label = labels.find(l => cleanLabel(l).toLowerCase() === text.toLowerCase());

        // 2nd Pass: Try partial match (Crucial for long iCIMS questions!)
        if (!label) {
            label = labels.find(l => cleanLabel(l).toLowerCase().includes(text.toLowerCase()));
        }
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

    // Respect an existing real selection (page default or user choice) —
    // report whether it already matches instead of clobbering it.
    const currentText = (select.options?.[select.selectedIndex]?.text || "").trim();
    const isPlaceholder = !select.value ||
        /make a selection|please select|select one|select a |^select\.{0,3}$|^--/i.test(currentText);
    if (!isPlaceholder) {
        return window.ICIMSEngine.smartMatch(currentText, targetValue);
    }

    const options = Array.from(select.options);
    const match = options.find(o => window.ICIMSEngine.smartMatch(o.text, targetValue));

    if (match) {
        window.ICIMSEngine.setNativeValue(select, match.value);
        return true;
    }
    return false;
};

// Text fields are only ever filled when still empty.
window.ICIMSEngine.fillTextByLabel = (labelText, value) => {
    if (!value) return false;
    const input = window.ICIMSEngine.findInputByLabelText(labelText);
    if (!input || input.tagName === 'SELECT') return false;
    if (String(input.value || '').trim()) return false;
    window.ICIMSEngine.setNativeValue(input, value);
    return true;
};

// Total years of professional experience, from the earliest work-history
// start date to today (or the latest end date when nothing is current).
window.ICIMSEngine.computeExperienceYears = (workHistory) => {
    const parseFlexibleDate = raw => {
        const text = String(raw || '').trim();
        if (!text) return null;
        const parsed = Date.parse(text);
        if (!Number.isNaN(parsed)) return new Date(parsed);
        const monthYear = text.match(/(\d{1,2})[\/\-.](\d{4})/);
        if (monthYear) return new Date(Number(monthYear[2]), Number(monthYear[1]) - 1, 1);
        const year = text.match(/(19|20)\d{2}/);
        if (year) return new Date(Number(year[0]), 0, 1);
        return null;
    };

    let earliest = null;
    let latest = null;
    let hasCurrent = false;
    for (const job of (Array.isArray(workHistory) ? workHistory : [])) {
        const start = parseFlexibleDate(job?.startDate);
        if (start && (!earliest || start < earliest)) earliest = start;
        if (job?.currentlyWorkHere) { hasCurrent = true; continue; }
        const end = parseFlexibleDate(job?.endDate);
        if (end && (!latest || end > latest)) latest = end;
    }
    if (!earliest) return "";
    const reference = hasCurrent || !latest ? new Date() : latest;
    const years = (reference.getTime() - earliest.getTime()) / (365.25 * 24 * 3600 * 1000);
    if (!Number.isFinite(years) || years <= 0) return "";
    return String(Math.max(1, Math.round(years)));
};

// Primary US time zone by state — iCIMS profile pages default the Time Zone
// select to values like "India Standard Time"; correct it from the profile.
const ICIMS_STATE_TIMEZONES = {
    connecticut: 'Eastern', delaware: 'Eastern', florida: 'Eastern', georgia: 'Eastern',
    maine: 'Eastern', maryland: 'Eastern', massachusetts: 'Eastern', michigan: 'Eastern',
    'new hampshire': 'Eastern', 'new jersey': 'Eastern', 'new york': 'Eastern',
    'north carolina': 'Eastern', ohio: 'Eastern', pennsylvania: 'Eastern',
    'rhode island': 'Eastern', 'south carolina': 'Eastern', vermont: 'Eastern',
    virginia: 'Eastern', 'west virginia': 'Eastern', indiana: 'Eastern', kentucky: 'Eastern',
    'district of columbia': 'Eastern',
    alabama: 'Central', arkansas: 'Central', illinois: 'Central', iowa: 'Central',
    kansas: 'Central', louisiana: 'Central', minnesota: 'Central', mississippi: 'Central',
    missouri: 'Central', nebraska: 'Central', 'north dakota': 'Central', oklahoma: 'Central',
    'south dakota': 'Central', tennessee: 'Central', texas: 'Central', wisconsin: 'Central',
    arizona: 'Mountain', colorado: 'Mountain', idaho: 'Mountain', montana: 'Mountain',
    'new mexico': 'Mountain', utah: 'Mountain', wyoming: 'Mountain',
    california: 'Pacific', nevada: 'Pacific', oregon: 'Pacific', washington: 'Pacific',
    alaska: 'Alaska', hawaii: 'Hawaii',
    ct: 'Eastern', de: 'Eastern', fl: 'Eastern', ga: 'Eastern', me: 'Eastern',
    md: 'Eastern', ma: 'Eastern', mi: 'Eastern', nh: 'Eastern', nj: 'Eastern',
    ny: 'Eastern', nc: 'Eastern', oh: 'Eastern', pa: 'Eastern', ri: 'Eastern',
    sc: 'Eastern', vt: 'Eastern', va: 'Eastern', wv: 'Eastern', in: 'Eastern',
    ky: 'Eastern', dc: 'Eastern',
    al: 'Central', ar: 'Central', il: 'Central', ia: 'Central', ks: 'Central',
    la: 'Central', mn: 'Central', ms: 'Central', mo: 'Central', ne: 'Central',
    nd: 'Central', ok: 'Central', sd: 'Central', tn: 'Central', tx: 'Central',
    wi: 'Central',
    az: 'Mountain', co: 'Mountain', id: 'Mountain', mt: 'Mountain', nm: 'Mountain',
    ut: 'Mountain', wy: 'Mountain',
    ca: 'Pacific', nv: 'Pacific', or: 'Pacific', wa: 'Pacific',
    ak: 'Alaska', hi: 'Hawaii'
};

window.ICIMSEngine.fillTimezoneFromState = (state, country) => {
    const countryKey = String(country || '').toLowerCase();
    if (countryKey && !/united states|usa|america/.test(countryKey)) return false;
    const base = ICIMS_STATE_TIMEZONES[String(state || '').toLowerCase().trim()];
    if (!base) return false;

    const select = window.ICIMSEngine.findInputByLabelText("Time Zone", "", "select");
    if (!select || !select.options) return false;

    const wantRe = new RegExp('\\b' + base + '\\b', 'i');
    const wrongRegion = /australia|europe|africa|asia|south america/i;
    const currentText = (select.options[select.selectedIndex]?.text || '').trim();
    if (wantRe.test(currentText) && !wrongRegion.test(currentText)) return false;

    const candidates = Array.from(select.options).filter(o => {
        return wantRe.test(o.text) && !wrongRegion.test(o.text);
    });
    const preferred = candidates.find(o => {
        return /\b(us|u\.s\.?a?|united states|america|canada)\b/i.test(o.text);
    }) || candidates[0];
    if (!preferred) return false;

    window.ICIMSEngine.setNativeValue(select, preferred.value);
    return true;
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
        // Tenants label this either "State/Province" or just "State".
        if (!window.ICIMSEngine.fillSelectDropdown("State/Province", c.state, "Addresses")) {
            window.ICIMSEngine.fillSelectDropdown("State", c.state, "Addresses");
        }

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

        const memoryAnswer = key => {
            const answers = profile.applicationMemory?.answers;
            if (!Array.isArray(answers)) return "";
            const entry = answers.find(item => item?.key === key);
            const answer = entry?.answer;
            return answer === null || answer === undefined ? "" : String(answer);
        };

        // --- Job-specific questions ---
        window.ICIMSEngine.fillSelectDropdown(
            /authorized to work in the united states/i,
            e.authorizedToWork || memoryAnswer('authorizedToWorkUSA')
        );

        // Employer-relationship questions default to "No" — the same derived
        // rule the AI uses: nothing in the candidate data indicates such a
        // relationship, employment or title.
        window.ICIMSEngine.fillSelectDropdown(/currently a .{0,40}\bemployee\b/i, "No");
        window.ICIMSEngine.fillSelectDropdown(/ever been employed by\b/i, "No");
        window.ICIMSEngine.fillSelectDropdown(/referred to this position\b/i, "No");
        window.ICIMSEngine.fillSelectDropdown(/officer or director\b/i, "No");
        window.ICIMSEngine.fillSelectDropdown(
            /non.?solicitation|non.?competition|non.?compete/i,
            memoryAnswer('employmentAgreement')
        );

        const relocateAnswer = e.willingToRelocate || memoryAnswer('willingToRelocate');
        window.ICIMSEngine.fillSelectDropdown(
            /open to relocation|willing to relocate/i,
            relocateAnswer
        );

        // "If Yes … If No, please enter N/A" follow-ups, paired with the
        // No answers above (relocation is Yes, so regions gets a real answer).
        window.ICIMSEngine.fillTextByLabel(/if yes.*hire date.*n\/?a/i, "N/A");
        window.ICIMSEngine.fillTextByLabel(/employee'?s name.*n\/?a/i, "N/A");
        window.ICIMSEngine.fillTextByLabel(/which one\(?s\)?.*n\/?a/i, "N/A");
        window.ICIMSEngine.fillTextByLabel(/if yes.*provide details.*n\/?a/i, "N/A");
        if (relocateAnswer) {
            window.ICIMSEngine.fillTextByLabel(
                /what regions or states are you open to/i,
                /^yes/i.test(relocateAnswer) ? "Open to all regions and states" : "N/A"
            );
        }

        // Salary expectations from CQFO memory ("$150,000 - $250,000").
        const salaryFormat = value => {
            const amount = Number(String(value || '').replace(/[^\d.]/g, ''));
            return Number.isFinite(amount) && amount > 0
                ? '$' + amount.toLocaleString('en-US')
                : '';
        };
        const salaryParts = [
            salaryFormat(memoryAnswer('salaryMinimum')),
            salaryFormat(memoryAnswer('salaryMaximum'))
        ].filter(Boolean);
        if (salaryParts.length) {
            window.ICIMSEngine.fillTextByLabel(/salary expectation/i, salaryParts.join(' - '));
        }

        // Experience years from the work-history span.
        const experienceYears = window.ICIMSEngine.computeExperienceYears(profile.workHistory);
        if (experienceYears) {
            window.ICIMSEngine.fillTextByLabel(
                /exp\.? ?\(years\)|years of experience|experience \(years\)/i,
                experienceYears
            );
        }

        // Preferences: correct the Time Zone default from the profile state.
        window.ICIMSEngine.fillTimezoneFromState(c.state, c.country);

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
