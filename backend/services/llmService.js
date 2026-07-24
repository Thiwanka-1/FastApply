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

const CQFO_VISUAL_TEMPLATE = {
  personalInfo: {
    firstName: '',
    lastName: '',
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
  },

  applicationMemory: {
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

const extractFirstJSONObject = (text) => {
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
        return text.slice(start, index + 1);
      }
    }
  }

  return null;
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

  ['```json', '```JSON', '```javascript', '```js', '```'].forEach(marker => {
    text = text.split(marker).join('');
  });

  text = text.trim();

  try {
    return JSON.parse(text);
  } catch {
    const jsonText = extractFirstJSONObject(text);

    if (!jsonText) {
      throw new Error(`AI did not return valid JSON. Response: ${text.slice(0, 300)}`);
    }

    try {
      return JSON.parse(jsonText);
    } catch (error) {
      throw new Error(`AI returned malformed JSON: ${error.message}`);
    }
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

  const prompts = buildCqfoVisionPrompts(cqfoText, cqfoImages);

  const configuredModel = getHuggingFaceVisionModel();

  const candidateModels = [
    configuredModel,
    'zai-org/GLM-4.5V:novita',
    'zai-org/GLM-4.5V:zai-org'
  ].filter((model, index, models) => models.indexOf(model) === index);

  let lastError;

  for (const model of candidateModels) {
    try {
      console.log(`Trying CQFO vision model: ${model}`);

      return await makeHuggingFaceRequest({
        task: 'extraction',
        ...prompts,
        modelOverride: model,
        maxTokensOverride: getPositiveInteger(
          process.env.HF_VISION_MAX_TOKENS,
          8000
        ),
        reasoningEffortOverride: process.env.HF_VISION_REASONING || 'low',
        temperature: 0,
        responseSchema: null,
        schemaName: 'cqfo_visual'
      });
    } catch (error) {
      lastError = error;

      if (!isUnsupportedModelError(error)) {
        throw error;
      }

      console.warn(`Vision model unavailable: ${model}`);
    }
  }

  throw new Error(
    `No configured Hugging Face vision model is available. ` +
    `Enable Novita or Z.ai in Hugging Face Inference Providers. ` +
    `Last error: ${lastError?.message || 'Unknown error'}`
  );
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

const buildAnswerPrompts = ({ candidateContext, jobContext, fields }) => {
  const outputTemplate = {
    answers: fields.map(field => ({
      fieldId: field.fieldId,
      value: '',
      source: 'unknown',
      confidence: 0,
      requiresReview: true
    }))
  };

  const systemPrompt = `
You are Agent 2, a job-application completion assistant.

Use the candidate profile, reusable application memory, document evidence and
job context to answer unresolved application fields.

ANSWER PRIORITY:

1. Use an exact structured-profile value when available.
2. Use an exact application-memory answer when available.
3. Use explicit document evidence when available.
4. Generate a customized answer only for open-ended writing questions.
5. Return an empty value when the answer cannot be supported.

FIELD RULES:

1. For text and textarea fields, return a string.
2. For select and radio fields, return exactly one supplied option.
3. For checkbox groups and multi-select fields, return an array of exact options.
4. For a single checkbox, return true or false only when supported.
5. Never return an option that is not listed in the field's options.
6. Do not change a field that already has a currentValue.
7. Do not invent dates, employers, degrees, skills, salaries or certifications.
8. Do not guess EEO, disability, veteran, legal, criminal-history, citizenship,
   work-authorization, visa or sponsorship answers.
9. Sensitive factual fields must come from stored profile data, application
   memory or explicit document evidence.
10. Questions such as "Why do you want to work here?" must use the supplied
    job context and the candidate's real experience.
11. Keep normal custom answers below 120 words unless the field specifies
    another limit.
12. Return raw JSON only.
13. For work authorization, visa and sponsorship questions, identify the
    country of the job before answering.

14. Prefer country-specific application-memory keys such as:
    authorizedToWorkUSA,
    authorizedToWorkCanada,
    requiresCanadaSponsorship,
    and canadaWorkAuthorizationDetails.

15. Never use a United States work-authorization answer for a Canadian job,
    or a Canadian sponsorship answer for a United States job.

16. When the job country cannot be determined, return an empty answer and set
    requiresReview to true for country-specific authorization questions.

SOURCE VALUES:

- "profile"
- "applicationMemory"
- "documents"
- "generated"
- "unknown"

CONFIDENCE:

- 0.95 to 1.00: exact stored answer
- 0.80 to 0.94: strongly supported by documents
- 0.65 to 0.79: generated from relevant evidence
- below 0.65: requires human review

Set requiresReview to true for unknown answers, low-confidence answers and
sensitive answers that are not exact stored matches.
`.trim();

  const userPrompt = `
JOB CONTEXT:
${JSON.stringify(jobContext)}

UNRESOLVED APPLICATION FIELDS:
${JSON.stringify(fields)}

CANDIDATE CONTEXT:
${JSON.stringify(candidateContext)}

RETURN THIS STRUCTURE:
${JSON.stringify(outputTemplate)}
`.trim();

  return { systemPrompt, userPrompt };
};

const buildCqfoVisionPrompts = (cqfoText, cqfoImages) => {
  const systemPrompt = `
You are Agent 1B, a visual CQFO extraction system.

The CQFO uses GREEN HIGHLIGHTING to show selected answers. Inspect every page
image carefully. The page images are the source of truth for selected options.
The extracted text contains all available options and does not preserve color.

RULES:

1. Extract every typed value and every green-highlighted selection.
2. Never choose Yes or No based only on option order.
3. Never guess an option that is not visibly selected.
4. Preserve exact names, phone numbers, dates and selected options.
5. Return raw JSON only.
6. Do not include explanations.
7. Use "United States" instead of "USA" for the address country.
8. Languages entered under the fluency question must have fluent set to true.
9. Convert a percentage GPA to the 4.0 scale by multiplying by 0.04.
10. For 72%, return gpa "2.88" and gpaScale "4.0".

EEO NORMALIZATION:

- authorizedToWork must be "Yes", "No" or "".
- requireVisaNow must be "Yes", "No" or "".
- requireVisaFuture must be "Yes", "No" or "".
- disability must be:
  "Yes, I have a disability",
  "No, I don't have a disability",
  or "".
- veteran must be:
  "I am a protected veteran",
  "I am not a protected veteran",
  or "".

APPLICATION MEMORY:

Create one atomic answer per reusable field. Do not combine multiple reference
or certification properties into one answer.

Include all supported fields, including:

- telephoneAccessible24Hours
- dateOfBirth
- stopApplicationIfDobRequired
- race
- travelPercentage
- travelFlexibility
- willingToRelocate
- eveningsWeekendsAvailable
- nationality
- additionalNationalities
- otherCitizenshipOrResidency
- canadaWorkAuthorizationDetails
- salaryMinimum
- salaryMaximum
- salaryCurrency
- salaryNegotiationNotes
- sponsorshipRequired
- sponsorshipDetails
- governmentEmployment
- employmentAgreement
- criminalHistory
- interviewAvailability

For each reference, create separate entries such as:

- reference1FullName
- reference1Relationship
- reference1Company
- reference1JobTitle
- reference1Phone
- reference1Email

Do the same for reference2 and reference3.

For each certification, create separate entries such as:

- certification1Name
- certification1Issuer
- certification1DateAchieved
- certification1ExpirationDate

For work authorization, citizenship and sponsorship, always create separate
atomic entries. Never combine them into one answer.

Use these keys when supported:

- authorizedToWorkUSA
- authorizedToWorkCanada
- requiresCanadaSponsorship
- canadaWorkAuthorizationDetails
- otherCitizenshipOrResidency
- sponsorshipRequired
- sponsorshipDetails

The answer for otherCitizenshipOrResidency must contain only "Yes" or "No".
Do not append work-authorization or sponsorship details to it.

When the form asks for languages other than English and lists languages,
include English as a fluent language unless the document explicitly says the
candidate is not fluent in English.

For eeo.veteran use only:

- "I am a protected veteran"
- "I am not a protected veteran"
- ""

Preserve the exact original veteran selection separately in applicationMemory
using the key veteranStatusOriginal.

Mark salary, date of birth, EEO, nationality, citizenship, authorization,
sponsorship, references and legal answers as sensitive.

Every application-memory answer must use source "cqfo".
Use answerType "text".
Do not create empty answer entries.
`.trim();

  const userPrompt = `
CQFO TEXT FOR REFERENCE:

${cqfoText.slice(0, 30000)}

RETURN THIS STRUCTURE:

${JSON.stringify(CQFO_VISUAL_TEMPLATE)}
`.trim();

  const userContent = [
    { type: 'text', text: userPrompt },
    ...cqfoImages.map(image => ({
      type: 'image_url',
      image_url: { url: image.dataUrl }
    }))
  ];

  return {
    systemPrompt,
    userPrompt,
    userContent
  };
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

const makeHuggingFaceRequest = async ({
  task,
  systemPrompt,
  userPrompt,
  userContent,
  temperature,
  modelOverride,
  maxTokensOverride,
  reasoningEffortOverride,
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
    reasoning_effort: reasoningEffort,
    stream: false
  };

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

  const sendRequest = async (responseFormat) => {
    const requestBody = responseFormat
      ? { ...payload, response_format: responseFormat }
      : payload;

    return await axios.post(endpoint, requestBody, config);
  };

  let response;

  try {
    try {
      response = await sendRequest(schemaFormat);
    } catch (error) {
      if (!responseFormatIsUnsupported(error)) throw error;

      console.warn(`Structured output unavailable for "${model}". Retrying with JSON mode.`);

      try {
        response = await sendRequest({ type: 'json_object' });
      } catch (jsonError) {
        if (!responseFormatIsUnsupported(jsonError)) throw jsonError;

        console.warn(`JSON mode unavailable for "${model}". Retrying without response_format.`);
        response = await sendRequest(null);
      }
    }
  } catch (error) {
    throw createHuggingFaceError(error, model);
  }

  const content = getGeneratedContent(response);
  const finishReason = response.data?.choices?.[0]?.finish_reason;

  if (!content) {
    throw new Error(
      `Hugging Face returned an unexpected response: ${JSON.stringify(response.data)}`
    );
  }

  try {
    const parsed = sanitizeLLMOutput(content);

    if (finishReason === 'length') {
      console.warn(
        `Hugging Face reached ${maxTokens} tokens for "${schemaName}", ` +
        `but returned valid JSON.`
      );
    }

    return parsed;
  } catch (error) {
    if (finishReason === 'length') {
      throw new Error(
        `Hugging Face returned incomplete JSON for "${schemaName}" ` +
        `after reaching ${maxTokens} tokens.`
      );
    }

    throw error;
  }
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

const callHuggingFaceForAnswers = async (prompts) => {
  try {
    return await makeHuggingFaceRequest({
      task: 'writing',
      ...prompts,
      temperature: 0.3
    });
  } catch (error) {
    const writingModel = getHuggingFaceModel('writing');
    const extractionModel = getHuggingFaceModel('extraction');

    if (
      writingModel !== extractionModel &&
      error.message.includes('not supported by an enabled provider')
    ) {
      console.warn(`Writing model "${writingModel}" unavailable. Falling back to "${extractionModel}".`);

      return makeHuggingFaceRequest({
        task: 'writing',
        ...prompts,
        temperature: 0.3,
        modelOverride: extractionModel
      });
    }

    throw error;
  }
};

export const generateFormAnswers = async ({ candidateContext, jobContext, fields }) => {
  if (!candidateContext || typeof candidateContext !== 'object') {
    throw new Error('generateFormAnswers requires candidateContext.');
  }

  if (!jobContext || typeof jobContext !== 'object') {
    throw new Error('generateFormAnswers requires jobContext.');
  }

  if (!Array.isArray(fields) || fields.length === 0) {
    throw new Error('generateFormAnswers requires unresolved fields.');
  }

  const prompts = buildAnswerPrompts({ candidateContext, jobContext, fields });
  const provider = getProvider();

  if (provider === 'ollama') {
    return makeOllamaRequest({
      task: 'writing',
      ...prompts,
      temperature: 0.25
    });
  }

  if (['huggingface', 'hugging-face', 'hf'].includes(provider)) {
    return callHuggingFaceForAnswers(prompts);
  }

  throw new Error(`Unsupported LLM provider: "${provider}".`);
};