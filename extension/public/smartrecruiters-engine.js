// public/smartrecruiters-engine.js
console.log("[FastApply] SmartRecruiters Shadow-Piercing Engine Active.");

// Engine scripts share one isolated world; an IIFE keeps top-level
// declarations from colliding with utils.js or other scripts.
(() => {

window.SREngine = window.SREngine || {};
window.SREngine.wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- 1. THE SHADOW DOM PIERCER ---
// Standard Javascript cannot see inside SmartRecruiters' Angular components. We must unlock them manually.
window.SREngine.getAllRoots = () => {
    const roots = [document];
    const walk = (node) => {
        if (node.shadowRoot) roots.push(node.shadowRoot);
        if (node.children) Array.from(node.children).forEach(walk);
    };
    walk(document.body);
    return roots;
};

window.SREngine.deepQueryAll = (selector) => {
    const elements = [];
    const roots = window.SREngine.getAllRoots();
    roots.forEach(root => {
        elements.push(...Array.from(root.querySelectorAll(selector)));
    });
    return elements;
};

// Searches every open Shadow Root for labels matching our target text
window.SREngine.findInputByLabelText = (text) => {
    const roots = window.SREngine.getAllRoots();
    const wanted = text.toLowerCase().trim();

    const allLabels = [];
    roots.forEach(root => {
        root.querySelectorAll('label, .c-spl-form-field-label').forEach(label => {
            allLabels.push({ root, label });
        });
    });
    const textOf = label =>
        (label.innerText || label.textContent || "").replace(/\*/g, '').toLowerCase().trim();

    // EXACT match across ALL roots first. The old combined exact-or-partial
    // find matched "Let the company know about your interest…" for
    // "Company" and wrote the employer name into the hiring-team message.
    let hit = allLabels.find(({ label }) => textOf(label) === wanted);
    if (!hit) {
        // Bounded partial match: a real field label is close in length to
        // the search phrase, a sentence-long prompt is not.
        hit = allLabels.find(({ label }) => {
            const t = textOf(label);
            return t.includes(wanted) && t.length <= Math.max(40, wanted.length * 4);
        });
    }
    if (!hit) return null;

    const { root, label } = hit;
    // First try matching the 'for' attribute to the input's 'id'
    const forAttr = label.getAttribute('for') || label.htmlFor;
    if (forAttr) {
        const input = root.querySelector(`[id="${forAttr}"]`);
        if (input && input.dataset.fa_filled !== "true") return input;
    }
    // Fallback: Check the parent wrapper for an input
    const wrapper = label.closest('div') || root;
    const input = wrapper.querySelector('input:not([type="hidden"]), textarea, select');
    if (input && input.dataset.fa_filled !== "true") return input;
    return null;
};

// --- 2. THE ANGULAR INJECTOR ---
// Delegates to the shared implementation in utils.js (identical logic
// previously copy-pasted into each engine).
window.SREngine.setNativeValue = (element, value) =>
    window.FastApplyUtils.setEngineFieldValue(element, value);

// Autocomplete fields (City, Institution, locations) reject plain typed
// text: SmartRecruiters requires picking a suggestion, otherwise the field
// stays "Value is required". Type via the native editing pipeline so the
// suggestion list opens, then click the best suggestion.
window.SREngine.commitAutocomplete = async (input, value) => {
    if (!input || !value) return false;
    if (input.dataset.fa_committed === "true") return true;

    try {
        input.focus();
        input.select?.();
        document.execCommand("insertText", false, value);
    } catch (_) {}
    if (!String(input.value || "").trim()) {
        window.SREngine.setNativeValue(input, value);
    }
    await window.SREngine.wait(900);

    const visible = el => el.getClientRects?.().length > 0;
    let suggestions = window.SREngine.deepQueryAll(
        '[role="option"], [role="listbox"] li, ul[class*="autocomplete" i] li, li[class*="option" i], [class*="suggestion" i] li'
    ).filter(visible);

    if (suggestions.length) {
        const best = window.FastApplyUtils.findBestSemanticMatch?.(
            suggestions,
            value,
            el => (el.innerText || "").trim()
        ) || suggestions[0];
        best.click();
        await window.SREngine.wait(300);
    } else {
        // No visible list — commit via keyboard as a fallback.
        for (const key of ["ArrowDown", "Enter"]) {
            input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
            input.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
        }
        await window.SREngine.wait(300);
    }

    input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    input.dispatchEvent(new Event("blur", { bubbles: true, composed: true }));

    if (String(input.value || "").trim()) {
        input.dataset.fa_committed = "true";
        input.dataset.fa_filled = "true";
        window.FastApplyUtils.setValueOwner?.(input, "deterministic");
        return true;
    }
    return false;
};

// "Pick a date" inputs reject raw profile strings like "January 2024" —
// parse and type MM/YYYY-style candidates until one sticks.
window.SREngine.fillSrDate = async (input, rawDate) => {
    if (!input || input.dataset.fa_filled === "true") return false;

    const text = String(rawDate || "").trim();
    if (!text) return false;
    let month = null;
    let year = null;
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) {
        month = parsed.getMonth() + 1;
        year = parsed.getFullYear();
    } else {
        const monthYear = text.match(/(\d{1,2})[\/\-.](\d{4})/);
        if (monthYear) { month = Number(monthYear[1]); year = Number(monthYear[2]); }
        else {
            const yearOnly = text.match(/(19|20)\d{2}/);
            if (yearOnly) { month = 1; year = Number(yearOnly[0]); }
        }
    }
    if (!year) return false;

    const mm = String(month || 1).padStart(2, "0");
    const candidates = [`${mm}/${year}`, `${mm}/01/${year}`, `${year}-${mm}`];

    for (const candidate of candidates) {
        try {
            input.focus();
            input.select?.();
            document.execCommand("insertText", false, candidate);
        } catch (_) {}
        if (!String(input.value || "").trim()) {
            try {
                const setter = Object.getOwnPropertyDescriptor(
                    window.HTMLInputElement.prototype, "value"
                )?.set;
                if (setter) setter.call(input, candidate);
                else input.value = candidate;
            } catch (_) {}
            input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        }
        input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        input.dispatchEvent(new Event("blur", { bubbles: true, composed: true }));
        await window.SREngine.wait(250);

        if (String(input.value || "").includes(String(year))) {
            input.dataset.fa_filled = "true";
            window.FastApplyUtils.setValueOwner?.(input, "deterministic");
            return true;
        }
        try {
            input.focus();
            input.select?.();
            document.execCommand("delete");
        } catch (_) {}
    }
    return false;
};

// The phone widget defaults its country picker by geo-IP (a Swiss +41 makes
// a US number "not valid"). Align the picker with the profile country and
// re-validate the number.
window.SREngine.fixPhoneCountry = async (profile) => {
    const c = profile.contactInfo || {};
    if (!/united states|usa|u\.s/i.test(String(c.country || ""))) return false;

    const phoneInput = window.SREngine.deepQueryAll('input[type="tel"]')[0] ||
        window.SREngine.findInputByLabelText("Phone number");
    if (!phoneInput) return false;

    let digits = String(c.phone || "").replace(/[^\d]/g, "");
    if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
    if (!digits) return false;

    const selects = window.SREngine.deepQueryAll("select");
    const countrySelect = selects.find(select => {
        const options = Array.from(select.options || []);
        return options.length > 30 && options.some(option => {
            return /\+\d{1,4}/.test(option.text) || /united states|switzerland/i.test(option.text);
        });
    });

    if (countrySelect) {
        const current = (countrySelect.options[countrySelect.selectedIndex]?.text || "");
        if (!/united states|\+1\b/i.test(current)) {
            const usOption = Array.from(countrySelect.options).find(option => {
                return /united states/i.test(option.text);
            });
            if (usOption) {
                countrySelect.value = usOption.value;
                countrySelect.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
                countrySelect.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
                await window.SREngine.wait(300);
            }
        }
        // Re-enter the number so it validates against the corrected code.
        try {
            const setter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, "value"
            )?.set;
            if (setter) setter.call(phoneInput, digits);
            else phoneInput.value = digits;
        } catch (_) {}
        phoneInput.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        phoneInput.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        phoneInput.dispatchEvent(new Event("blur", { bubbles: true, composed: true }));
        phoneInput.dataset.fa_filled = "true";
        return true;
    }

    // No native select (intl-tel-input style): a full +1 number sets the flag.
    if (!String(phoneInput.value || "").startsWith("+")) {
        try {
            phoneInput.focus();
            phoneInput.select?.();
            document.execCommand("insertText", false, `+1${digits}`);
        } catch (_) {}
        phoneInput.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        phoneInput.dispatchEvent(new Event("blur", { bubbles: true, composed: true }));
    }
    return true;
};

// --- 3. SECTION HANDLERS ---
window.SREngine.fillPersonalInfo = async (profile) => {
    const p = profile.personalInfo || {};
    const c = profile.contactInfo || {};

    const mappings = [
        { label: "First name", value: p.firstName },
        { label: "Last name", value: p.lastName },
        { label: "Email", value: c.email },
        { label: "Confirm your email", value: c.email }
    ];

    for (const map of mappings) {
        const input = window.SREngine.findInputByLabelText(map.label);
        if (input) {
            window.SREngine.setNativeValue(input, map.value);
            await window.SREngine.wait(200);
        }
    }

    // City must be committed through its suggestion list.
    const cityInput = window.SREngine.findInputByLabelText("City");
    if (cityInput) await window.SREngine.commitAutocomplete(cityInput, c.city);

    // Phone: number + geo-defaulted country picker correction.
    await window.SREngine.fixPhoneCountry(profile);
};

window.SREngine.fillProfiles = async (profile) => {
    const links = profile.websitesAndSkills || {};
    const mappings = [
        { label: "LinkedIn", value: links.linkedin },
        { label: "Facebook", value: links.facebook },
        { label: "X (fka Twitter)", value: links.twitter },
        { label: "Website", value: links.portfolio || links.github }
    ];

    for (const map of mappings) {
        const input = window.SREngine.findInputByLabelText(map.label);
        if (input) window.SREngine.setNativeValue(input, map.value);
    }
};

// --- SECTION (Experience / Education) HANDLING ---
// Workday-style: cards are added one per pass, every lookup is SCOPED to
// the card being filled (page-global lookups cross-contaminated fields and
// ticked the wrong "I currently work here" checkbox when several cards were
// open), and missing entries are counted by occurrences so duplicate job
// titles ("Program Officer" ×3) are each added.

const srTextOf = el =>
    (el?.innerText || el?.textContent || "").replace(/\*/g, '').trim().toLowerCase();

// Sections are detected GEOMETRICALLY: the SmartRecruiters UI renders
// inside shadow roots, where plain document queries find no headings and
// document-order comparisons break across shadow boundaries. Headings are
// located through the shadow walker, and an element belongs to a section
// when its Y position sits between that section's heading and the next.
const SR_SECTION_TITLES = [
    'personal information', 'experience', 'education', 'your profiles',
    'resume', 'certifications', 'languages', 'skills',
    'message to the hiring team', 'additional information',
    'screening questions'
];

const srRect = el => {
    try { return el.getBoundingClientRect(); } catch (_) { return null; }
};
const srVisible = el => {
    const rect = srRect(el);
    return Boolean(rect && rect.width > 0 && rect.height > 0);
};

const findSectionHeadings = () => {
    const candidates = window.SREngine.deepQueryAll('h1, h2, h3, h4, h5, legend, p, span, div')
        .filter(el => {
            if (!srVisible(el)) return false;
            const text = srTextOf(el);
            if (!text || text.length > 45) return false;
            return SR_SECTION_TITLES.some(title => text === title || text.startsWith(title));
        });
    // Leaf-most element per heading: drop wrappers that contain another
    // candidate with the same role.
    const leaves = candidates.filter(el => {
        return !candidates.some(other => other !== el && el.contains(other));
    });
    return leaves.map(el => ({
        el,
        top: srRect(el).top,
        text: srTextOf(el)
    }));
};

const getSectionBounds = (keyword) => {
    const headings = findSectionHeadings();
    const own = headings
        .filter(h => h.text.startsWith(keyword))
        .sort((a, b) => a.top - b.top)[0];
    if (!own) {
        console.debug(
            '[FastApply:smartrecruiters] sections detected:',
            headings.map(h => `${h.text}@${Math.round(h.top)}`).join(', ') || '(none)'
        );
        return null;
    }
    const lowerTops = headings
        .filter(h => h.top > own.top + 1 && !h.text.startsWith(keyword))
        .map(h => h.top);
    return {
        heading: own.el,
        top: own.top,
        bottom: lowerTops.length ? Math.min(...lowerTops) : Infinity
    };
};

const isInSection = (element, bounds) => {
    if (!element || !bounds || !srVisible(element)) return false;
    const rect = srRect(element);
    return rect.top > bounds.top + 1 && rect.top < bounds.bottom;
};

// Saved (collapsed) cards render their key as leaf text nodes.
const countSavedEntries = (bounds, key) => {
    if (!key) return 0;
    return window.SREngine.deepQueryAll('h1, h2, h3, h4, h5, strong, b, p, span, div')
        .filter(el => {
            return el.children.length === 0 &&
                isInSection(el, bounds) &&
                srTextOf(el) === key;
        }).length;
};

// Label → control lookup, scoped to a card/section.
window.SREngine.getLabeledInput = (scope, labelText) => {
    if (!scope) return null;
    const wanted = labelText.toLowerCase();
    const labels = Array.from(scope.querySelectorAll('label, .c-spl-form-field-label'));
    const label = labels.find(l => srTextOf(l) === wanted) ||
        labels.find(l => {
            const t = srTextOf(l);
            return t.includes(wanted) && t.length <= Math.max(40, wanted.length * 4);
        });
    if (!label) return null;
    const forAttr = label.getAttribute('for') || label.htmlFor;
    if (forAttr) {
        const root = label.getRootNode?.() || document;
        const byId = root.querySelector?.(`[id="${forAttr}"]`);
        if (byId) return byId;
    }
    const wrapper = label.closest('div') || scope;
    return wrapper.querySelector(
        'input:not([type="hidden"]):not([type="checkbox"]), textarea, [contenteditable="true"]'
    );
};

// Smallest ancestor holding exactly ONE anchor label and no section
// heading — the entry card.
window.SREngine.getCardRoot = (anchorInput, anchorLabel) => {
    const countAnchors = scope => {
        return Array.from(scope.querySelectorAll('label, .c-spl-form-field-label'))
            .filter(l => srTextOf(l) === anchorLabel).length;
    };
    let node = anchorInput.parentElement;
    let best = anchorInput.parentElement;
    while (node && node !== document.body) {
        if (countAnchors(node) > 1) break;
        if (node.querySelector('h1, h2, h3, h4, h5, legend')) break;
        best = node;
        node = node.parentElement;
    }
    return best;
};

// Description boxes are framework-controlled (plain value writes were
// reverted AFTER our verification, leaving them empty) and can be
// contenteditable — type through the native editing pipeline.
window.SREngine.fillSrRichText = async (element, value) => {
    if (!element || !value) return false;
    const readValue = () => element.isContentEditable
        ? (element.innerText || '').trim()
        : String(element.value || '').trim();
    if (readValue()) return true;

    try {
        element.focus();
        if (element.isContentEditable) document.execCommand('selectAll', false, null);
        else element.select?.();
        document.execCommand('insertText', false, value);
    } catch (_) {}

    if (!readValue() && !element.isContentEditable) {
        window.SREngine.setNativeValue(element, value);
    }
    element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true, composed: true }));
    await window.SREngine.wait(150);

    if (readValue()) {
        element.dataset.fa_filled = 'true';
        window.FastApplyUtils.setValueOwner?.(element, 'deterministic');
        return true;
    }
    return false;
};

const fillSmartRecruitersSection = async (sectionKeyword, entries, config) => {
    const validEntries = (Array.isArray(entries) ? entries : [])
        .filter(entry => (config.entryKey(entry) || '').trim());
    if (!validEntries.length) return false;

    const flag = `isFilling_${sectionKeyword}`;
    if (window.SREngine[flag]) return false;
    window.SREngine[flag] = true;

    try {
        const bounds = getSectionBounds(sectionKeyword);
        if (!bounds) {
            console.debug(`[FastApply:smartrecruiters] section "${sectionKeyword}": heading not found`);
            return false;
        }

        const anchorLabels = window.SREngine.deepQueryAll('label, .c-spl-form-field-label')
            .filter(l => srTextOf(l) === config.anchorLabel && isInSection(l, bounds));
        const anchorInputs = anchorLabels.map(label => {
            const forAttr = label.getAttribute('for') || label.htmlFor;
            const root = label.getRootNode?.() || document;
            return (forAttr && root.querySelector?.(`[id="${forAttr}"]`)) ||
                (label.closest('div') || document)
                    .querySelector('input:not([type="hidden"])');
        }).filter(Boolean);

        // Occurrence-counted presence (saved cards + open card values) so
        // duplicate titles all get their own card.
        const openValues = anchorInputs
            .map(input => String(input.value || '').trim().toLowerCase())
            .filter(Boolean);
        const presentByKey = new Map();
        const missingEntries = [];
        for (const entry of validEntries) {
            const key = (config.entryKey(entry) || '').trim().toLowerCase();
            if (!presentByKey.has(key)) {
                presentByKey.set(
                    key,
                    countSavedEntries(bounds, key) +
                    openValues.filter(value => value === key).length
                );
            }
            const present = presentByKey.get(key);
            if (present > 0) presentByKey.set(key, present - 1);
            else missingEntries.push(entry);
        }

        const emptyAnchor = anchorInputs.find(input => {
            return !String(input.value || '').trim();
        });

        if (emptyAnchor && missingEntries.length) {
            const card = window.SREngine.getCardRoot(
                emptyAnchor,
                config.anchorLabel
            );
            await config.fillCard(card, missingEntries[0]);
            console.debug(
                `[FastApply:smartrecruiters] ${sectionKeyword} card filled:`,
                config.entryKey(missingEntries[0])
            );

            // Save the card so it collapses and the next pass adds the next
            // entry. If SmartRecruiters rejects it (validation), the card
            // stays open with its values for the user to finish.
            await window.SREngine.wait(400);
            const saveButton = Array.from(card.querySelectorAll('button'))
                .find(button => (button.innerText || '').trim().toLowerCase() === 'save');
            if (saveButton) {
                saveButton.click();
                await window.SREngine.wait(1000);
            }
            return true;
        }

        if (!emptyAnchor && missingEntries.length) {
            // The Add button sits in the section's header ROW — its Y is at
            // (or slightly above) the heading itself, so allow a margin.
            const addButton = window.SREngine.deepQueryAll('button')
                .filter(button => {
                    return srVisible(button) &&
                        /(^|\s)add(\s|$)/i.test((button.innerText || '').trim());
                })
                .find(button => {
                    const rect = srRect(button);
                    return rect && rect.top > bounds.top - 60 && rect.top < bounds.bottom;
                });
            if (!addButton) {
                console.debug(
                    `[FastApply:smartrecruiters] section "${sectionKeyword}": Add button not found`
                );
                return false;
            }
            addButton.click();
            console.debug(
                `[FastApply:smartrecruiters] ${sectionKeyword}: added card for`,
                config.entryKey(missingEntries[0])
            );
            await window.SREngine.wait(1200);
            return true; // the next pass fills the new card
        }

        return false;
    } finally {
        window.SREngine[flag] = false;
    }
};

window.SREngine.handleExperience = async (workHistory) => {
    return fillSmartRecruitersSection('experience', workHistory, {
        anchorLabel: 'title',
        entryKey: work => work?.jobTitle || '',
        fillCard: async (card, work) => {
            await window.SREngine.commitAutocomplete(
                window.SREngine.getLabeledInput(card, 'Title'), work.jobTitle
            );
            await window.SREngine.commitAutocomplete(
                window.SREngine.getLabeledInput(card, 'Company'), work.company
            );
            await window.SREngine.commitAutocomplete(
                window.SREngine.getLabeledInput(card, 'Office location'), work.location
            );
            await window.SREngine.fillSrRichText(
                window.SREngine.getLabeledInput(card, 'Description'), work.description
            );
            await window.SREngine.fillSrDate(
                window.SREngine.getLabeledInput(card, 'From'), work.startDate
            );

            // "Present"/"Current" is NOT a date — it means the current-role
            // checkbox (SmartRecruiters throws "Invalid date provided:
            // Present" otherwise).
            const isPresent = /present|current/i.test(String(work.endDate || ''));
            if (work.currentlyWorkHere || isPresent) {
                const currentCheckbox = card.querySelector('input[type="checkbox"]');
                if (currentCheckbox && !currentCheckbox.checked) currentCheckbox.click();
            } else if (work.endDate) {
                await window.SREngine.fillSrDate(
                    window.SREngine.getLabeledInput(card, 'To'), work.endDate
                );
            }
            return true;
        }
    });
};

window.SREngine.handleEducation = async (eduHistory) => {
    return fillSmartRecruitersSection('education', eduHistory, {
        anchorLabel: 'institution',
        entryKey: edu => edu?.school || '',
        fillCard: async (card, edu) => {
            await window.SREngine.commitAutocomplete(
                window.SREngine.getLabeledInput(card, 'Institution'), edu.school
            );
            await window.SREngine.fillSrRichText(
                window.SREngine.getLabeledInput(card, 'Major'), edu.major
            );
            await window.SREngine.fillSrRichText(
                window.SREngine.getLabeledInput(card, 'Degree'), edu.degree
            );
            if (edu.institutionLocation) {
                await window.SREngine.commitAutocomplete(
                    window.SREngine.getLabeledInput(card, 'School location'),
                    edu.institutionLocation
                );
            }
            await window.SREngine.fillSrDate(
                window.SREngine.getLabeledInput(card, 'From'), edu.startDate
            );
            if (edu.endDate && !/present|current/i.test(String(edu.endDate))) {
                await window.SREngine.fillSrDate(
                    window.SREngine.getLabeledInput(card, 'To'), edu.endDate
                );
            } else if (edu.endDate) {
                const currentCheckbox = card.querySelector('input[type="checkbox"]');
                if (currentCheckbox && !currentCheckbox.checked) currentCheckbox.click();
            }
            return true;
        }
    });
};

// --- ORCHESTRATOR LOOP ---
const startSREngine = () => {
    window.FastApplyUtils.loadProfileData((profileData, autofillEnabled) => {
        if (!autofillEnabled || !profileData) return;
        const res = { profileData };
        let currentProfile = res.profileData;
        let pendingRun = 0;
        const run = () => runSmartRecruitersDeterministic(currentProfile);
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

const runSmartRecruitersDeterministic = async profile => {
    // Every stage runs in its own guard: a crash in one (e.g. the City
    // autocomplete) must never stop the Experience/Education automation.
    const safeStage = async (name, stage) => {
        try {
            await stage();
        } catch (error) {
            console.warn(`[FastApply] SmartRecruiters ${name} stage failed:`, error);
        }
    };

    await safeStage('personal', () => window.SREngine.fillPersonalInfo(profile));
    await safeStage('profiles', () => window.SREngine.fillProfiles(profile));
    await safeStage('experience', () => window.SREngine.handleExperience(profile.workHistory));
    await safeStage('education', () => window.SREngine.handleEducation(profile.educationHistory));
};

window.FastApplyAgent2Controller?.register({
    atsPlatform: "smartrecruiters",
    runDeterministic: runSmartRecruitersDeterministic
});

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startSREngine);
} else {
    startSREngine();
}
})();
