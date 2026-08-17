import axios from 'axios';

// ======================================================
// CONFIGURATION
// ======================================================

const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434';
const DEFAULT_OLLAMA_MODEL = 'llama3.1';

const DEFAULT_HF_URL = 'https://router.huggingface.co/v1';
const DEFAULT_EXTRACTION_MODEL = 'openai/gpt-oss-20b';
const DEFAULT_WRITING_MODEL = 'openai/gpt-oss-120b';

const DEFAULT_TIMEOUT = 180000;
const DEFAULT_EXTRACTION_TOKENS = 7000;
const DEFAULT_WRITING_TOKENS = 3000;

const DEFAULT_HF_VISION_MODEL = 'zai-org/GLM-4.5V';
const DEFAULT_HF_VISION_PROVIDER = 'novita';
// ======================================================
// AGENT 1 OUTPUT TEMPLATE
// ======================================================

const CORE_PROFILE_TEMPLATE = {
  personalInfo: {
    firstName: '',
    lastName: '',
    preferredName: '',
    pronouns: '',
    languages: [{
      language: '',
      proficiency: '',
      fluent: false
    }]
  },

  contactInfo: {
    email: '',
    phone: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    country: '',
    postalCode: ''
  },

  websitesAndSkills: {
    linkedin: '',
    github: '',
    twitter: '',
    portfolio: '',
    skills: ['']
  },

  workHistory: [{
    jobTitle: '',
    company: '',
    location: '',
    employmentType: '',
    currentlyWorkHere: false,
    startDate: '',
    endDate: '',
    description: ''
  }],

  educationHistory: [{
    school: '',
    institutionLocation: '',
    degree: '',
    major: '',
    minor: '',
    gpa: '',
    gpaScale: '',
    startDate: '',
    endDate: ''
  }],

  eeo: {
    optOut: false,
    authorizedToWork: '',
    requireVisaNow: '',
    requireVisaFuture: '',
    disability: '',
    veteran: '',
    gender: '',
    ethnicity: '',
    race: '',
    age: ''
  }
};

const APPLICATION_MEMORY_TEMPLATE = {
  answers: [{
    key: '',
    question: '',
    answer: '',
    answerType: 'text',
    aliases: [],
    source: 'cqfo',
    sensitive: false,
    confidence: 1
  }]
};

const MEMORY_ANSWER_TEMPLATE = {
  key: '',
  question: '',
  answer: '',
  answerType: 'text',
  aliases: [],
  source: 'cqfo',
  sensitive: false,
  confidence: 1
};

const CQFO_PERSONAL_TEMPLATE = {
  personalInfo: {
    firstName: '',
    lastName: ''
  },

  contactInfo: {
    phone: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    country: '',
    postalCode: ''
  },

  eeo: {
    optOut: false,
    disability: '',
    veteran: '',
    gender: '',
    ethnicity: '',
    race: '',
    age: ''
  },

  applicationMemory: {
    answers: [MEMORY_ANSWER_TEMPLATE]
  }
};

const CQFO_APPLICATION_TEMPLATE = {
  personalInfo: {
    languages: [{
      language: '',
      proficiency: '',
      fluent: false
    }]
  },

  eeo: {
    authorizedToWork: '',
    requireVisaNow: '',
    requireVisaFuture: ''
  },

  applicationMemory: {
    answers: [MEMORY_ANSWER_TEMPLATE]
  }
};

const CQFO_CREDENTIALS_TEMPLATE = {
  educationHistory: [{
    school: '',
    institutionLocation: '',
    degree: '',
    major: '',
    minor: '',
    gpa: '',
    gpaScale: '',
    startDate: '',
    endDate: ''
  }],

  applicationMemory: {
    answers: [MEMORY_ANSWER_TEMPLATE]
  }
};

const CQFO_VISION_BATCHES = [
  {
    name: 'cqfo_personal_eeo',
    pages: [1, 2],
    template: CQFO_PERSONAL_TEMPLATE,
    focus: `
Extract personal details, contact details, gender, date of birth, ethnicity,
race, disability, veteran status, travel percentage and telephone availability.
`
  },
  {
    name: 'cqfo_application_details',
    pages: [3, 4],
    template: CQFO_APPLICATION_TEMPLATE,
    focus: `
Extract languages, nationality, citizenship, relocation, travel flexibility,
work-time availability, salary, US/Canada work authorization, sponsorship,
sponsorship details and every professional reference field.
`
  },
  {
    name: 'cqfo_credentials_legal',
    pages: [5, 6],
    template: CQFO_CREDENTIALS_TEMPLATE,
    focus: `
Extract every certification, education entry, government employment,
employment agreements, criminal-history answers and interview availability.
`
  }
];

const CQFO_RECOVERY_FIELDS = {
  willingToRelocate: {
    question: 'Are you willing to relocate?',
    description: 'Return only Yes or No.',
    sensitive: false
  },

  otherCitizenshipOrResidency: {
    question: 'Are you a citizen of another country or hold permanent residency status?',
    description: 'Return only Yes or No.',
    sensitive: true
  },

  salaryMinimum: {
    question: 'Minimum expected annual base salary',
    description: 'Return digits only, without commas or currency symbols.',
    sensitive: true
  },

  salaryMaximum: {
    question: 'Maximum expected annual base salary',
    description: 'Return digits only, without commas or currency symbols.',
    sensitive: true
  },

  salaryCurrency: {
    question: 'Expected salary currency',
    description: 'Return the three-letter currency code, such as USD or CAD.',
    sensitive: true
  },

  salaryNegotiationNotes: {
    question: 'Additional salary negotiation notes',
    description: 'Return the exact entered note.',
    sensitive: true
  },

  authorizedToWorkUSA: {
    question: 'Are you legally authorized to work in the United States?',
    description: 'Return only Yes or No.',
    sensitive: true
  },

  sponsorshipRequired: {
    question: 'Will you now or in the future require employment sponsorship?',
    description: 'Return only Yes or No.',
    sensitive: true
  },

  sponsorshipDetails: {
    question: 'Employment sponsorship details',
    description: 'Return the exact entered details.',
    sensitive: true
  },

  canadaWorkAuthorizationDetails: {
    question: 'Canada work authorization details',
    description: 'Return the exact entered details.',
    sensitive: true
  },

  governmentEmployment: {
    question: 'Have you been employed by a government entity in the last three years?',
    description: 'Return only Yes or No.',
    sensitive: true
  },

  employmentAgreement: {
    question: 'Are you subject to a non-compete, non-solicitation or similar agreement?',
    description: 'Return only Yes or No.',
    sensitive: true
  },

  criminalHistory: {
    question: 'Do you have the criminal-history condition described in the questionnaire?',
    description: 'Return only Yes or No.',
    sensitive: true
  },

  interviewAvailability: {
    question: 'Interview availability',
    description: 'Return all entered interview dates or time ranges.',
    sensitive: false
  }
};

const CQFO_APPLICATION_RECOVERY_KEYS = [
  'willingToRelocate',
  'otherCitizenshipOrResidency',
  'salaryMinimum',
  'salaryMaximum',
  'salaryCurrency',
  'salaryNegotiationNotes',
  'authorizedToWorkUSA',
  'sponsorshipRequired',
  'sponsorshipDetails',
  'canadaWorkAuthorizationDetails'
];

const CQFO_LEGAL_RECOVERY_KEYS = [
  'governmentEmployment',
  'employmentAgreement',
  'criminalHistory',
  'interviewAvailability'
];

const FORM_ANSWER_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['answers'],
  properties: {
    answers: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'fieldId',
          'value',
          'evidenceSource',
          'evidenceKey',
          'evidenceQuote',
          'confidence',
          'requiresReview',
          'reviewReason'
        ],
        properties: {
          fieldId: { type: 'string' },
          value: {
            anyOf: [
              { type: 'string' },
              { type: 'number' },
              { type: 'boolean' },
              {
                type: 'array',
                items: { type: 'string' }
              }
            ]
          },
          evidenceSource: {
            type: 'string',
            enum: [
              'profile',
              'applicationMemory',
              'resume',
              'cqfo',
              'coverLetter',
              'generated',
              'derived',
              'none'
            ]
          },
          evidenceKey: { type: 'string' },
          evidenceQuote: { type: 'string' },
          confidence: {
            type: 'number',
            minimum: 0,
            maximum: 1
          },
          requiresReview: { type: 'boolean' },
          reviewReason: { type: 'string' }
        }
      }
    }
  }
};

// ======================================================
// GENERAL HELPERS
// ======================================================

const getPositiveInteger = (value, fallback) => {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number > 0 ? number : fallback;
};

const getProvider = () => {
  return (process.env.LLM_PROVIDER || 'ollama').trim().toLowerCase();
};

const removeTrailingSlash = (value) => {
  return value.replace(/\/+$/, '');
};

const templateToJsonSchema = (value) => {
  if (Array.isArray(value)) {
    return {
      type: 'array',
      items: value.length ? templateToJsonSchema(value[0]) : {}
    };
  }

  if (value && typeof value === 'object') {
    const properties = {};

    Object.entries(value).forEach(([key, item]) => {
      properties[key] = templateToJsonSchema(item);
    });

    return {
      type: 'object',
      properties,
      required: Object.keys(properties),
      additionalProperties: false
    };
  }

  if (typeof value === 'boolean') return { type: 'boolean' };
  if (typeof value === 'number') return { type: 'number' };

  return { type: 'string' };
};

const CORE_PROFILE_SCHEMA = templateToJsonSchema(CORE_PROFILE_TEMPLATE);

const extractBalancedJSONObjects = (text) => {
  const objects = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index++) {
    const character = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }

      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === '{') {
      if (depth === 0) start = index;
      depth++;
    }

    if (character === '}') {
      depth--;

      if (depth === 0 && start !== -1) {
        objects.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }

  return objects;
};

const sanitizeLLMOutput = (rawResponse) => {
  if (rawResponse === null || rawResponse === undefined) {
    throw new Error('AI returned an empty response.');
  }

  if (typeof rawResponse === 'object' && !Array.isArray(rawResponse)) {
    return rawResponse;
  }

  let text = typeof rawResponse === 'string'
    ? rawResponse.trim()
    : JSON.stringify(rawResponse);

  // Pure JSON parses as-is; do this before any fence stripping so a literal
  // ``` inside a string value is never corrupted.
  try {
    return JSON.parse(text);
  } catch {}

  // Strip markdown fences only at the boundaries of the payload (the old
  // global split/join removed ``` sequences from inside string values too).
  text = text
    .replace(/^\s*```(?:json|javascript|js)?\s*\r?\n?/i, '')
    .replace(/\r?\n?\s*```\s*$/, '')
    .trim();

  try {
    return JSON.parse(text);
  } catch {
    // Prose responses can embed example objects before the real payload; try
    // every balanced object, largest first — the answer is almost always the
    // biggest one that parses.
    const candidates = extractBalancedJSONObjects(text)
      .sort((first, second) => second.length - first.length);

    if (!candidates.length) {
      throw new Error(`AI did not return valid JSON. Response: ${text.slice(0, 300)}`);
    }

    let lastError = null;
    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate);
      } catch (error) {
        lastError = error;
      }
    }

    throw new Error(`AI returned malformed JSON: ${lastError?.message || 'unparseable'}`);
  }
};

const unwrapExtractionResult = (result) => {
  let data = result;

  if (data?.data && typeof data.data === 'object') {
    data = data.data;
  }

  if (data?.Target_Schema_Layout) {
    data = data.Target_Schema_Layout;
  }

  if (data?.profile && typeof data.profile === 'object') {
    data = data.profile;
  }

  return data && typeof data === 'object' ? data : {};
};

const getApplicationMemoryAnswers = (result) => {
  const data = unwrapExtractionResult(result);

  if (Array.isArray(data.answers)) {
    return data.answers;
  }

  if (Array.isArray(data.applicationMemory?.answers)) {
    return data.applicationMemory.answers;
  }

  return [];
};

const runCqfoVisionExtraction = async (cqfoText, cqfoImages) => {
  if (!Array.isArray(cqfoImages) || cqfoImages.length === 0) {
    return null;
  }

  const provider = getProvider();

  if (!['huggingface', 'hugging-face', 'hf'].includes(provider)) {
    throw new Error(
      'Visual CQFO extraction currently requires LLM_PROVIDER=huggingface.'
    );
  }

  const model = getHuggingFaceVisionModel();
  const results = [];

  for (const batch of CQFO_VISION_BATCHES) {
    const batchImages = cqfoImages.filter(image => {
      return batch.pages.includes(image.pageNumber);
    });

    if (batchImages.length === 0) {
      throw new Error(
        `Missing rendered CQFO images for pages ${batch.pages.join(', ')}.`
      );
    }

    const prompts = buildCqfoVisionPrompts(
      cqfoText,
      batchImages,
      batch
    );

    console.log(
      `Extracting ${batch.name} from CQFO pages ${batch.pages.join(', ')}`
    );

    const result = await makeHuggingFaceRequest({
      task: 'extraction',
      ...prompts,
      modelOverride: model,
      maxTokensOverride: getPositiveInteger(
        process.env.HF_VISION_BATCH_MAX_TOKENS,
        4500
      ),
      reasoningEffortOverride:
        process.env.HF_VISION_REASONING || 'low',
      temperature: 0,
      responseSchema: null,
      schemaName: batch.name
    });

    results.push(result);
  }

  const mergedResult = mergeCqfoVisionResults(results);

  return await recoverMissingCqfoFields({
    cqfoText,
    cqfoImages,
    visionResult: mergedResult,
    model
  });
};


const hasMeaningfulValue = (value) => {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.keys(value).length > 0;

  return value !== '' && value !== null && value !== undefined;
};

const mergeNonEmpty = (base = {}, override = {}) => {
  const result = { ...base };

  Object.entries(override || {}).forEach(([key, value]) => {
    if (hasMeaningfulValue(value)) {
      result[key] = value;
    }
  });

  return result;
};

const cleanValue = (value) => {
  return typeof value === 'string' ? value.trim() : '';
};

const normalizeMatchValue = (value) => {
  return cleanValue(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
};

const getWordSet = (value) => {
  return new Set(
    normalizeMatchValue(value)
      .split(' ')
      .filter(word => word.length > 2)
  );
};

const getTextSimilarity = (first, second) => {
  const firstWords = getWordSet(first);
  const secondWords = getWordSet(second);

  if (!firstWords.size || !secondWords.size) return 0;

  const matches = [...firstWords].filter(word => secondWords.has(word)).length;
  return matches / Math.min(firstWords.size, secondWords.size);
};

const getEducationMatchScore = (first, second) => {
  let score = 0;

  if (getTextSimilarity(first.school, second.school) >= 0.45) score += 4;
  if (getTextSimilarity(first.degree, second.degree) >= 0.4) score += 2;
  if (getTextSimilarity(first.major, second.major) >= 0.4) score += 3;
  if (first.startDate && first.startDate === second.startDate) score += 1;
  if (first.endDate && first.endDate === second.endDate) score += 1;

  return score;
};

const getSpecificityScore = (value) => {
  const text = cleanValue(value);
  let score = text.length;

  if (/\bof\b/i.test(text)) score += 15;
  if (/engineering|science|technology|arts|business/i.test(text)) score += 10;
  if (/^bachelor degree$/i.test(text)) score -= 10;
  if (/^master degree$/i.test(text)) score -= 10;

  return score;
};

const pickMoreSpecificValue = (first, second) => {
  if (!first) return cleanValue(second);
  if (!second) return cleanValue(first);

  return getSpecificityScore(first) >= getSpecificityScore(second)
    ? cleanValue(first)
    : cleanValue(second);
};

const separateSchoolAndLocation = (school, location) => {
  const cleanSchool = cleanValue(school);
  const cleanLocation = cleanValue(location);

  if (!cleanSchool || !cleanLocation) {
    return { school: cleanSchool, location: cleanLocation };
  }

  if (cleanSchool.toLowerCase().endsWith(cleanLocation.toLowerCase())) {
    const trimmedSchool = cleanSchool
      .slice(0, cleanSchool.length - cleanLocation.length)
      .replace(/[,\s]+$/, '');

    return {
      school: trimmedSchool || cleanSchool,
      location: cleanLocation
    };
  }

  return {
    school: cleanSchool,
    location: cleanLocation
  };
};

const mergeEducationHistories = (coreHistory = [], visualHistory = []) => {
  if (!Array.isArray(visualHistory) || visualHistory.length === 0) {
    return Array.isArray(coreHistory) ? coreHistory : [];
  }

  const usedCoreIndexes = new Set();

  const mergedHistory = visualHistory.map(visualEntry => {
    let bestMatchIndex = -1;
    let bestMatchScore = 0;

    coreHistory.forEach((coreEntry, index) => {
      if (usedCoreIndexes.has(index)) return;

      const score = getEducationMatchScore(coreEntry, visualEntry);

      if (score > bestMatchScore) {
        bestMatchScore = score;
        bestMatchIndex = index;
      }
    });

    const coreEntry = bestMatchScore >= 3 && bestMatchIndex >= 0
      ? coreHistory[bestMatchIndex]
      : {};

    if (bestMatchIndex >= 0 && bestMatchScore >= 3) {
      usedCoreIndexes.add(bestMatchIndex);
    }

    const preferredSchool = cleanValue(visualEntry.school) || cleanValue(coreEntry.school);
    const preferredLocation = cleanValue(visualEntry.institutionLocation) ||
      cleanValue(coreEntry.institutionLocation);

    const schoolData = separateSchoolAndLocation(preferredSchool, preferredLocation);

    return {
      school: schoolData.school,
      institutionLocation: schoolData.location,
      degree: pickMoreSpecificValue(coreEntry.degree, visualEntry.degree),
      major: pickMoreSpecificValue(coreEntry.major, visualEntry.major),
      minor: cleanValue(visualEntry.minor) || cleanValue(coreEntry.minor),
      gpa: cleanValue(visualEntry.gpa) || cleanValue(coreEntry.gpa),
      gpaScale: cleanValue(visualEntry.gpaScale) || cleanValue(coreEntry.gpaScale),
      startDate: cleanValue(visualEntry.startDate) || cleanValue(coreEntry.startDate),
      endDate: cleanValue(visualEntry.endDate) || cleanValue(coreEntry.endDate)
    };
  });

  coreHistory.forEach((entry, index) => {
    if (!usedCoreIndexes.has(index)) {
      mergedHistory.push(entry);
    }
  });

  return mergedHistory;
};

const splitCqfoTextByPage = (text) => {
  if (typeof text !== 'string' || !text.trim()) return [];

  return text
    .split(/\n\s*--\s*\d+\s+of\s+\d+\s*--\s*\n/i)
    .map(page => page.trim())
    .filter(Boolean);
};

const getCqfoTextForPages = (cqfoText, pageNumbers) => {
  const pages = splitCqfoTextByPage(cqfoText);

  return pageNumbers.map(pageNumber => {
    const pageText = pages[pageNumber - 1] || '';
    return `--- CQFO PAGE ${pageNumber} ---\n${pageText}`;
  }).join('\n\n');
};


// ======================================================
// PROMPTS
// ======================================================

const buildCoreProfilePrompts = (textContext) => {
  const systemPrompt = `
You are Agent 1A, a strict candidate profile extraction system.

Extract only the candidate's core reusable profile data.

RULES:

1. Extract every employment entry.
2. Extract every education entry.
3. Extract every language separately.
4. Extract unique skills and website links.
5. Never invent missing information.
6. Use empty strings, empty arrays or false when unavailable.
7. Preserve employment and education dates as written.
8. Set currentlyWorkHere only when the documents support it.
9. Do not calculate age from date of birth.
10. EEO and visa answers must come from explicit document evidence.
11. Keep every job description below 700 characters.
12. Return no more than 100 unique skills.
13. Do not copy complete resume paragraphs.
14. Do not include applicationMemory in this response.
15. Return raw JSON only.
`.trim();

  const userPrompt = `
CORE PROFILE TEMPLATE:

${JSON.stringify(CORE_PROFILE_TEMPLATE)}

CANDIDATE DOCUMENTS:

${textContext}
`.trim();

  return { systemPrompt, userPrompt };
};

const buildApplicationMemoryPrompts = (textContext) => {
  const systemPrompt = `
You are Agent 1B, a strict reusable application-answer extractor.

Extract factual job-application answers that are not already normal profile
fields.

Examples include:

- Relocation
- Travel
- Work schedule
- Nationality
- Citizenship
- Salary expectations
- Sponsorship
- References
- Certifications
- Government employment
- Employment agreements
- Legal declarations
- Interview availability

RULES:

1. Prefer explicit CQFO answers.
2. Never guess an unanswered selection.
3. Do not create empty entries.
4. Do not create duplicate keys.
5. Use stable camelCase keys.
6. Keep question text below 200 characters.
7. Keep answers concise.
8. Return no more than 35 answers.
9. Return no more than 3 aliases per answer.
10. Use source values: resume, cqfo or coverLetter.
11. Mark salary, EEO, legal, health, citizenship, authorization,
    sponsorship and references as sensitive.
12. Confidence must be between 0 and 1.
13. Return raw JSON only.
`.trim();

  const userPrompt = `
APPLICATION MEMORY TEMPLATE:

${JSON.stringify(APPLICATION_MEMORY_TEMPLATE)}

CANDIDATE DOCUMENTS:

${textContext}
`.trim();

  return { systemPrompt, userPrompt };
};

const buildCqfoVisionPrompts = (cqfoText, cqfoImages, batch) => {
  const systemPrompt = `
You are a strict visual CQFO extraction system.

The CQFO uses GREEN HIGHLIGHTING to indicate selected choices. Inspect the
provided page images carefully. Page images are the source of truth for
Yes/No and multiple-choice selections.

CURRENT PAGE SCOPE:

${batch.focus}

GENERAL RULES:

1. Extract only information visible on the supplied pages.
2. Do not extract information from pages outside the current scope.
3. Read all typed values, tables and green-highlighted selections.
4. Never choose an option based only on its order in extracted text.
5. Never guess a value that is not visibly selected or entered.
6. Do not create empty application-memory answers.
7. Use stable camelCase keys.
8. Use source "cqfo".
9. Keep every fact atomic. Do not combine unrelated answers.
10. Return raw JSON only.

NORMALIZATION:

- Use "United States" instead of "USA" for address country.
- authorizedToWork must be "Yes", "No" or "".
- requireVisaNow must be "Yes", "No" or "".
- requireVisaFuture must be "Yes", "No" or "".
- disability must use the supported ATS wording.
- veteran must use the supported ATS wording.
- Convert percentage GPA to a 4.0 scale by multiplying it by 0.04.
- Preserve phone numbers, dates, names and selected values accurately.

APPLICATION MEMORY:

Create separate fields for salary, authorization, sponsorship, references,
certifications, legal declarations and interview availability.

References must use separate keys, for example:

- reference1FullName
- reference1Relationship
- reference1Company
- reference1JobTitle
- reference1Phone
- reference1Email

Certifications must use separate keys, for example:

- certification1Name
- certification1Issuer
- certification1DateAchieved
- certification1ExpirationDate

Mark date of birth, EEO, salary, nationality, citizenship, authorization,
sponsorship, references and legal answers as sensitive.
`.trim();

  const pageText = getCqfoTextForPages(cqfoText, batch.pages);

  const userPrompt = `
TEXT FROM THE CURRENT CQFO PAGES:

${pageText}

RETURN THIS STRUCTURE:

${JSON.stringify(batch.template)}
`.trim();

  const userContent = [
    { type: 'text', text: userPrompt },

    ...cqfoImages.map(image => ({
      type: 'image_url',
      image_url: {
        url: image.dataUrl
      }
    }))
  ];

  return {
    systemPrompt,
    userPrompt,
    userContent
  };
};


const normalizeMemoryKey = (value) => {
  return typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
    : '';
};

const mergeVisionLanguages = (current = [], incoming = []) => {
  const languages = new Map();

  [...current, ...incoming].forEach(item => {
    const key = cleanValue(item?.language).toLowerCase();

    if (!key) return;

    languages.set(key, {
      language: cleanValue(item.language),
      proficiency: cleanValue(item.proficiency),
      fluent: item.fluent === true
    });
  });

  return [...languages.values()];
};

const mergeVisionMemoryAnswers = (current = [], incoming = []) => {
  const answers = new Map();

  [...current, ...incoming].forEach(item => {
    const key = normalizeMemoryKey(item?.key);

    if (!key || !hasMeaningfulValue(item?.answer)) return;

    const existing = answers.get(key);

    if (!existing) {
      answers.set(key, item);
      return;
    }

    const existingConfidence = Number(existing.confidence) || 0;
    const incomingConfidence = Number(item.confidence) || 0;
    const preferred = incomingConfidence >= existingConfidence
      ? { ...existing, ...item }
      : { ...item, ...existing };

    preferred.aliases = [
      ...new Set([
        ...(existing.aliases || []),
        ...(item.aliases || [])
      ])
    ];

    answers.set(key, preferred);
  });

  return [...answers.values()];
};

const mergeCqfoVisionResults = (results) => {
  const merged = {
    personalInfo: {},
    contactInfo: {},
    educationHistory: [],
    eeo: {},
    applicationMemory: {
      answers: []
    }
  };

  results.forEach(result => {
    const data = unwrapExtractionResult(result);
    const previousLanguages = merged.personalInfo.languages || [];
    const incomingLanguages = data.personalInfo?.languages || [];

    merged.personalInfo = mergeNonEmpty(
      merged.personalInfo,
      data.personalInfo || {}
    );

    merged.personalInfo.languages = mergeVisionLanguages(
      previousLanguages,
      incomingLanguages
    );

    merged.contactInfo = mergeNonEmpty(
      merged.contactInfo,
      data.contactInfo || {}
    );

    merged.eeo = mergeNonEmpty(
      merged.eeo,
      data.eeo || {}
    );

    if (
      Array.isArray(data.educationHistory) &&
      data.educationHistory.length > 0
    ) {
      merged.educationHistory = data.educationHistory;
    }

    merged.applicationMemory.answers = mergeVisionMemoryAnswers(
      merged.applicationMemory.answers,
      data.applicationMemory?.answers || []
    );
  });

  return merged;
};

const getVisionMemoryKeys = (visionResult) => {
  const answers = visionResult?.applicationMemory?.answers || [];

  return new Set(
    answers
      .map(item => normalizeMemoryKey(item?.key))
      .filter(Boolean)
  );
};

const buildRecoveryTemplate = (missingKeys) => {
  const template = {};

  missingKeys.forEach(key => {
    template[key] = '';
  });

  return template;
};

const buildRecoveryFieldDescriptions = (missingKeys) => {
  return missingKeys.map(key => {
    const field = CQFO_RECOVERY_FIELDS[key];

    return [
      `KEY: ${key}`,
      `QUESTION: ${field.question}`,
      `FORMAT: ${field.description}`
    ].join('\n');
  }).join('\n\n');
};

const buildCqfoRecoveryPrompts = ({
  cqfoText,
  cqfoImages,
  pages,
  missingKeys
}) => {
  const pageText = getCqfoTextForPages(cqfoText, pages);
  const outputTemplate = buildRecoveryTemplate(missingKeys);

  const systemPrompt = `
You are a focused visual CQFO recovery system.

The previous extraction missed specific fields. Inspect only the supplied
pages and recover only the requested keys.

IMPORTANT:

1. Green highlighting indicates the selected answer.
2. Page images are the source of truth for Yes/No selections.
3. Extract typed values from tables and text boxes exactly.
4. Never guess from option order in the extracted text.
5. Return every requested key.
6. Return an empty string only when the field truly has no answer.
7. Do not return extra keys.
8. Return raw JSON only.

REQUESTED FIELDS:

${buildRecoveryFieldDescriptions(missingKeys)}
`.trim();

  const userPrompt = `
CQFO PAGE TEXT:

${pageText}

RETURN THIS EXACT OBJECT:

${JSON.stringify(outputTemplate)}
`.trim();

  const userContent = [
    { type: 'text', text: userPrompt },

    ...cqfoImages.map(image => ({
      type: 'image_url',
      image_url: {
        url: image.dataUrl
      }
    }))
  ];

  return {
    systemPrompt,
    userPrompt,
    userContent,
    outputTemplate
  };
};

const convertRecoveredFieldsToMemory = (fields) => {
  return Object.entries(fields || {})
    .filter(([key, value]) => {
      return CQFO_RECOVERY_FIELDS[key] &&
        value !== '' &&
        value !== null &&
        value !== undefined;
    })
    .map(([key, value]) => {
      const config = CQFO_RECOVERY_FIELDS[key];

      return {
        key,
        question: config.question,
        answer: typeof value === 'string' ? value.trim() : value,
        answerType: 'text',
        aliases: [],
        source: 'cqfo',
        sensitive: config.sensitive,
        confidence: 1
      };
    });
};

const normalizeRecoveredSalary = (fields) => {
  const result = { ...fields };

  ['salaryMinimum', 'salaryMaximum'].forEach(key => {
    if (typeof result[key] === 'string') {
      result[key] = result[key].replace(/[^\d.]/g, '');
    }
  });

  if (typeof result.salaryCurrency === 'string') {
    result.salaryCurrency = result.salaryCurrency.trim().toUpperCase();
  }

  return result;
};

const recoverSalaryFromCqfoText = (cqfoText) => {
  const result = {};

  const salaryMatch = cqfoText.match(
    /From\s*_*\s*([\d,]+).*?\b([A-Z]{3})\b\s+to\s*_*\s*([\d,]+).*?\b([A-Z]{3})\b/is
  );

  if (salaryMatch) {
    result.salaryMinimum = salaryMatch[1].replace(/,/g, '');
    result.salaryMaximum = salaryMatch[3].replace(/,/g, '');
    result.salaryCurrency = salaryMatch[2].toUpperCase();
  }

  const negotiationMatch = cqfoText.match(
    /regarding salary negotiations,[\s\S]*?below\.\s*\n+([^\n]+)/i
  );

  if (negotiationMatch) {
    result.salaryNegotiationNotes = negotiationMatch[1].trim();
  }

  return result;
};

const recoverMissingCqfoFields = async ({
  cqfoText,
  cqfoImages,
  visionResult,
  model
}) => {
  let recoveredResult = {
    ...visionResult,
    applicationMemory: {
      answers: [
        ...(visionResult?.applicationMemory?.answers || [])
      ]
    }
  };

  const salaryFromText = recoverSalaryFromCqfoText(cqfoText);
  const salaryAnswers = convertRecoveredFieldsToMemory(salaryFromText);

  recoveredResult.applicationMemory.answers = mergeVisionMemoryAnswers(
    recoveredResult.applicationMemory.answers,
    salaryAnswers
  );

  const runRecoveryGroup = async (keys, pages, name) => {
    const existingKeys = getVisionMemoryKeys(recoveredResult);

    const missingKeys = keys.filter(key => {
      return !existingKeys.has(normalizeMemoryKey(key));
    });

    if (missingKeys.length === 0) return;

    const pageImages = cqfoImages.filter(image => {
      return pages.includes(image.pageNumber);
    });

    if (pageImages.length === 0) {
      throw new Error(
        `Missing CQFO page images needed to recover: ${missingKeys.join(', ')}`
      );
    }

    console.log(
      `Recovering missing CQFO fields from pages ${pages.join(', ')}: ` +
      missingKeys.join(', ')
    );

    const prompts = buildCqfoRecoveryPrompts({
      cqfoText,
      cqfoImages: pageImages,
      pages,
      missingKeys
    });

    const result = await makeHuggingFaceRequest({
      task: 'extraction',
      systemPrompt: prompts.systemPrompt,
      userPrompt: prompts.userPrompt,
      userContent: prompts.userContent,
      modelOverride: model,
      maxTokensOverride: getPositiveInteger(
        process.env.HF_VISION_RECOVERY_MAX_TOKENS,
        3000
      ),
      reasoningEffortOverride:
        process.env.HF_VISION_RECOVERY_REASONING || 'none',
      disableThinkingOverride: true,
      temperature: 0,
      responseSchema: templateToJsonSchema(prompts.outputTemplate),
      schemaName: name
    });

    const normalizedResult = normalizeRecoveredSalary(
      unwrapExtractionResult(result)
    );

    const recoveredAnswers = convertRecoveredFieldsToMemory(
      normalizedResult
    );

    recoveredResult.applicationMemory.answers = mergeVisionMemoryAnswers(
      recoveredResult.applicationMemory.answers,
      recoveredAnswers
    );
  };

  await runRecoveryGroup(
    CQFO_APPLICATION_RECOVERY_KEYS,
    [3, 4],
    'cqfo_application_recovery'
  );

  await runRecoveryGroup(
    CQFO_LEGAL_RECOVERY_KEYS,
    [5, 6],
    'cqfo_legal_recovery'
  );

  return recoveredResult;
};

// ======================================================
// OLLAMA
// ======================================================

const getOllamaEndpoint = () => {
  const baseURL = removeTrailingSlash(
    process.env.OLLAMA_BASE_URL?.trim() || DEFAULT_OLLAMA_URL
  );

  return `${baseURL}/api/generate`;
};

const getOllamaModel = (task) => {
  if (task === 'writing') {
    return process.env.OLLAMA_WRITING_MODEL?.trim() ||
      process.env.OLLAMA_MODEL?.trim() ||
      DEFAULT_OLLAMA_MODEL;
  }

  return process.env.OLLAMA_EXTRACTION_MODEL?.trim() ||
    process.env.OLLAMA_MODEL?.trim() ||
    DEFAULT_OLLAMA_MODEL;
};

const createOllamaError = (error) => {
  if (!axios.isAxiosError(error)) return error;

  if (error.code === 'ECONNREFUSED') {
    return new Error('Could not connect to Ollama. Make sure Ollama is running.');
  }

  if (error.code === 'ETIMEDOUT') {
    return new Error('The Ollama request timed out.');
  }

  const status = error.response?.status;
  const details = error.response?.data
    ? JSON.stringify(error.response.data)
    : error.message;

  return new Error(`Ollama request failed${status ? ` with HTTP ${status}` : ''}: ${details}`);
};

const makeOllamaRequest = async ({ task, systemPrompt, userPrompt, temperature }) => {
  try {
    const response = await axios.post(getOllamaEndpoint(), {
      model: getOllamaModel(task),
      prompt: `${systemPrompt}\n\n${userPrompt}`,
      stream: false,
      format: 'json',
      options: {
        temperature,
        num_ctx: getPositiveInteger(process.env.OLLAMA_NUM_CTX, 16384)
      }
    }, {
      timeout: getPositiveInteger(process.env.LLM_REQUEST_TIMEOUT, DEFAULT_TIMEOUT)
    });

    const content = response.data?.response;

    if (!content) {
      throw new Error(`Ollama returned an unexpected response: ${JSON.stringify(response.data)}`);
    }

    return sanitizeLLMOutput(content);
  } catch (error) {
    throw createOllamaError(error);
  }
};

// ======================================================
// HUGGING FACE
// ======================================================

const getHuggingFaceEndpoint = () => {
  const baseURL = removeTrailingSlash(
    process.env.HF_BASE_URL?.trim() || DEFAULT_HF_URL
  );

  if (baseURL.includes('api-inference.huggingface.co')) {
    throw new Error('HF_BASE_URL must use the Hugging Face router endpoint.');
  }

  return baseURL.endsWith('/chat/completions')
    ? baseURL
    : `${baseURL}/chat/completions`;
};

const getHuggingFaceToken = () => {
  const token = (process.env.HF_API_KEY || process.env.HF_TOKEN || '').trim();

  if (!token) {
    throw new Error('Missing HF_API_KEY or HF_TOKEN in the .env file.');
  }

  return token;
};

const addProviderSuffix = (model, provider) => {
  if (!provider || model.includes(':')) return model;
  return `${model}:${provider}`;
};

const getHuggingFaceModel = (task) => {
  if (task === 'writing') {
    const model = process.env.HF_WRITING_MODEL?.trim() || DEFAULT_WRITING_MODEL;
    const provider = process.env.HF_WRITING_PROVIDER?.trim() || process.env.HF_PROVIDER?.trim();

    return addProviderSuffix(model, provider);
  }

  const model = process.env.HF_EXTRACTION_MODEL?.trim() ||
    process.env.HF_MODEL?.trim() ||
    DEFAULT_EXTRACTION_MODEL;

  const provider = process.env.HF_EXTRACTION_PROVIDER?.trim() ||
    process.env.HF_PROVIDER?.trim();

  return addProviderSuffix(model, provider);
};

const isUnsupportedModelError = (error) => {
  const message = error?.message?.toLowerCase() || '';

  return message.includes('model_not_supported') ||
    message.includes('not supported by an enabled provider');
};

const getHuggingFaceVisionModel = () => {
  const model = process.env.HF_VISION_MODEL?.trim() || DEFAULT_HF_VISION_MODEL;
  const provider = process.env.HF_VISION_PROVIDER?.trim() || DEFAULT_HF_VISION_PROVIDER;

  return addProviderSuffix(model, provider);
};

const responseFormatIsUnsupported = (error) => {
  if (!axios.isAxiosError(error)) return false;
  if (![400, 422].includes(error.response?.status)) return false;

  const details = JSON.stringify(error.response?.data || '').toLowerCase();

  return details.includes('response_format') ||
    details.includes('json_object') ||
    details.includes('structured output');
};

const createHuggingFaceError = (error, model) => {
  if (!axios.isAxiosError(error)) return error;

  const status = error.response?.status;
  const code = error.code;
  const responseData = error.response?.data;
  const details = responseData
    ? typeof responseData === 'string' ? responseData : JSON.stringify(responseData)
    : error.message;

  if (code === 'ENOTFOUND') {
    return new Error('DNS could not resolve router.huggingface.co.');
  }

  if (code === 'ETIMEDOUT') {
    return new Error(`Hugging Face model "${model}" timed out.`);
  }

  if (status === 401) {
    return new Error(`Hugging Face authentication failed: ${details}`);
  }

  if (status === 402) {
    return new Error(`Hugging Face credits or billing are required: ${details}`);
  }

  if (status === 403) {
    return new Error(`Access to Hugging Face model "${model}" was denied: ${details}`);
  }

  if (status === 429) {
    return new Error(`Hugging Face rate limit exceeded: ${details}`);
  }

  if (
    status === 400 &&
    details.toLowerCase().includes('model_not_supported')
  ) {
    return new Error(
      `Hugging Face model "${model}" is not supported by an enabled provider: ${details}`
    );
  }

  return new Error(
    `Hugging Face request failed${status ? ` with HTTP ${status}` : ''}` +
    `${code ? ` (${code})` : ''}: ${details}`
  );
};

const getGeneratedContent = (response) => {
  const content = response.data?.choices?.[0]?.message?.content;

  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    return content.map(item => item?.text || item?.content || '').join('');
  }

  return '';
};

const getGeneratedReasoning = (response) => {
  const reasoning = response.data?.choices?.[0]?.message?.reasoning_content;

  if (typeof reasoning === 'string') return reasoning;

  if (Array.isArray(reasoning)) {
    return reasoning.map(item => item?.text || item?.content || '').join('');
  }

  return '';
};

const supportsGlmThinkingSwitch = (model) => {
  return /(?:^|\/)glm[-_.]?4/i.test(String(model || ''));
};

const makeHuggingFaceRequest = async ({
  task,
  systemPrompt,
  userPrompt,
  userContent,
  temperature,
  modelOverride,
  maxTokensOverride,
  reasoningEffortOverride,
  disableThinkingOverride = false,
  responseSchema,
  schemaName = 'result'
}) => {
  const endpoint = getHuggingFaceEndpoint();
  const token = getHuggingFaceToken();
  const model = modelOverride || getHuggingFaceModel(task);

  const defaultMaxTokens = task === 'writing'
    ? getPositiveInteger(process.env.HF_WRITING_MAX_TOKENS, DEFAULT_WRITING_TOKENS)
    : getPositiveInteger(process.env.HF_PROFILE_MAX_TOKENS, 6000);

  const maxTokens = maxTokensOverride || defaultMaxTokens;

  const reasoningEffort = reasoningEffortOverride || (
    task === 'writing'
      ? process.env.HF_WRITING_REASONING || 'medium'
      : process.env.HF_EXTRACTION_REASONING || 'low'
  );

  const payload = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent || userPrompt }
    ],
    temperature,
    max_tokens: maxTokens,
    reasoning_effort: disableThinkingOverride ? 'none' : reasoningEffort,
    stream: false
  };

  if (disableThinkingOverride && supportsGlmThinkingSwitch(model)) {
    payload.chat_template_kwargs = {
      enable_thinking: false
    };
  }

  const config = {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    timeout: getPositiveInteger(process.env.LLM_REQUEST_TIMEOUT, DEFAULT_TIMEOUT)
  };

  const schemaFormat = responseSchema ? {
    type: 'json_schema',
    json_schema: {
      name: schemaName,
      strict: true,
      schema: responseSchema
    }
  } : {
    type: 'json_object'
  };

  const sendRequest = async (responseFormat, requestPayload = payload) => {
    const requestBody = responseFormat
      ? { ...requestPayload, response_format: responseFormat }
      : requestPayload;

    return await axios.post(endpoint, requestBody, config);
  };

  const sendWithSupportedFormat = async (requestPayload) => {
    try {
      return await sendRequest(schemaFormat, requestPayload);
    } catch (error) {
      if (!responseFormatIsUnsupported(error)) throw error;

      console.warn(`Structured output unavailable for "${model}". Retrying with JSON mode.`);

      try {
        return await sendRequest({ type: 'json_object' }, requestPayload);
      } catch (jsonError) {
        if (!responseFormatIsUnsupported(jsonError)) throw jsonError;

        console.warn(`JSON mode unavailable for "${model}". Retrying without response_format.`);
        return await sendRequest(null, requestPayload);
      }
    }
  };

  let response;

  try {
    response = await sendWithSupportedFormat(payload);
  } catch (error) {
    throw createHuggingFaceError(error, model);
  }

  let content = getGeneratedContent(response);
  let finishReason = response.data?.choices?.[0]?.finish_reason;

  if (!content && getGeneratedReasoning(response)) {
    console.warn(
      `Hugging Face model "${model}" returned reasoning without a final answer ` +
      `for "${schemaName}". Retrying once with thinking disabled.`
    );

    const retryPayload = {
      ...payload,
      messages: [
        {
          role: 'system',
          content:
            `${systemPrompt}\n\nDo not provide analysis or reasoning. ` +
            'Return the requested JSON object immediately.'
        },
        { role: 'user', content: userContent || userPrompt }
      ],
      reasoning_effort: 'none',
      max_tokens: Math.max(
        maxTokens,
        getPositiveInteger(process.env.HF_REASONING_RETRY_MAX_TOKENS, 4500)
      )
    };

    if (supportsGlmThinkingSwitch(model)) {
      retryPayload.chat_template_kwargs = {
        enable_thinking: false
      };
    }

    try {
      // JSON/schema response modes can make reasoning models spend their
      // entire completion budget before emitting message.content. The retry
      // is deliberately unstructured; the prompt still demands raw JSON and
      // sanitizeLLMOutput validates it below.
      response = await sendRequest(null, retryPayload);
    } catch (error) {
      throw createHuggingFaceError(error, model);
    }

    content = getGeneratedContent(response);
    finishReason = response.data?.choices?.[0]?.finish_reason;
  }

  if (!content) {
    const reasoningTokens =
      response.data?.usage?.completion_tokens_details?.reasoning_tokens;

    throw new Error(
      `Hugging Face model "${model}" returned no final answer for ` +
      `"${schemaName}"${finishReason ? ` (finish reason: ${finishReason})` : ''}` +
      `${Number.isFinite(reasoningTokens) ? ` after ${reasoningTokens} reasoning tokens` : ''}.`
    );
  }

  // A truncated completion is never trustworthy, even when the fragment
  // happens to be balanced JSON — for array payloads (e.g. form answers) it
  // silently drops the tail. Fail loudly so the caller can retry or surface
  // a clear error instead of quietly answering only some fields.
  if (finishReason === 'length') {
    throw new Error(
      `Hugging Face returned an incomplete response for "${schemaName}" ` +
      `after reaching ${maxTokens} tokens. Raise HF_WRITING_MAX_TOKENS or ` +
      `reduce the batch size.`
    );
  }

  return sanitizeLLMOutput(content);
};

// ======================================================
// AGENT 1 — PROFILE AND APPLICATION MEMORY
// ======================================================

const buildDocumentContext = (documents) => {
  const sections = [];

  if (documents.resumeText?.trim()) {
    sections.push(`--- RESUME ---\n${documents.resumeText.trim()}`);
  }

  if (documents.cqfoText?.trim()) {
    sections.push(`--- CQFO ---\n${documents.cqfoText.trim()}`);
  }

  if (documents.coverLetterText?.trim()) {
    sections.push(`--- COVER LETTER ---\n${documents.coverLetterText.trim()}`);
  }

  return sections.join('\n\n');
};

const normalizeDocumentInput = (input) => {
  if (typeof input === 'string') {
    return {
      resumeText: input,
      cqfoText: '',
      coverLetterText: '',
      cqfoImages: [],
      existingEeo: {},
      existingApplicationMemory: { answers: [] }
    };
  }

  return {
    resumeText: typeof input?.resumeText === 'string' ? input.resumeText : '',
    cqfoText: typeof input?.cqfoText === 'string' ? input.cqfoText : '',
    coverLetterText: typeof input?.coverLetterText === 'string' ? input.coverLetterText : '',
    cqfoImages: Array.isArray(input?.cqfoImages) ? input.cqfoImages : [],
    existingEeo: input?.existingEeo || {},
    existingApplicationMemory: input?.existingApplicationMemory || { answers: [] }
  };
};

const runExtractionRequest = async ({
  prompts,
  maxTokens,
  responseSchema,
  schemaName
}) => {
  const provider = getProvider();

  if (provider === 'ollama') {
    return await makeOllamaRequest({
      task: 'extraction',
      ...prompts,
      temperature: 0
    });
  }

  if (['huggingface', 'hugging-face', 'hf'].includes(provider)) {
    return await makeHuggingFaceRequest({
      task: 'extraction',
      ...prompts,
      temperature: 0.1,
      maxTokensOverride: maxTokens,
      reasoningEffortOverride: 'low',
      responseSchema,
      schemaName
    });
  }

  throw new Error(`Unsupported LLM provider: "${provider}".`);
};

export const extractProfileData = async (input) => {
  const documents = normalizeDocumentInput(input);
  const documentContext = buildDocumentContext(documents);

  if (!documentContext.trim()) {
    throw new Error('extractProfileData requires document text.');
  }

  const coreResult = await runExtractionRequest({
    prompts: buildCoreProfilePrompts(documentContext),
    maxTokens: getPositiveInteger(process.env.HF_PROFILE_MAX_TOKENS, 6000),
    responseSchema: CORE_PROFILE_SCHEMA,
    schemaName: 'candidate_profile'
  });

  const coreProfile = unwrapExtractionResult(coreResult);
  const visualResult = await runCqfoVisionExtraction(
    documents.cqfoText,
    documents.cqfoImages
  );

  const visualData = visualResult ? unwrapExtractionResult(visualResult) : {};
  const visualAnswers = visualData.applicationMemory?.answers;
  const existingAnswers = documents.existingApplicationMemory?.answers;

  return {
    ...coreProfile,

    personalInfo: mergeNonEmpty(
      coreProfile.personalInfo,
      visualData.personalInfo
    ),

    contactInfo: mergeNonEmpty(
      coreProfile.contactInfo,
      visualData.contactInfo
    ),

    educationHistory: mergeEducationHistories(
      coreProfile.educationHistory || [],
      visualData.educationHistory || []
    ),

    eeo: mergeNonEmpty(
      coreProfile.eeo,
      visualResult ? visualData.eeo : documents.existingEeo
    ),

    applicationMemory: {
      answers: Array.isArray(visualAnswers)
        ? visualAnswers
        : Array.isArray(existingAnswers)
          ? existingAnswers
          : []
    }
  };
};

// ======================================================
// AGENT 2 — CUSTOM APPLICATION ANSWERS
// ======================================================

export const generateFormAnswers = async ({
  candidateContext,
  jobContext,
  fields
}) => {
  const systemPrompt = `
You are Agent 2, an evidence-based job-application form audit and completion
agent.

You receive every supported field visible on the current application page,
including both empty fields and fields already completed by deterministic
autofill, a previous agent run, the site, or the user. Audit every supplied
field. Use currentValue, valueOwner and validity only as page-state evidence;
the candidate profile and documents remain the source of truth for answers.

For each field:

1. If currentValue is correct and supported by candidate evidence, return the
   same value exactly.
2. If currentValue is empty, invalid or incorrect and candidate evidence
   supports a correct value, return that correct value.
3. If no candidate evidence supports an answer, return an empty string. Never
   preserve or replace an unsupported factual answer merely because it is
   already present.
4. Return one answer object for every supplied field.

EVIDENCE PRIORITY:

1. Structured candidate profile
2. Application memory extracted from the CQFO
3. Resume raw text
4. CQFO raw text
5. Cover-letter raw text
6. Generated text based only on known candidate and job facts

DERIVED ANSWERS:

Some questions have no stored answer with matching wording but ARE answerable
by reasoning from known candidate facts. Answer them with evidenceSource
"derived", set evidenceKey to the profile or memory path the reasoning uses,
and put one short reasoning sentence in evidenceQuote. Examples:

- "Are you a citizen, national or resident of <list of countries>?" —
  compare the candidate's country of residence/citizenship against the listed
  countries and answer Yes or No accordingly.
- "Are you authorized to work in the country where this job is located?" —
  combine the job's country with the candidate's work-authorization answers.
- "Do you use or work on <specific product or system>?" — answer from work
  history and skills; No when nothing indicates its use.
- "Are you related to an employee of <this employer>?" / "Have you previously
  worked for <this employer>?" — No when nothing in the candidate data
  mentions such a relationship or employment.
- Acknowledgement questions that only ask the candidate to confirm they read
  and answered truthfully (e.g. 'enter "yes" to acknowledge') — return the
  requested acknowledgement.

Derived answers must never contradict stored candidate data, and sensitive
legal facts (criminal history, disability, protected-class details) must
never be derived — without a stored answer those stay empty.

STRICT RULES:

1. Never invent a factual value.
2. Never infer sensitive or legal information when it is absent.
3. A factual answer may only be returned when supporting information exists
   in the supplied candidate context.
4. When the fact does not exist anywhere, return an empty string.
5. Use evidenceSource "none" when no supporting information exists.
6. Use evidenceSource "generated" only for open-ended narrative questions,
   such as motivation, experience summaries or why the candidate is suitable.
7. Generated narrative answers must use only facts from the supplied profile,
   documents and job context.
8. For profile evidence, evidenceKey must be a real path such as:
   contactInfo.email
   personalInfo.firstName
   workHistory.0.company
9. For application-memory evidence, evidenceKey must be the exact memory key,
   such as authorizedToWorkCanada or salaryMinimum.
10. For resume, CQFO or cover-letter evidence, evidenceQuote must contain a
    short exact supporting phrase copied from that document.
11. For radio, checkbox and select fields, first determine the supported meaning
    from the candidate evidence, then compare that meaning with every supplied
    option. Return the complete exact wording of the single supplied option that
    represents the same meaning. For checkbox groups and multi-select fields,
    return an array containing only complete supplied option strings.
12. Wording does not need to match the evidence literally, but meaning and
    polarity must match. For example, evidence "Yes" may map to a longer
    supplied affirmative option, and "BEng" may map to "Bachelor of
    Engineering". Never map agree to do-not-agree, yes to no, or select a merely
    related option. If more than one option is plausible, return an empty value
    and require review.
13. Country-specific questions must use country-specific evidence.
14. Do not apply Canadian work-authorisation or sponsorship answers to a
    United States-specific question.
15. Do not apply United States answers to a Canada-specific question.
16. For an unknown country, leave country-specific answers empty unless an
    exact matching fact exists.
17. Preserve factual numbers, dates, names, phone numbers and identifiers.
18. Treat validity.valid=false or validity.ariaInvalid=true as evidence that
    the current page value cannot simply be preserved. Return an evidence-backed
    corrected value or an empty value requiring review.
19. Return raw JSON only.

EXAMPLES:

- A completed first-name field that matches personalInfo.firstName must be
  returned unchanged.
- A completed phone, URL, date or other field that is marked invalid must be
  returned in a supported valid form when the underlying fact is available.
- A completed field containing a deterministic value that conflicts with the
  structured profile must be returned with the profile-supported correction.
- A missed full-name field may be answered from personalInfo.
- A missed email field may be answered from contactInfo.email.
- A missed Canada authorisation field may use authorizedToWorkCanada.
- A missed "Why are you interested?" field may use generated text.
- A missed taxpayer, licence or government identifier must remain empty when
  that identifier is not found anywhere.
`.trim();

  const userPrompt = JSON.stringify({
    instruction:
      'Audit every field and return its supported correct value, whether the field is empty or already completed.',
    jobContext,
    candidateContext,
    fields
  });

  // Respect LLM_PROVIDER like every other entry point. This previously called
  // Hugging Face unconditionally, so an ollama-configured install (the
  // default) failed with a missing-HF-key error on every Agent 2 run.
  const provider = getProvider();

  if (provider === 'ollama') {
    return await makeOllamaRequest({
      task: 'writing',
      systemPrompt,
      userPrompt,
      temperature: 0.1
    });
  }

  if (!['huggingface', 'hugging-face', 'hf'].includes(provider)) {
    throw new Error(
      `Unsupported LLM provider for form answers: "${provider}". ` +
      'Set LLM_PROVIDER=huggingface (with HF_API_KEY) or LLM_PROVIDER=ollama.'
    );
  }

  const requestAnswers = (modelOverride) => makeHuggingFaceRequest({
    task: 'writing',
    systemPrompt,
    userPrompt,
    temperature: 0.1,
    ...(modelOverride ? { modelOverride } : {}),
    maxTokensOverride: getPositiveInteger(process.env.HF_WRITING_MAX_TOKENS, 4000),
    reasoningEffortOverride: process.env.HF_WRITING_REASONING || 'medium',
    responseSchema: FORM_ANSWER_RESPONSE_SCHEMA,
    schemaName: 'job_application_answers'
  });

  try {
    // No modelOverride: getHuggingFaceModel('writing') applies the configured
    // HF_WRITING_PROVIDER/HF_PROVIDER routing suffix, which the old inline
    // env-var chain bypassed.
    return await requestAnswers();
  } catch (error) {
    const writingModel = getHuggingFaceModel('writing');
    const extractionModel = getHuggingFaceModel('extraction');

    if (writingModel !== extractionModel && isUnsupportedModelError(error)) {
      console.warn(
        `Writing model "${writingModel}" unavailable for form answers. ` +
        `Falling back to "${extractionModel}".`
      );
      return await requestAnswers(extractionModel);
    }

    throw error;
  }
};
