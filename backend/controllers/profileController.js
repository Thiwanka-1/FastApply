import Profile from '../models/Profile.js';
import { storage } from '../config/firebase.js';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { extractProfileData, generateFormAnswers } from '../services/llmService.js';
import Application from '../models/Application.js';
import AIUsageLog from '../models/AIUsageLog.js';

// import { createRequire } from 'module';
// const require = createRequire(import.meta.url);
// const pdfParse = require('pdf-parse');

const extractPdfDocument = async (buffer, includePageImages = false) => {
  const parser = new PDFParse({ data: buffer });

  try {
    const textResult = await parser.getText();
    let pageImages = [];

    if (includePageImages) {
      const imageResult = await parser.getScreenshot({
        desiredWidth: 1000,
        imageDataUrl: false,
        imageBuffer: true
      });

      pageImages = imageResult.pages.map((page, index) => ({
        pageNumber: index + 1,
        dataUrl: `data:image/png;base64,${Buffer.from(page.data).toString('base64')}`
      }));
    }

    return {
      text: textResult.text || '',
      pageImages
    };
  } finally {
    await parser.destroy();
  }
};

const DOCUMENT_LABELS = {
  resume: 'RESUME',
  cqfo: 'QUESTIONNAIRE',
  coverLetter: 'COVER LETTER'
};

const cleanFileName = (fileName) => {
  return fileName.replace(/[^a-zA-Z0-9._() -]/g, '_');
};

const detectDocumentType = (fileName) => {
  const name = fileName.toLowerCase();

  if (name.includes('cover') || name.includes('letter')) {
    return 'coverLetter';
  }

  if (
    name.includes('cqfo') ||
    name.includes('questionnaire') ||
    name.includes('common question')
  ) {
    return 'cqfo';
  }

  return 'resume';
};

const getUploadedDocumentFiles = (req) => {
  const files = {
    resume: req.files?.resume?.[0] || null,
    cqfo: req.files?.cqfo?.[0] || null,
    coverLetter: req.files?.coverLetter?.[0] || null
  };

  const legacyFiles = req.files?.documents || [];

  for (const file of legacyFiles) {
    const type = detectDocumentType(file.originalname);

    if (!files[type]) {
      files[type] = file;
    }
  }

  return files;
};

const extractDocumentContent = async (file, includePageImages = false) => {
  if (file.mimetype === 'application/pdf') {
    return await extractPdfDocument(file.buffer, includePageImages);
  }

  if (
    file.mimetype ===
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const result = await mammoth.extractRawText({ buffer: file.buffer });

    return {
      text: result.value || '',
      pageImages: []
    };
  }

  throw new Error(`Unsupported document type: ${file.mimetype}`);
};

const uploadDocumentToFirebase = async (userId, type, file, rawText) => {
  const safeName = cleanFileName(file.originalname);
  const storagePath = `user_documents/${userId}/${type}/${Date.now()}_${safeName}`;
  const storageRef = ref(storage, storagePath);

  const snapshot = await uploadBytesResumable(storageRef, file.buffer, {
    contentType: file.mimetype
  });

  const fileUrl = await getDownloadURL(snapshot.ref);

  return {
    fileName: file.originalname,
    fileUrl,
    storagePath,
    rawText,
    mimeType: file.mimetype,
    uploadedAt: new Date()
  };
};

const deleteFirebaseFile = async (storagePathOrUrl) => {
  if (!storagePathOrUrl) return;

  try {
    const fileRef = ref(storage, storagePathOrUrl);
    await deleteObject(fileRef);
  } catch (error) {
    console.warn(`Could not delete Firebase file: ${error.message}`);
  }
};

const getOldDocumentReference = (document) => {
  return document?.storagePath || document?.fileUrl || '';
};


const cleanText = (value) => {
  return typeof value === 'string' ? value.trim() : '';
};

const normalizeHttpUrl = value => {
  const raw = cleanText(value);
  if (!raw || /^(javascript|data|mailto):/i.test(raw)) return '';

  try {
    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw.replace(/^\/+/, '')}`;
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname.includes('.')) {
      return '';
    }
    return parsed.toString();
  } catch (_) {
    return '';
  }
};

const cleanWebsitesAndSkills = data => {
  const input = data && typeof data === 'object' ? data : {};
  return {
    linkedin: normalizeHttpUrl(input.linkedin),
    github: normalizeHttpUrl(input.github),
    twitter: normalizeHttpUrl(input.twitter),
    portfolio: normalizeHttpUrl(input.portfolio),
    skills: cleanStringArray(input.skills)
  };
};

const cleanStringArray = (values) => {
  if (!Array.isArray(values)) return [];

  return [...new Set(
    values
      .filter(value => typeof value === 'string')
      .map(value => value.trim())
      .filter(Boolean)
  )];
};

const cleanLanguages = (languages) => {
  if (!Array.isArray(languages)) return [];

  return languages
    .map(item => ({
      language: cleanText(item?.language),
      proficiency: cleanText(item?.proficiency),
      fluent: item?.fluent === true
    }))
    .filter(item => item.language);
};

const cleanWorkHistory = (history) => {
  if (!Array.isArray(history)) return [];

  return history
    .map(item => ({
      jobTitle: cleanText(item?.jobTitle),
      company: cleanText(item?.company),
      location: cleanText(item?.location),
      employmentType: cleanText(item?.employmentType),
      currentlyWorkHere: item?.currentlyWorkHere === true,
      startDate: cleanText(item?.startDate),
      endDate: cleanText(item?.endDate),
      description: cleanText(item?.description)
    }))
    .filter(item => item.jobTitle || item.company);
};

const cleanEducationHistory = (history) => {
  if (!Array.isArray(history)) return [];

  return history
  .map(item => {
    const { gpa, gpaScale } = normalizeGpaFields(item);

    return {
      school: cleanText(item?.school),
      institutionLocation: cleanText(item?.institutionLocation),
      degree: cleanText(item?.degree),
      major: cleanText(item?.major),
      minor: cleanText(item?.minor),
      gpa,
      gpaScale,
      startDate: cleanText(item?.startDate),
      endDate: cleanText(item?.endDate)
    };
  })
  .filter(item => item.school || item.degree);
};

const isSensitiveMemoryKey = (key) => {
  return /birth|gender|ethnicity|race|disability|veteran|nationality|citizen|visa|sponsor|salary|reference|government|agreement|criminal|legal|authorization/i.test(
    key
  );
};

const cleanApplicationMemory = (memory) => {
  if (!Array.isArray(memory?.answers)) {
    return {
      answers: [],
      lastExtractedAt: new Date()
    };
  }

  const usedKeys = new Set();

  const answers = memory.answers
    .map(item => ({
      key: cleanText(item?.key).replace(/\s+/g, ''),
      question: cleanText(item?.question),
      answer: item?.answer ?? '',
      answerType: ['text', 'boolean', 'number', 'array', 'object'].includes(item?.answerType)
        ? item.answerType
        : 'text',
      aliases: cleanStringArray(item?.aliases),
      source: ['resume', 'cqfo', 'coverLetter'].includes(item?.source)
        ? item.source
        : 'cqfo',
      sensitive: item?.sensitive === true || isSensitiveMemoryKey(item?.key || ''),
      confidence: Math.min(1, Math.max(0, Number(item?.confidence) || 0))
    }))
    .filter(item => {
      if (!item.key || !item.question || usedKeys.has(item.key)) return false;

      const hasAnswer = item.answer !== '' &&
        item.answer !== null &&
        item.answer !== undefined &&
        (!Array.isArray(item.answer) || item.answer.length > 0);

      if (!hasAnswer) return false;

      usedKeys.add(item.key);
      return true;
    });

  return {
    answers,
    lastExtractedAt: new Date()
  };
};

const normalizeExtractedProfile = (data = {}) => {
  return {
    personalInfo: {
      firstName: cleanText(data.personalInfo?.firstName),
      lastName: cleanText(data.personalInfo?.lastName),
      preferredName: cleanText(data.personalInfo?.preferredName),
      pronouns: cleanText(data.personalInfo?.pronouns),
      languages: cleanLanguages(data.personalInfo?.languages)
    },

    contactInfo: {
      email: cleanText(data.contactInfo?.email),
      phone: cleanText(data.contactInfo?.phone),
      addressLine1: cleanText(data.contactInfo?.addressLine1),
      addressLine2: cleanText(data.contactInfo?.addressLine2),
      city: cleanText(data.contactInfo?.city),
      state: cleanText(data.contactInfo?.state),
      country: normalizeCountry(data.contactInfo?.country),
      postalCode: cleanText(data.contactInfo?.postalCode)
    },

    websitesAndSkills: cleanWebsitesAndSkills(data.websitesAndSkills),

    workHistory: cleanWorkHistory(data.workHistory),
    educationHistory: cleanEducationHistory(data.educationHistory),

    eeo: {
      optOut: data.eeo?.optOut === true,
      authorizedToWork: normalizeYesNo(data.eeo?.authorizedToWork),
      requireVisaNow: normalizeYesNo(data.eeo?.requireVisaNow),
      requireVisaFuture: normalizeYesNo(data.eeo?.requireVisaFuture),
      disability: cleanText(data.eeo?.disability),
      veteran: cleanText(data.eeo?.veteran),
      gender: cleanText(data.eeo?.gender),
      ethnicity: cleanText(data.eeo?.ethnicity),
      race: cleanText(data.eeo?.race),
      age: cleanText(data.eeo?.age),
      willingToRelocate: normalizeYesNo(data.eeo?.willingToRelocate)
    },

    applicationMemory: cleanApplicationMemory(data.applicationMemory)
  };
};

const MEMORY_ALIASES = {
  telephoneAccessible24Hours: [
    '24 hour telephone access',
    'available by phone 24/7',
    'telephone accessibility'
  ],

  dateOfBirth: [
    'birth date',
    'birthday',
    'dob'
  ],

  race: [
    'racial background',
    'race category'
  ],

  travelPercentage: [
    'acceptable travel percentage',
    'travel requirement',
    'percentage willing to travel'
  ],

  travelFlexibility: [
    'willing to travel',
    'available for travel',
    'can you travel'
  ],

  willingToRelocate: [
    'open to relocation',
    'relocation preference',
    'are you willing to move'
  ],

  eveningsWeekendsAvailable: [
    'evening availability',
    'weekend availability',
    'flexible work schedule'
  ],

  nationality: [
    'country of nationality',
    'national origin'
  ],

  otherCitizenshipOrResidency: [
    'other citizenship',
    'permanent residency',
    'citizen of another country'
  ],

  authorizedToWorkUSA: [
    'authorized to work in the usa',
    'authorized to work in the united states',
    'us work authorization'
  ],

  authorizedToWorkCanada: [
    'authorized to work in canada',
    'canadian work authorization',
    'eligible to work in canada'
  ],

  requiresCanadaSponsorship: [
    'canada sponsorship required',
    'canadian work permit sponsorship',
    'require sponsorship in canada'
  ],

  canadaWorkAuthorizationDetails: [
    'canada visa details',
    'canadian work permit details',
    'canada authorization details'
  ],

  salaryMinimum: [
    'minimum salary expectation',
    'expected salary minimum',
    'minimum compensation'
  ],

  salaryMaximum: [
    'maximum salary expectation',
    'expected salary maximum',
    'maximum compensation'
  ],

  salaryCurrency: [
    'salary currency',
    'compensation currency'
  ],

  salaryNegotiationNotes: [
    'salary negotiation',
    'compensation notes',
    'salary flexibility'
  ],

  sponsorshipRequired: [
    'visa sponsorship required',
    'employment sponsorship',
    'immigration sponsorship'
  ],

  sponsorshipDetails: [
    'visa sponsorship details',
    'immigration details',
    'work permit details'
  ],

  governmentEmployment: [
    'government employee',
    'public sector employment',
    'employed by government'
  ],

  employmentAgreement: [
    'non compete agreement',
    'non solicitation agreement',
    'employment covenant'
  ],

  criminalHistory: [
    'criminal conviction',
    'criminal record',
    'felony or misdemeanor'
  ],

  interviewAvailability: [
    'available interview times',
    'interview schedule',
    'dates available to interview'
  ]
};

const NON_SENSITIVE_MEMORY_KEYS = new Set([
  'telephoneAccessible24Hours',
  'travelPercentage',
  'travelFlexibility',
  'willingToRelocate',
  'eveningsWeekendsAvailable',
  'interviewAvailability'
]);

const normalizeMemoryKey = (value) => {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]/g, '');
};

const camelCaseToWords = (value) => {
  return cleanText(value)
    .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
    .replace(/(\d)([A-Z])/g, '$1 $2')
    .toLowerCase();
};

const findMemoryAnswer = (answers, key) => {
  const wantedKey = normalizeMemoryKey(key);

  return answers.find(item => {
    return normalizeMemoryKey(item.key) === wantedKey;
  });
};

const upsertMemoryAnswer = (answers, newAnswer) => {
  const index = answers.findIndex(item => {
    return normalizeMemoryKey(item.key) === normalizeMemoryKey(newAnswer.key);
  });

  const normalizedAnswer = {
    key: newAnswer.key,
    question: newAnswer.question || camelCaseToWords(newAnswer.key),
    answer: newAnswer.answer,
    answerType: newAnswer.answerType || 'text',
    aliases: cleanStringArray(newAnswer.aliases),
    source: newAnswer.source || 'cqfo',
    sensitive: newAnswer.sensitive === true,
    confidence: Number.isFinite(Number(newAnswer.confidence))
      ? Number(newAnswer.confidence)
      : 1
  };

  if (index === -1) {
    answers.push(normalizedAnswer);
    return;
  }

  const existing = answers[index];

  answers[index] = {
    ...existing,
    ...normalizedAnswer,
    question: normalizedAnswer.question || existing.question,
    answer: normalizedAnswer.answer !== '' ? normalizedAnswer.answer : existing.answer,
    aliases: cleanStringArray([
      ...(existing.aliases || []),
      ...(normalizedAnswer.aliases || [])
    ])
  };
};

const ensureEnglishLanguage = (languages, documentText) => {
  const cleanedLanguages = Array.isArray(languages) ? [...languages] : [];

  const alreadyHasEnglish = cleanedLanguages.some(item => {
    return cleanText(item.language).toLowerCase() === 'english';
  });

  const documentsImplyEnglish = /languages?\s+(other than|besides)\s+english/i.test(
    documentText || ''
  );

  if (!alreadyHasEnglish && documentsImplyEnglish) {
    cleanedLanguages.unshift({
      language: 'English',
      proficiency: 'Fluent',
      fluent: true
    });
  }

  return cleanedLanguages;
};

const normalizeVeteranStatus = (value) => {
  const text = cleanText(value).toLowerCase();

  if (!text) {
    return { value: '', optOut: false };
  }

  if (
    text === 'no' ||
    text.includes('not a veteran') ||
    text.includes('not a protected veteran') ||
    text.includes('have not served')
  ) {
    return {
      value: 'I am not a protected veteran',
      optOut: false
    };
  }

  if (
    text === 'yes' ||
    text.includes('protected veteran') ||
    text.includes('one or more of the classifications')
  ) {
    return {
      value: 'I am a protected veteran',
      optOut: false
    };
  }

  if (
    text.includes('do not wish') ||
    text.includes('prefer not') ||
    text.includes('decline')
  ) {
    return {
      value: '',
      optOut: true
    };
  }

  return {
    value: cleanText(value),
    optOut: false
  };
};
const normalizeInterviewTime = (value) => {
  let text = cleanText(value);

  text = text.replace(/\b(\d{1,2})\.(\d{2})\b/g, '$1:$2');
  text = text.replace(/\b(am|pm)\b/gi, match => match.toUpperCase());

  text = text.replace(
    /(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/gi,
    (match, startHour, startMinute, startPeriod, endHour, endMinute, endPeriod) => {
      let fixedEndPeriod = endPeriod.toUpperCase();

      if (
        startPeriod.toUpperCase() === 'PM' &&
        fixedEndPeriod === 'AM' &&
        Number(startHour) === 12 &&
        Number(endHour) >= 1 &&
        Number(endHour) <= 7
      ) {
        fixedEndPeriod = 'PM';
      }

      const start = `${Number(startHour)}:${startMinute || '00'} ${startPeriod.toUpperCase()}`;
      const end = `${Number(endHour)}:${endMinute || '00'} ${fixedEndPeriod}`;

      return `${start}-${end}`;
    }
  );

  return text;
};

const correctEmploymentTypes = (history) => {
  if (!Array.isArray(history)) return [];

  return history.map(item => {
    const roleText = [
      item.company,
      item.jobTitle,
      item.description
    ].join(' ').toLowerCase();

    const isIndependentWork =
      /\bindependent\b/.test(roleText) ||
      /\bself[- ]employed\b/.test(roleText) ||
      /\bfreelance\b/.test(roleText) ||
      /\bconsulting\b/.test(roleText) ||
      /\bconsultant\b/.test(roleText) ||
      /\bfounder\b/.test(roleText) ||
      /\bowner\b/.test(roleText);

    if (isIndependentWork) {
      return {
        ...item,
        employmentType: 'Self-employed'
      };
    }

    return item;
  });
};

const addMemoryAliases = (answers) => {
  return answers.map(item => {
    const aliases = [
      ...(item.aliases || []),
      ...(MEMORY_ALIASES[item.key] || []),
      camelCaseToWords(item.key)
    ];

    const referenceMatch = item.key.match(/^reference(\d+)(.+)$/i);

    if (referenceMatch) {
      const referenceNumber = referenceMatch[1];
      const fieldName = camelCaseToWords(referenceMatch[2]);

      aliases.push(
        `reference ${referenceNumber} ${fieldName}`,
        `professional reference ${referenceNumber} ${fieldName}`,
        `referee ${referenceNumber} ${fieldName}`
      );
    }

    const certificationMatch = item.key.match(/^certification(\d+)(.+)$/i);

    if (certificationMatch) {
      const certificationNumber = certificationMatch[1];
      const fieldName = camelCaseToWords(certificationMatch[2]);

      aliases.push(
        `certification ${certificationNumber} ${fieldName}`,
        `license ${certificationNumber} ${fieldName}`
      );
    }

    return {
      ...item,
      sensitive: NON_SENSITIVE_MEMORY_KEYS.has(item.key)
        ? false
        : item.sensitive === true,
      aliases: cleanStringArray(aliases).slice(0, 10)
    };
  });
};

const enrichAuthorizationMemory = (profileData, documentText) => {
  const answers = [...(profileData.applicationMemory?.answers || [])];

  const authorizedToWork = normalizeYesNo(profileData.eeo?.authorizedToWork);
  const combinedCitizenship = findMemoryAnswer(answers, 'otherCitizenshipOrResidency');
  const sponsorshipDetails = findMemoryAnswer(answers, 'sponsorshipDetails');

  const combinedAnswer = cleanText(combinedCitizenship?.answer);
  const detailsAnswer = cleanText(sponsorshipDetails?.answer);

  const evidenceText = [
    combinedAnswer,
    detailsAnswer,
    documentText || ''
  ].join(' ');

  if (
    authorizedToWork &&
    /legally authorized to work in the (usa|united states)/i.test(documentText || '')
  ) {
    upsertMemoryAnswer(answers, {
      key: 'authorizedToWorkUSA',
      question: 'Are you legally authorized to work in the United States?',
      answer: authorizedToWork,
      aliases: MEMORY_ALIASES.authorizedToWorkUSA,
      source: 'cqfo',
      sensitive: true,
      confidence: 1
    });
  }

  const lacksCanadaAuthorization =
  /\b(?:no|do not have(?: any)?)\s+(?:valid\s+)?(?:canada|canadian)\s+work authorization\b/i.test(
    evidenceText
  ) ||
  /\bno\s+work authorization\s+for\s+canada\b/i.test(
    evidenceText
  );

if (lacksCanadaAuthorization) {
  upsertMemoryAnswer(answers, {
    key: 'authorizedToWorkCanada',
    question: 'Are you legally authorized to work in Canada?',
    answer: 'No',
    aliases: MEMORY_ALIASES.authorizedToWorkCanada,
    source: 'cqfo',
    sensitive: true,
    confidence: 1
  });
}

  if (
    /sponsorship from employer|work permit sponsorship|need.*sponsorship/i.test(
      evidenceText
    )
  ) {
    upsertMemoryAnswer(answers, {
      key: 'requiresCanadaSponsorship',
      question: 'Will you require employer sponsorship to work in Canada?',
      answer: 'Yes',
      aliases: MEMORY_ALIASES.requiresCanadaSponsorship,
      source: 'cqfo',
      sensitive: true,
      confidence: 1
    });
  }

  let canadaDetails = detailsAnswer;

  if (!canadaDetails && combinedAnswer.includes('-')) {
    canadaDetails = combinedAnswer.split('-').slice(1).join('-').trim();
  }

  if (canadaDetails && /canada|work permit|sponsorship/i.test(canadaDetails)) {
    upsertMemoryAnswer(answers, {
      key: 'canadaWorkAuthorizationDetails',
      question: 'Canada work authorization details',
      answer: canadaDetails,
      aliases: MEMORY_ALIASES.canadaWorkAuthorizationDetails,
      source: 'cqfo',
      sensitive: true,
      confidence: 1
    });
  }

  if (combinedCitizenship && /^(yes|no)\b/i.test(combinedAnswer)) {
    combinedCitizenship.answer = combinedAnswer.match(/^(yes|no)\b/i)[1]
      .replace(/^./, letter => letter.toUpperCase());
  }

  return answers;
};

const postProcessExtractedProfile = (profileData, documents) => {
  const cqfoText = documents?.cqfo || '';

  profileData.personalInfo.languages = ensureEnglishLanguage(
    profileData.personalInfo.languages,
    cqfoText
  );

  profileData.eeo.disability = normalizeDisabilityStatus(
    profileData.eeo.disability
  );

  profileData.eeo.age = cleanAgeValue(profileData.eeo.age);

  let answers = canonicalizeApplicationMemory(
    profileData,
    cqfoText
  );

  const storedVeteranAnswer = findMemoryAnswer(
    answers,
    'veteranStatusOriginal'
  );

  const originalVeteranValue =
    cleanText(profileData.eeo.veteran) ||
    cleanText(storedVeteranAnswer?.answer);

  const normalizedVeteran = normalizeVeteranStatus(
    originalVeteranValue
  );

  profileData.eeo.veteran = normalizedVeteran.value;

  if (normalizedVeteran.optOut) {
    profileData.eeo.optOut = true;
  }

  if (originalVeteranValue) {
    upsertMemoryAnswer(answers, {
      key: 'veteranStatusOriginal',
      question: 'Veteran status',
      answer: originalVeteranValue,
      aliases: [
        'military service status',
        'veteran classification',
        'protected veteran status'
      ],
      source: 'cqfo',
      sensitive: true,
      confidence: 1
    });
  }

  if (profileData.eeo.race) {
    upsertMemoryAnswer(answers, {
      key: 'race',
      question: 'Race',
      answer: profileData.eeo.race,
      aliases: MEMORY_ALIASES.race,
      source: 'cqfo',
      sensitive: true,
      confidence: 1
    });
  }

  // Relocation lives both as a first-class profile field (editable on the
  // dashboard) and as reusable application memory. Keep the two in sync so
  // whichever side has the answer feeds the autofill engines.
  const relocateAnswer = findMemoryAnswer(answers, 'willingToRelocate');

  if (relocateAnswer && !cleanText(profileData.eeo.willingToRelocate)) {
    profileData.eeo.willingToRelocate = cleanText(relocateAnswer.answer);
  }

  if (!relocateAnswer && cleanText(profileData.eeo.willingToRelocate)) {
    upsertMemoryAnswer(answers, {
      key: 'willingToRelocate',
      question: 'Are you willing to relocate?',
      answer: cleanText(profileData.eeo.willingToRelocate),
      aliases: MEMORY_ALIASES.willingToRelocate,
      source: 'cqfo',
      sensitive: false,
      confidence: 1
    });
  }

  const interviewAvailability = findMemoryAnswer(
    answers,
    'interviewAvailability'
  );

  if (interviewAvailability) {
    interviewAvailability.answer = normalizeInterviewTime(
      interviewAvailability.answer
    );
  }

  profileData.workHistory = correctEmploymentTypes(
    profileData.workHistory
  );

  profileData.educationHistory = refineEducationHistory(
    profileData.educationHistory,
    documents
  );

  profileData.applicationMemory = {
    ...profileData.applicationMemory,
    answers: addMemoryAliases(answers)
  };

  return profileData;
};

const MEMORY_KEY_MAP = {
  telephoneAvailability: 'telephoneAccessible24Hours',
  discontinueIfDobMandated: 'stopApplicationIfDobRequired',
  relocationStatus: 'willingToRelocate',
  workTimeAvailability: 'eveningsWeekendsAvailable',
  citizenshipStatus: 'otherCitizenshipOrResidency',
  citizenshipDetails: 'canadaWorkAuthorizationDetails',
  salaryNotes: 'salaryNegotiationNotes',
  governmentEmploymentUSA: 'governmentEmployment',
  employmentAgreements: 'employmentAgreement'
};

const DEGREE_REFINEMENTS = [
  { pattern: /\bBachelor of Engineering\b/i, value: 'Bachelor of Engineering' },
  { pattern: /\bBachelor of Technology\b/i, value: 'Bachelor of Technology' },
  { pattern: /\bBachelor of Science\b/i, value: 'Bachelor of Science' },
  { pattern: /\bBachelor of Arts\b/i, value: 'Bachelor of Arts' },
  { pattern: /\bMaster of Engineering\b/i, value: 'Master of Engineering' },
  { pattern: /\bMaster of Science\b/i, value: 'Master of Science' },
  { pattern: /\bMaster of Arts\b/i, value: 'Master of Arts' },
  { pattern: /\bMaster of Business Administration\b/i, value: 'Master of Business Administration' },
  { pattern: /\bDoctor of Philosophy\b/i, value: 'Doctor of Philosophy' }
];

const normalizeDisabilityStatus = (value) => {
  const text = cleanText(value).toLowerCase();

  if (!text) return '';
  if (text === 'no' || text.includes("don't have") || text.includes('do not have')) {
    return "No, I don't have a disability";
  }

  if (text === 'yes' || text.includes('have a disability')) {
    return 'Yes, I have a disability';
  }

  return cleanText(value);
};

const cleanAgeValue = (value) => {
  const text = cleanText(value);

  if (
    /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(text) ||
    /^\d{4}-\d{1,2}-\d{1,2}$/.test(text)
  ) {
    return '';
  }

  return /^\d{1,3}$/.test(text) ? text : '';
};

const parseSalaryRange = (value) => {
  const text = cleanText(value);
  const match = text.match(
    /([\d,]+(?:\.\d+)?)\s*(?:-|to)\s*([\d,]+(?:\.\d+)?)\s*([A-Za-z]{3})?/i
  );

  if (!match) return null;

  return {
    minimum: match[1].replace(/,/g, ''),
    maximum: match[2].replace(/,/g, ''),
    currency: cleanText(match[3]).toUpperCase()
  };
};

const refineEducationHistory = (history, documents) => {
  if (!Array.isArray(history)) return [];

  const documentText = [
    documents?.resume || '',
    documents?.cqfo || '',
    documents?.coverLetter || ''
  ].join('\n');

  return history.map(item => {
    let degree = cleanText(item.degree);

    if (/^(bachelor|master|associate|doctor)(?:'s)? degree$/i.test(degree)) {
      const refinement = DEGREE_REFINEMENTS.find(entry => {
        return entry.pattern.test(documentText);
      });

      if (refinement) degree = refinement.value;
    }

    return {
      ...item,
      degree
    };
  });
};

const canonicalizeApplicationMemory = (profileData, cqfoText) => {
  const enrichedAnswers = enrichAuthorizationMemory(profileData, cqfoText);

  // Legacy keys are processed first. Canonical keys then replace them.
  const orderedAnswers = [...enrichedAnswers].sort((first, second) => {
    const firstLegacy = MEMORY_KEY_MAP[first.key] ? 0 : 1;
    const secondLegacy = MEMORY_KEY_MAP[second.key] ? 0 : 1;
    return firstLegacy - secondLegacy;
  });

  const canonicalAnswers = [];

  orderedAnswers.forEach(item => {
    if (!item?.key) return;

    if (item.key === 'salaryRange') {
      const range = parseSalaryRange(item.answer);

      if (range) {
        upsertMemoryAnswer(canonicalAnswers, {
          key: 'salaryMinimum',
          question: 'Minimum expected annual base salary',
          answer: range.minimum,
          source: 'cqfo',
          sensitive: true,
          confidence: item.confidence || 1
        });

        upsertMemoryAnswer(canonicalAnswers, {
          key: 'salaryMaximum',
          question: 'Maximum expected annual base salary',
          answer: range.maximum,
          source: 'cqfo',
          sensitive: true,
          confidence: item.confidence || 1
        });

        if (range.currency) {
          upsertMemoryAnswer(canonicalAnswers, {
            key: 'salaryCurrency',
            question: 'Expected salary currency',
            answer: range.currency,
            source: 'cqfo',
            sensitive: true,
            confidence: item.confidence || 1
          });
        }
      }

      return;
    }

    const canonicalKey = MEMORY_KEY_MAP[item.key] || item.key;
    let answer = item.answer;

    if (
      canonicalKey === 'otherCitizenshipOrResidency' ||
      canonicalKey === 'authorizedToWorkUSA' ||
      canonicalKey === 'authorizedToWorkCanada' ||
      canonicalKey === 'requiresCanadaSponsorship' ||
      canonicalKey === 'sponsorshipRequired'
    ) {
      answer = normalizeYesNo(answer);
    }

    upsertMemoryAnswer(canonicalAnswers, {
      ...item,
      key: canonicalKey,
      answer
    });
  });

  const canadaDetails =
    cleanText(findMemoryAnswer(canonicalAnswers, 'canadaWorkAuthorizationDetails')?.answer) ||
    cleanText(findMemoryAnswer(canonicalAnswers, 'sponsorshipDetails')?.answer);

  if (/do not have.*canada work authorization|no work authorization.*canada/i.test(canadaDetails)) {
    upsertMemoryAnswer(canonicalAnswers, {
      key: 'authorizedToWorkCanada',
      question: 'Are you legally authorized to work in Canada?',
      answer: 'No',
      source: 'cqfo',
      sensitive: true,
      confidence: 1
    });
  }

  if (/sponsorship|work permit/i.test(canadaDetails)) {
    upsertMemoryAnswer(canonicalAnswers, {
      key: 'requiresCanadaSponsorship',
      question: 'Will you require employer sponsorship to work in Canada?',
      answer: 'Yes',
      source: 'cqfo',
      sensitive: true,
      confidence: 1
    });
  }

  if (
    normalizeYesNo(profileData.eeo.authorizedToWork) === 'Yes' &&
    /legally authorized to work in the USA/i.test(cqfoText)
  ) {
    upsertMemoryAnswer(canonicalAnswers, {
      key: 'authorizedToWorkUSA',
      question: 'Are you legally authorized to work in the United States?',
      answer: 'Yes',
      source: 'cqfo',
      sensitive: true,
      confidence: 1
    });
  }

  return canonicalAnswers;
};

const limitContextText = (value, maxLength) => {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
};

const cleanFieldOptions = (options) => {
  if (!Array.isArray(options)) return [];

  return [...new Set(
    options
      .map(option => {
        if (typeof option === 'string') return option.trim();
        return typeof option?.label === 'string' ? option.label.trim() : '';
      })
      .map(option => option?.slice(0, 1000))
      .filter(Boolean)
  )].slice(0, 250);
};

const normalizeApplicationCurrentValue = value => {
  if (typeof value === 'string') return value.slice(0, 20000);
  if (typeof value === 'number' || typeof value === 'boolean') return value;

  if (Array.isArray(value)) {
    return value.slice(0, 100).map(item => {
      if (typeof item === 'string') return item.slice(0, 2000);
      if (typeof item === 'number' || typeof item === 'boolean') return item;
      return '';
    }).filter(item => item !== '');
  }

  return '';
};

const normalizeFieldValidity = validity => {
  const input = validity && typeof validity === 'object'
    ? validity
    : {};

  return {
    valid: input.valid !== false && input.ariaInvalid !== true,
    ariaInvalid: input.ariaInvalid === true,
    message: cleanText(input.message).slice(0, 2000)
  };
};

const normalizeApplicationFields = (fields, fallbackPageKey = '') => {
  if (!Array.isArray(fields)) return [];

  const usedIds = new Set();

  return fields.map((field, index) => {
    const item = typeof field === 'string' ? { label: field } : field;
    const label = cleanText(item?.label || item?.question);
    let fieldId = cleanText(item?.fieldId || item?.id || item?.name);

    if (!fieldId) fieldId = `field_${index + 1}`;
    fieldId = fieldId.slice(0, 180);

    const baseFieldId = fieldId;
    let duplicateIndex = 1;
    while (usedIds.has(fieldId)) {
      fieldId = `${baseFieldId}_${index + 1}_${duplicateIndex}`.slice(0, 200);
      duplicateIndex += 1;
    }

    usedIds.add(fieldId);

    return {
      fieldId,
      label: label.slice(0, 1000),
      type: cleanText(item?.type || 'text').slice(0, 50),
      required: item?.required === true,
      options: cleanFieldOptions(item?.options),
      multiple: item?.multiple === true,
      currentValue: normalizeApplicationCurrentValue(item?.currentValue),
      maxLength: Number.isFinite(Number(item?.maxLength)) ? Number(item.maxLength) : null,
      pageKey: cleanText(item?.pageKey || fallbackPageKey).slice(0, 500),
      valueOwner: cleanText(item?.valueOwner).slice(0, 50),
      validity: normalizeFieldValidity(item?.validity)
    };
  }).filter(field => field.label);
};

const toPlainApplicationItem = item => {
  if (!item) return null;

  return typeof item.toObject === 'function'
    ? item.toObject()
    : { ...item };
};

const mergeApplicationItemsByFieldId = (
  existingItems,
  incomingItems
) => {
  const merged = new Map();

  (existingItems || []).forEach(item => {
    const value = toPlainApplicationItem(item);
    const fieldId = cleanText(value?.fieldId);

    if (fieldId) merged.set(fieldId, value);
  });

  (incomingItems || []).forEach(item => {
    const value = toPlainApplicationItem(item);
    const fieldId = cleanText(value?.fieldId);

    if (fieldId) merged.set(fieldId, value);
  });

  return [...merged.values()];
};

const normalizeJobContext = (body) => {
  const context = body.jobContext || {};

  return {
    company: cleanText(context.company || body.targetCompany).slice(0, 300),
    jobTitle: cleanText(context.jobTitle || body.targetJobTitle).slice(0, 300),
    jobUrl: cleanText(context.jobUrl || body.jobUrl).slice(0, 2000),
    location: cleanText(context.location).slice(0, 500),
    description: limitContextText(context.description || body.jobDescription, 30000),
    companyDescription: limitContextText(context.companyDescription, 10000),
    responsibilities: cleanStringArray(context.responsibilities).slice(0, 50),
    requirements: cleanStringArray(context.requirements).slice(0, 50),
    preferredQualifications: cleanStringArray(context.preferredQualifications).slice(0, 50)
  };
};

const normalizeCountry = (value) => {
  const country = cleanText(value);
  const normalized = country.toLowerCase().replace(/[.\s]/g, '');

  if (['usa', 'us', 'unitedstates', 'unitedstatesofamerica'].includes(normalized)) {
    return 'United States';
  }

  return country;
};

const normalizeYesNo = (value) => {
  const answer = cleanText(value).toLowerCase();

  if (answer === 'yes' || answer.startsWith('yes,')) return 'Yes';
  if (answer === 'no' || answer.startsWith('no,')) return 'No';

  return cleanText(value);
};

const normalizeGpaFields = (item) => {
  let gpa = cleanText(item?.gpa);
  let gpaScale = cleanText(item?.gpaScale);
  const percentage = gpa.match(/^(\d+(?:\.\d+)?)\s*%/);

  if (percentage) {
    gpa = (Number(percentage[1]) * 0.04).toFixed(2);
    gpaScale = '4.0';
  }

  return { gpa, gpaScale };
};

const getExtractedCertificationIndexes = answers => {
  const indexes = new Set();

  (Array.isArray(answers) ? answers : []).forEach(item => {
    const key = cleanText(item?.key);
    const value = item?.answer;

    const hasValue = Array.isArray(value)
      ? value.length > 0
      : value !== '' && value !== null && value !== undefined;

    if (!hasValue) return;

    const match = key.match(
      /^certification(\d+)(name|issuer|dateachieved|expirationdate)$/i
    );

    if (!match) return;

    const index = Number(match[1]);

    if (Number.isInteger(index) && index > 0 && index <= 5) {
      indexes.add(index);
    }
  });

  return [...indexes].sort((first, second) => first - second);
};

const getExtractedReferenceIndexes = answers => {
  const indexes = new Set();

  (Array.isArray(answers) ? answers : []).forEach(item => {
    const key = cleanText(item?.key);
    const value = item?.answer;

    const hasValue = Array.isArray(value)
      ? value.length > 0
      : value !== '' &&
        value !== null &&
        value !== undefined;

    if (!hasValue) return;

    const match = key.match(
      /^reference0*(\d+)(fullName|relationship|company|jobTitle|phone|email)$/i
    );

    if (!match) return;

    const index = Number(match[1]);

    if (
      Number.isInteger(index) &&
      index > 0 &&
      index <= 3
    ) {
      indexes.add(index);
    }
  });

  return [...indexes].sort(
    (first, second) => first - second
  );
};

const validateExtractedProfile = (
  profileData,
  documentText,
  usedCqfoVision
) => {
  const errors = [];
  const resumeText = documentText.resume || '';
  const cqfoText = documentText.cqfo || '';

  if (
    resumeText.trim() &&
    profileData.workHistory.length === 0
  ) {
    errors.push(
      'No work history was extracted from the resume.'
    );
  }

  if (
    /education/i.test(resumeText) &&
    profileData.educationHistory.length === 0
  ) {
    errors.push(
      'No education history was extracted.'
    );
  }

  if (
    !profileData.personalInfo.firstName &&
    !profileData.personalInfo.lastName
  ) {
    errors.push(
      'The candidate name was not extracted.'
    );
  }

  if (usedCqfoVision) {
    const memoryAnswers = Array.isArray(
      profileData.applicationMemory?.answers
    )
      ? profileData.applicationMemory.answers
      : [];

    const memoryKeys = new Set(
      memoryAnswers.map(item => {
        return cleanText(item?.key)
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '');
      })
    );

    const requireKey = (
      condition,
      key,
      label
    ) => {
      const normalizedKey = key
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');

      if (
        condition &&
        !memoryKeys.has(normalizedKey)
      ) {
        errors.push(
          `${label} was not extracted from the CQFO.`
        );
      }
    };

    requireKey(
      /expected base salary/i.test(cqfoText),
      'salaryMinimum',
      'Minimum salary'
    );

    requireKey(
      /expected base salary/i.test(cqfoText),
      'salaryMaximum',
      'Maximum salary'
    );

    requireKey(
      /expected base salary/i.test(cqfoText),
      'salaryCurrency',
      'Salary currency'
    );

    requireKey(
      /citizen of another country|permanent residency/i.test(
        cqfoText
      ),
      'otherCitizenshipOrResidency',
      'Citizenship or permanent-residency answer'
    );

    requireKey(
      /legally authorized to work in the USA/i.test(
        cqfoText
      ),
      'authorizedToWorkUSA',
      'United States work authorization'
    );

    requireKey(
      /government entity/i.test(cqfoText),
      'governmentEmployment',
      'Government-employment answer'
    );

    requireKey(
      /agreement or covenant not to compete/i.test(
        cqfoText
      ),
      'employmentAgreement',
      'Employment-agreement answer'
    );

    requireKey(
      /convicted of|pled guilty/i.test(cqfoText),
      'criminalHistory',
      'Criminal-history answer'
    );

    requireKey(
      /dates and time ranges.*interview/i.test(
        cqfoText
      ),
      'interviewAvailability',
      'Interview availability'
    );

    /*
 * Do not count "Reference 1", "Reference 2" and
 * "Reference 3" labels in the raw PDF text.
 *
 * CQFO templates can contain empty reference sections.
 * A printed section label does not prove that the user
 * entered a complete reference.
 *
 * Partial reference extraction should be preserved and
 * missing fields should remain unavailable to Agent 2,
 * rather than rejecting the complete profile upload.
 */
const referenceIndexes =
  getExtractedReferenceIndexes(memoryAnswers);

const incompleteReferences = referenceIndexes
  .map(index => {
    const requiredFields = [
      {
        key: `reference${index}FullName`,
        label: 'full name'
      },
      {
        key: `reference${index}Phone`,
        label: 'phone'
      }
    ];

    const missingFields = requiredFields
      .filter(field => {
        const normalizedKey = field.key
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '');

        return !memoryKeys.has(normalizedKey);
      })
      .map(field => field.label);

    return {
      index,
      missingFields
    };
  })
  .filter(reference => {
    return reference.missingFields.length > 0;
  });

if (incompleteReferences.length > 0) {
  const warningDetails = incompleteReferences
    .map(reference => {
      return (
        `Reference ${reference.index}: ` +
        reference.missingFields.join(', ')
      );
    })
    .join('; ');

  console.warn(
    '[FastApply] Some reference fields were not extracted: ' +
    `${warningDetails}. The available reference data will ` +
    'still be saved.'
  );
}

    /*
     * Do not count certification labels in the raw PDF text.
     * PDF forms commonly contain multiple empty certification
     * template rows, so label count does not equal populated count.
     *
     * Validate only certification indexes for which Agent 1
     * extracted at least one meaningful certification value.
     */
    const certificationIndexes =
      getExtractedCertificationIndexes(
        memoryAnswers
      );

    certificationIndexes.forEach(index => {
      requireKey(
        true,
        `certification${index}Name`,
        `Certification ${index} name`
      );
    });

    const missingIssuerIndexes =
      certificationIndexes.filter(index => {
        const issuerKey =
          `certification${index}issuer`;

        return !memoryKeys.has(issuerKey);
      });

    if (missingIssuerIndexes.length > 0) {
      console.warn(
        '[FastApply] Certification issuer was not extracted for ' +
        `entries: ${missingIssuerIndexes.join(', ')}. ` +
        'The profile will still be saved because issuer fields ' +
        'may be blank in the CQFO.'
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Document extraction validation failed: ${errors.join(' ')}`
    );
  }
};

const hasApplicationValue = value => {
  if (Array.isArray(value)) return value.length > 0;

  return value !== '' &&
    value !== null &&
    value !== undefined;
};

const getWritingRuntimeInfo = () => {
  const provider = (
    process.env.LLM_PROVIDER || 'ollama'
  ).trim().toLowerCase();

  if (provider === 'ollama') {
    return {
      provider: 'ollama',
      model:
        process.env.OLLAMA_WRITING_MODEL ||
        process.env.OLLAMA_MODEL ||
        'llama3.1'
    };
  }

  return {
    provider: 'huggingface',
    model:
      process.env.HF_WRITING_MODEL ||
      process.env.HF_EXTRACTION_MODEL ||
      process.env.HF_MODEL ||
      'openai/gpt-oss-120b'
  };
};

const normalizeComparable = value => {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
};

const getNestedValue = (object, path) => {
  if (!object || !path) return undefined;

  const cleanPath = path
    .replace(/^profile\./, '')
    .replace(/\[(\d+)\]/g, '.$1');

  return cleanPath.split('.').reduce((value, key) => {
    if (value === null || value === undefined) return undefined;
    return value[key];
  }, object);
};

const isNarrativeApplicationField = field => {
  const label = cleanText(field?.label).toLowerCase();

  return field?.type === 'textarea' ||
    /\bwhy\b/.test(label) ||
    /\bdescribe\b/.test(label) ||
    /\bexplain\b/.test(label) ||
    /\btell us\b/.test(label) ||
    /\bsummar(?:y|ise|ize)\b/.test(label) ||
    /\bcover letter\b/.test(label) ||
    /\badditional information\b/.test(label) ||
    /\binterest(?:ed)?\b/.test(label) ||
    /\bqualification\b/.test(label) ||
    /\bexperience\b/.test(label);
};

const findApplicationMemoryEntry = (answers, key) => {
  const wantedKey = normalizeMemoryKey(key);

  return (answers || []).find(item => {
    return normalizeMemoryKey(item?.key) === wantedKey;
  });
};

const documentContainsQuote = (documentText, quote) => {
  const normalizedDocument = normalizeComparable(documentText);
  const normalizedQuote = normalizeComparable(quote);

  return normalizedQuote.length >= 3 &&
    normalizedDocument.includes(normalizedQuote);
};

const classifyAnswerPolarity = value => {
  const normalized = normalizeComparable(value);
  if (!normalized) return '';

  if (
    normalized === 'false' ||
    /^no\b/.test(normalized) ||
    /\b(do not|does not|did not|will not|not agree|not authorized|not willing|not a|not protected)\b/.test(normalized)
  ) {
    return 'no';
  }

  if (
    normalized === 'true' ||
    /^yes\b/.test(normalized) ||
    /\b(i am a|am a|identify as a|identify as one or more) protected veteran\b/.test(normalized) ||
    /\bprotected veteran\b/.test(normalized) ||
    /\b(agree|accept|acknowledge|certify|consent)\b/.test(normalized)
  ) {
    return 'yes';
  }

  return '';
};

const normalizeHttpComparable = value => {
  const raw = cleanText(value);
  if (!raw) return '';

  try {
    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const parsed = new URL(candidate);
    return `${parsed.hostname.toLowerCase()}${parsed.pathname.replace(/\/$/, '')}`;
  } catch (_) {
    return '';
  }
};

const canonicalGender = value => {
  const normalized = normalizeComparable(value);
  if (/^(male|man|cis male|cisgender male)\b/.test(normalized)) return 'male';
  if (/^(female|woman|cis female|cisgender female)\b/.test(normalized)) return 'female';
  if (/\b(nonbinary|non binary|genderqueer|gender fluid|genderfluid)\b/.test(normalized)) {
    return 'nonbinary';
  }
  return '';
};

const canonicalCountry = value => {
  const normalized = normalizeComparable(value)
    .replace(/\s*\+?\d+\s*$/, '')
    .trim();
  if (/^(us|usa|u s|united states|united states of america)$/.test(normalized)) {
    return 'united states';
  }
  if (/^(uk|u k|great britain|england|united kingdom)$/.test(normalized)) {
    return 'united kingdom';
  }
  if (/^(uae|u a e|united arab emirates)$/.test(normalized)) {
    return 'united arab emirates';
  }
  return normalized;
};

const US_STATE_CANONICAL = new Map(Object.entries({
  AL: 'alabama', AK: 'alaska', AZ: 'arizona', AR: 'arkansas', CA: 'california',
  CO: 'colorado', CT: 'connecticut', DE: 'delaware', FL: 'florida', GA: 'georgia',
  HI: 'hawaii', ID: 'idaho', IL: 'illinois', IN: 'indiana', IA: 'iowa', KS: 'kansas',
  KY: 'kentucky', LA: 'louisiana', ME: 'maine', MD: 'maryland', MA: 'massachusetts',
  MI: 'michigan', MN: 'minnesota', MS: 'mississippi', MO: 'missouri', MT: 'montana',
  NE: 'nebraska', NV: 'nevada', NH: 'new hampshire', NJ: 'new jersey', NM: 'new mexico',
  NY: 'new york', NC: 'north carolina', ND: 'north dakota', OH: 'ohio', OK: 'oklahoma',
  OR: 'oregon', PA: 'pennsylvania', RI: 'rhode island', SC: 'south carolina',
  SD: 'south dakota', TN: 'tennessee', TX: 'texas', UT: 'utah', VT: 'vermont',
  VA: 'virginia', WA: 'washington', WV: 'west virginia', WI: 'wisconsin',
  WY: 'wyoming', DC: 'district of columbia'
}));

const canonicalState = value => {
  const raw = cleanText(value);
  return US_STATE_CANONICAL.get(raw.toUpperCase()) || normalizeComparable(raw);
};

const canonicalApplicationDate = value => {
  const raw = cleanText(value).toLowerCase();
  if (!raw) return '';

  let match = raw.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?/);
  if (match) {
    const [, year, month, day] = match;
    return `${year}-${month.padStart(2, '0')}${day ? `-${day.padStart(2, '0')}` : ''}`;
  }

  match = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (match) {
    const [, month, day, year] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  match = raw.match(/^(\d{1,2})[-/.](\d{4})$/);
  if (match) {
    const [, month, year] = match;
    return `${year}-${month.padStart(2, '0')}`;
  }

  const monthNames = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
  };
  match = raw.match(/^([a-z]{3,9})\s+(\d{4})$/);
  if (match) {
    const month = monthNames[match[1].slice(0, 3)];
    if (month) return `${match[2]}-${month}`;
  }

  match = raw.match(/^\d{4}$/);
  return match ? match[0] : '';
};

const canonicalDegree = value => {
  const normalized = normalizeComparable(value);
  if (!normalized) return '';
  if (/\b(high school|secondary school|ged)\b/.test(normalized)) return 'high-school';
  if (/\b(associate|associates|aa|as degree)\b/.test(normalized)) return 'associate';
  if (/\b(bachelor|bachelors|baccalaureate|bsc|b s|bs|ba)\b/.test(normalized)) return 'bachelor';
  if (/\b(master|masters|msc|m s|ms|ma|mba)\b/.test(normalized)) return 'master';
  if (/\b(doctor|doctorate|doctoral|phd|ph d|juris doctor|jd|md)\b/.test(normalized)) return 'doctorate';
  if (/\b(certificate|certification)\b/.test(normalized)) return 'certificate';
  if (/\bdiploma\b/.test(normalized)) return 'diploma';
  return '';
};

const hasTextNegation = value => {
  return /\b(no|not|without|decline|prefer not|do not|dont)\b/.test(
    normalizeComparable(value)
  );
};

const canonicalRace = value => {
  const normalized = normalizeComparable(value);
  if (/\basian\b/.test(normalized)) return 'asian';
  if (/\bblack\b|\bafrican american\b/.test(normalized)) return 'black';
  if (/\bwhite\b|\bcaucasian\b/.test(normalized)) return 'white';
  if (/\bamerican indian\b|\balaska native\b|\bindigenous\b/.test(normalized)) return 'indigenous';
  if (/\bnative hawaiian\b|\bpacific islander\b/.test(normalized)) return 'pacific-islander';
  if (/\btwo or more\b|\bmultiracial\b|\bmixed race\b/.test(normalized)) return 'multiracial';
  return '';
};

const canonicalEthnicity = value => {
  const normalized = normalizeComparable(value);
  if (/\bnot hispanic\b|\bnot latino\b/.test(normalized)) return 'not-hispanic-latino';
  if (/\bhispanic\b|\blatino\b|\blatina\b|\blatinx\b/.test(normalized)) {
    return 'hispanic-latino';
  }
  return '';
};

const evidenceValueSupportsAnswer = ({
  answerValue,
  evidenceValue,
  field,
  evidenceKey = ''
}) => {
  if (!hasApplicationValue(answerValue) || !hasApplicationValue(evidenceValue)) {
    return false;
  }

  if (
    evidenceValue &&
    typeof evidenceValue === 'object' &&
    !Array.isArray(evidenceValue)
  ) {
    return false;
  }

  const answers = Array.isArray(answerValue) ? answerValue : [answerValue];
  const evidenceValues = Array.isArray(evidenceValue) ? evidenceValue : [evidenceValue];
  const normalizedEvidence = evidenceValues
    .map(normalizeComparable)
    .filter(Boolean);
  const label = cleanText(field?.label).toLowerCase();

  return answers.every(answerItem => {
    const normalizedAnswer = normalizeComparable(answerItem);
    if (!normalizedAnswer) return false;

    if (normalizedEvidence.includes(normalizedAnswer)) return true;

    if (
      normalizedAnswer.length >= 4 &&
      normalizedEvidence.some(item => {
        return hasTextNegation(item) === hasTextNegation(normalizedAnswer) &&
          item.includes(normalizedAnswer);
      })
    ) {
      return true;
    }

    if (
      /\b(phone|telephone|mobile)\b/.test(label) &&
      !/\b(country|territory|dial|calling)\b/.test(label)
    ) {
      const answerDigits = String(answerItem).replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
      return evidenceValues.some(item => {
        const evidenceDigits = String(item).replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
        return answerDigits.length >= 7 && answerDigits === evidenceDigits;
      });
    }

    if (/\b(url|website|portfolio|linkedin|github|twitter)\b/.test(label)) {
      const normalizedUrl = normalizeHttpComparable(answerItem);
      return Boolean(normalizedUrl) && evidenceValues.some(item => {
        return normalizeHttpComparable(item) === normalizedUrl;
      });
    }

    if (/\bgender\b/.test(label)) {
      const answerGender = canonicalGender(answerItem);
      return Boolean(answerGender) && evidenceValues.some(item => {
        return canonicalGender(item) === answerGender;
      });
    }

    if (/\b(country|territory)\b/.test(label)) {
      const answerCountry = canonicalCountry(answerItem);
      return Boolean(answerCountry) && evidenceValues.some(item => {
        return canonicalCountry(item) === answerCountry;
      });
    }

    if (/\b(state|province|region)\b/.test(label)) {
      const answerState = canonicalState(answerItem);
      return Boolean(answerState) && evidenceValues.some(item => {
        return canonicalState(item) === answerState;
      });
    }

    if (/\bdegree\b/.test(label)) {
      const answerDegree = canonicalDegree(answerItem);
      return Boolean(answerDegree) && evidenceValues.some(item => {
        return canonicalDegree(item) === answerDegree;
      });
    }

    if (/\brace\b/.test(label)) {
      const answerRace = canonicalRace(answerItem);
      if (answerRace) {
        return evidenceValues.some(item => {
          return canonicalRace(item) === answerRace;
        });
      }
    }

    if (/\b(ethnicity|hispanic|latino)\b/.test(label)) {
      const answerEthnicity = canonicalEthnicity(answerItem);
      return Boolean(answerEthnicity) && evidenceValues.some(item => {
        return canonicalEthnicity(item) === answerEthnicity;
      });
    }

    const answerPolarity = classifyAnswerPolarity(answerItem);
    const evidencePolarities = evidenceValues.map(classifyAnswerPolarity).filter(Boolean);
    if (answerPolarity && evidencePolarities.includes(answerPolarity)) return true;

    if (
      normalizeMemoryKey(evidenceKey).endsWith('optout') &&
      evidenceValue === true &&
      /\b(prefer not|decline|do not wish|dont wish|choose not)\b/.test(normalizedAnswer)
    ) {
      return true;
    }

    // Not gated on the label: date-valued answers must be comparable as dates
    // even when the label says "Employment Period" or similar wording the
    // keyword list above does not anticipate.
    const answerDate = canonicalApplicationDate(answerItem);
    if (answerDate) {
      return evidenceValues.some(item => {
        const evidenceDate = canonicalApplicationDate(item);
        if (!evidenceDate) return false;
        if (answerDate === evidenceDate) return true;
        return answerDate.length === 4
          ? evidenceDate.startsWith(answerDate)
          : evidenceDate.length === 4 && answerDate.startsWith(evidenceDate);
      });
    }

    return false;
  });
};

const PROFILE_EVIDENCE_LABEL_RULES = [
  [/personalinfo\.firstname$/i, /\b(first|given) name\b/i],
  [/personalinfo\.lastname$/i, /\b(last|family|surname) name\b/i],
  [/personalinfo\.preferredname$/i, /\bpreferred name\b/i],
  [/personalinfo\.pronouns$/i, /\bpronouns?\b/i],
  [/contactinfo\.email$/i, /\bemail\b/i],
  [/contactinfo\.phone$/i, /\b(phone|telephone|mobile)\b/i],
  [/contactinfo\.addressline1$/i, /\baddress( line)? 1\b/i],
  [/contactinfo\.addressline2$/i, /\baddress( line)? 2\b/i],
  [/contactinfo\.city$/i, /\bcity\b/i],
  [/contactinfo\.state$/i, /\b(state|province|region)\b/i],
  [/contactinfo\.postalcode$/i, /\b(postal|zip)\b/i],
  [/contactinfo\.country$/i, /\b(country|territory)\b/i],
  [/websitesandskills\.linkedin$/i, /\blinkedin\b/i],
  [/websitesandskills\.github$/i, /\bgithub\b/i],
  [/websitesandskills\.(portfolio|twitter|facebook)$/i, /\b(portfolio|twitter|facebook|website|url)\b/i],
  [/websitesandskills\.skills$/i, /\bskills?\b/i],
  [/personalinfo\.languages(\.\d+.*)?$/i, /\b(language|fluen|proficien)/i],
  [/workhistory\.\d+\.jobtitle$/i, /\btitle\b/i],
  [/workhistory\.\d+\.company$/i, /\b(company|employer)\b/i],
  [/workhistory\.\d+\.location$/i, /\b(location|city|country)\b/i],
  [/workhistory\.\d+\.employmenttype$/i, /\bemployment type\b/i],
  [/workhistory\.\d+\.description$/i, /\b(description|responsibilit|duties|experience)\b/i],
  [/workhistory\.\d+\.startdate$/i, /\b(from|start)\b/i],
  [/workhistory\.\d+\.enddate$/i, /\b(to|end)\b/i],
  [/workhistory\.\d+\.currentlyworkhere$/i, /\b(current|currently work)\b/i],
  [/educationhistory\.\d+\.school$/i, /\b(school|university|institution)\b/i],
  [/educationhistory\.\d+\.degree$/i, /\bdegree\b/i],
  [/educationhistory\.\d+\.(major|minor)$/i, /\b(major|minor|discipline)\b|\b(field|area|program) of study\b/i],
  [/educationhistory\.\d+\.institutionlocation$/i, /\b(school|institution|education).*\blocation\b/i],
  [/educationhistory\.\d+\.gpa(scale)?$/i, /\b(gpa|grade point)\b/i],
  [/educationhistory\.\d+\.startdate$/i, /\b(from|start)\b/i],
  [/educationhistory\.\d+\.enddate$/i, /\b(to|end|graduat)\b/i],
  [/eeo\.authorizedtowork$/i, /\bauthori[sz]ed to work\b/i],
  [/eeo\.requirevisanow$/i, /\b(now|currently).*\b(visa|sponsor|immigration)|\b(visa|sponsor|immigration).*\b(now|currently)\b/i],
  [/eeo\.requirevisafuture$/i, /\b(future|will).*\b(visa|sponsor|immigration)|\b(visa|sponsor|immigration).*\b(future|will)\b/i],
  [/eeo\.gender$/i, /\bgender\b/i],
  [/eeo\.(ethnicity|race)$/i, /\b(ethnicity|race|hispanic)\b/i],
  [/eeo\.veteran$/i, /\bveteran\b/i],
  [/eeo\.disability$/i, /\bdisab/i],
  [/eeo\.age$/i, /\bage\b/i],
  [/eeo\.optout$/i, /\b(gender|ethnicity|race|veteran|disab)\b/i]
];

const isProfileEvidenceRelevant = (evidenceKey, field) => {
  const cleanKey = cleanText(evidenceKey).replace(/^profile\./i, '');
  const rule = PROFILE_EVIDENCE_LABEL_RULES.find(([keyPattern]) => {
    return keyPattern.test(cleanKey);
  });
  return Boolean(rule && rule[1].test(cleanText(field?.label)));
};

const isApplicationMemoryRelevant = (entry, field) => {
  const label = normalizeComparable(field?.label);
  if (!label || !entry) return false;

  const phrases = [
    entry.question,
    ...(Array.isArray(entry.aliases) ? entry.aliases : []),
    camelCaseToWords(entry.key || '')
  ].map(normalizeComparable).filter(phrase => phrase.length >= 5);

  if (phrases.some(phrase => label.includes(phrase) || phrase.includes(label))) {
    return true;
  }

  const key = normalizeMemoryKey(entry.key);
  const conceptRules = [
    [/authorizedtowork/, /\bauthori[sz]ed to work\b/],
    [/sponsorship|workauthorizationdetails/, /\b(sponsor|visa|immigration|work permit)\b/],
    [/salary|compensation/, /\b(salary|compensation|pay)\b/],
    [/willingtorelocate/, /\brelocat/],
    [/travel/, /\btravel\b/],
    [/governmentemployment/, /\bgovernment.*\b(employee|employment)|\b(employee|employment).*\bgovernment\b/],
    [/employmentagreement/, /\b(non compete|non solicitation|restrictive covenant)\b/],
    [/criminalhistory/, /\b(criminal|conviction|felony|misdemeanor)\b/],
    [/interviewavailability/, /\binterview.*\b(availab|schedule)|\b(availab|schedule).*\binterview\b/],
    [/dateofbirth/, /\b(date of birth|birth date|birthday|dob)\b/],
    [/nationality|citizenship|residency/, /\b(nationality|citizen|residen)\b/]
  ];
  const rule = conceptRules.find(([keyPattern]) => keyPattern.test(key));
  return Boolean(rule && rule[1].test(label));
};

const validateAgentEvidence = ({
  answer,
  field,
  candidateContext
}) => {
  const source = cleanText(answer?.evidenceSource);
  const evidenceKey = cleanText(answer?.evidenceKey);
  const evidenceQuote = cleanText(answer?.evidenceQuote);

  if (source === 'profile') {
    const evidenceValue = getNestedValue(
      candidateContext.profile,
      evidenceKey
    );

    const fieldLabel = normalizeComparable(field?.label);
    const isFullNameField = /\b(full name|legal name|your name)\b/.test(fieldLabel);
    const profileName = [
      candidateContext.profile?.personalInfo?.firstName,
      candidateContext.profile?.personalInfo?.lastName
    ].map(cleanText).filter(Boolean).join(' ');

    if (
      isFullNameField &&
      profileName &&
      normalizeComparable(answer?.value) === normalizeComparable(profileName) &&
      /^personalInfo\.(firstName|lastName)$/i.test(
        evidenceKey.replace(/^profile\./i, '')
      )
    ) {
      return true;
    }

    const valueSupported = evidenceValueSupportsAnswer({
      answerValue: answer?.value,
      evidenceValue,
      field,
      evidenceKey
    });
    if (!valueSupported) return false;
    if (isProfileEvidenceRelevant(evidenceKey, field)) return true;

    // The label whitelist is a heuristic, not proof of irrelevance. When the
    // profile genuinely contains the cited value, accept the answer as
    // review-required instead of blanking a correct answer because the
    // tenant's label wording is not on the list.
    const evidenceHasValue = Array.isArray(evidenceValue)
      ? evidenceValue.length > 0
      : String(evidenceValue ?? '').trim() !== '';
    return evidenceHasValue ? 'review' : false;
  }

  if (source === 'applicationMemory') {
    const memoryEntry = findApplicationMemoryEntry(
      candidateContext.applicationMemory,
      evidenceKey
    );

    return isApplicationMemoryRelevant(memoryEntry, field) &&
      evidenceValueSupportsAnswer({
        answerValue: answer?.value,
        evidenceValue: memoryEntry?.answer,
        field,
        evidenceKey
      });
  }

  if (source === 'resume') {
    const quoteExists = documentContainsQuote(
      candidateContext.documents?.resume?.rawText,
      evidenceQuote
    );
    return quoteExists && (
      isNarrativeApplicationField(field) ||
      evidenceValueSupportsAnswer({
        answerValue: answer?.value,
        evidenceValue: evidenceQuote,
        field,
        evidenceKey
      })
    );
  }

  if (source === 'cqfo') {
    const quoteExists = documentContainsQuote(
      candidateContext.documents?.cqfo?.rawText,
      evidenceQuote
    );
    return quoteExists && (
      isNarrativeApplicationField(field) ||
      evidenceValueSupportsAnswer({
        answerValue: answer?.value,
        evidenceValue: evidenceQuote,
        field,
        evidenceKey
      })
    );
  }

  if (source === 'coverLetter') {
    const quoteExists = documentContainsQuote(
      candidateContext.documents?.coverLetter?.rawText,
      evidenceQuote
    );
    return quoteExists && (
      isNarrativeApplicationField(field) ||
      evidenceValueSupportsAnswer({
        answerValue: answer?.value,
        evidenceValue: evidenceQuote,
        field,
        evidenceKey
      })
    );
  }

  if (source === 'generated') {
    return isNarrativeApplicationField(field);
  }

  if (source === 'derived') {
    // Derived answers reason from known facts (candidate country vs a
    // sanctioned-country list, work history vs "do you use X"). Require the
    // cited fact to actually exist and, for choice fields, the answer to be
    // one of the offered options — then surface it as review-required
    // instead of blanking the model's reasoning.
    const referencedProfileValue = getNestedValue(
      candidateContext.profile,
      evidenceKey.replace(/^profile\./i, '')
    );
    const referencedMemoryEntry = findApplicationMemoryEntry(
      candidateContext.applicationMemory,
      evidenceKey
    );
    const factExists =
      hasApplicationValue(referencedProfileValue) ||
      hasApplicationValue(referencedMemoryEntry?.answer);
    if (!factExists) return false;

    const options = Array.isArray(field?.options) ? field.options : [];
    if (options.length > 0) {
      const values = Array.isArray(answer?.value) ? answer.value : [answer?.value];
      const allMatchOptions = values.filter(hasApplicationValue).length > 0 &&
        values.every(value => {
          return options.some(option => {
            return normalizeComparable(option) === normalizeComparable(value);
          });
        });
      return allMatchOptions ? 'review' : false;
    }

    return hasApplicationValue(answer?.value) ? 'review' : false;
  }

  return false;
};

const APPLICATION_OPTION_STOP_WORDS = new Set([
  'a', 'an', 'and', 'for', 'of', 'or', 'the', 'to'
]);

const normalizeApplicationOptionMeaning = value => {
  let normalized = String(value ?? '')
    .toLowerCase()
    .replace(/\.net\b/g, ' dotnet ')
    .replace(/\bc\s*#/g, ' csharp ')
    .replace(/\bf\s*#/g, ' fsharp ');

  normalized = normalizeComparable(normalized)
    .replace(/\bnode\s+js\b/g, 'nodejs')
    .replace(/\breact\s+js\b/g, 'react')
    .replace(/\bvue\s+js\b/g, 'vue')
    .replace(/\bangular\s+js\b/g, 'angular')
    .replace(/\bnext\s+js\b/g, 'nextjs')
    .replace(/\bms sql server\b/g, 'microsoft sql server')
    .replace(/\bamazon web services\b/g, 'aws')
    .replace(/\bgoogle cloud platform\b/g, 'gcp')
    .replace(/\bk8s\b/g, 'kubernetes')
    .replace(/\bstructured query language\b/g, 'sql')
    .replace(/\bservice organization controls?\s*2\b/g, 'soc2')
    .replace(/\bsoc\s*2\b/g, 'soc2')
    .replace(/\bunited states of america\b/g, 'united states')
    .replace(/\brequest for quotation\b|\brfq\b/g, 'request quotation')
    .replace(/\brequest for proposal\b|\brfp\b/g, 'request proposal')
    .replace(/\brequest for information\b|\brfi\b/g, 'request information')
    .replace(/\b(programming|query|markup|scripting) language\b/g, ' ')
    .replace(/\b(software skill|framework|library|platform|technology|methodology|standard|protocol|tool)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const wholeAliases = new Map([
    ['js', 'javascript'],
    ['ts', 'typescript'],
    ['us', 'united states'],
    ['u s', 'united states'],
    ['usa', 'united states'],
    ['uk', 'united kingdom'],
    ['u k', 'united kingdom'],
    ['b e', 'bachelor engineering'],
    ['be', 'bachelor engineering'],
    ['beng', 'bachelor engineering'],
    ['b sc', 'bachelor science'],
    ['bs', 'bachelor science'],
    ['bsc', 'bachelor science'],
    ['b a', 'bachelor arts'],
    ['ba', 'bachelor arts'],
    ['m sc', 'master science'],
    ['ms', 'master science'],
    ['msc', 'master science'],
    ['m a', 'master arts'],
    ['ma', 'master arts'],
    ['mba', 'master business administration'],
    ['ph d', 'doctor philosophy'],
    ['phd', 'doctor philosophy']
  ]);

  return wholeAliases.get(normalized) || normalized;
};

const applicationOptionTokens = value => {
  return normalizeApplicationOptionMeaning(value)
    .split(/\s+/)
    .filter(token => token && !APPLICATION_OPTION_STOP_WORDS.has(token));
};

const isGenericDegreeOption = value => {
  const ignored = new Set([
    'degree', 'degrees', 'bachelor', 'bachelors', 'master', 'masters',
    'doctor', 'doctorate', 'doctoral', 'associate', 'associates',
    'certificate', 'certification', 'diploma', 's'
  ]);
  return applicationOptionTokens(value).filter(token => !ignored.has(token)).length === 0;
};

const scoreApplicationOptionMeaning = (option, value) => {
  const optionText = normalizeApplicationOptionMeaning(option);
  const valueText = normalizeApplicationOptionMeaning(value);
  if (!optionText || !valueText) return 0;
  if (normalizeComparable(option) === normalizeComparable(value)) return 1;
  if (optionText === valueText) return 0.99;

  const optionPolarity = classifyAnswerPolarity(option);
  const valuePolarity = classifyAnswerPolarity(value);
  if (optionPolarity || valuePolarity) {
    return optionPolarity && optionPolarity === valuePolarity ? 0.98 : 0;
  }

  const parentheticalAliases = input => Array.from(
    String(input ?? '').matchAll(/\(([^)]+)\)/g),
    match => normalizeApplicationOptionMeaning(match[1])
  ).filter(Boolean);
  const optionAliases = parentheticalAliases(option);
  const valueAliases = parentheticalAliases(value);
  if (
    optionAliases.includes(valueText) ||
    valueAliases.includes(optionText) ||
    optionAliases.some(alias => valueAliases.includes(alias))
  ) return 0.98;

  const optionGender = canonicalGender(option);
  const valueGender = canonicalGender(value);
  if (optionGender || valueGender) {
    return optionGender && optionGender === valueGender ? 0.98 : 0;
  }

  const optionRace = canonicalRace(option);
  const valueRace = canonicalRace(value);
  if (optionRace || valueRace) {
    return optionRace && optionRace === valueRace &&
      hasTextNegation(option) === hasTextNegation(value) ? 0.97 : 0;
  }

  const optionEthnicity = canonicalEthnicity(option);
  const valueEthnicity = canonicalEthnicity(value);
  if (optionEthnicity || valueEthnicity) {
    return optionEthnicity && optionEthnicity === valueEthnicity ? 0.97 : 0;
  }

  const optionCountry = canonicalCountry(option);
  const valueCountry = canonicalCountry(value);
  if (
    optionCountry && valueCountry &&
    optionCountry === valueCountry &&
    (
      optionCountry !== normalizeComparable(option) ||
      valueCountry !== normalizeComparable(value)
    )
  ) return 0.97;

  const optionDegree = canonicalDegree(option);
  const valueDegree = canonicalDegree(value);
  if (optionDegree || valueDegree) {
    if (!optionDegree || optionDegree !== valueDegree) return 0;
    if (isGenericDegreeOption(option) || isGenericDegreeOption(value)) return 0.86;
  }

  const optionTokens = [...new Set(applicationOptionTokens(optionText))];
  const valueTokens = [...new Set(applicationOptionTokens(valueText))];
  if (!optionTokens.length || !valueTokens.length) return 0;

  if (valueTokens.length === 1 && optionTokens.length > 1) {
    const acronym = optionTokens.map(token => token[0]).join('');
    if (valueTokens[0].length >= 2 && valueTokens[0] === acronym) return 0.96;
  }
  if (optionTokens.length === 1 && valueTokens.length > 1) {
    const acronym = valueTokens.map(token => token[0]).join('');
    if (optionTokens[0].length >= 2 && optionTokens[0] === acronym) return 0.96;
  }

  const intersection = valueTokens.filter(token => optionTokens.includes(token)).length;
  if (!intersection) return 0;
  if (intersection === 1 && Math.max(valueTokens.length, optionTokens.length) > 2) {
    return 0;
  }

  const valueCoverage = intersection / valueTokens.length;
  const optionCoverage = intersection / optionTokens.length;
  const dice = (2 * intersection) / (valueTokens.length + optionTokens.length);
  if (
    intersection === valueTokens.length &&
    intersection === optionTokens.length
  ) return 0.98;
  if (intersection >= 2 && (valueCoverage === 1 || optionCoverage === 1)) {
    return 0.88;
  }
  return (0.55 * Math.min(valueCoverage, optionCoverage)) +
    (0.3 * Math.max(valueCoverage, optionCoverage)) +
    (0.15 * dice);
};

const matchSingleApplicationOption = (value, options) => {
  if (!Array.isArray(options) || options.length === 0) {
    return value;
  }

  const normalizedValue = normalizeComparable(value);

  if (!normalizedValue) return '';

  const exactMatch = options.find(option => {
    return normalizeComparable(option) === normalizedValue;
  });

  if (exactMatch !== undefined) return exactMatch;

  const ranked = options
    .map(option => ({
      option,
      score: scoreApplicationOptionMeaning(option, value)
    }))
    .filter(candidate => candidate.score >= 0.74)
    .sort((first, second) => second.score - first.score);

  if (!ranked.length) return '';
  if (ranked.length > 1 && ranked[0].score - ranked[1].score < 0.06) {
    return '';
  }

  return ranked[0].option;

};

const matchApplicationOption = (value, options) => {
  if (Array.isArray(value)) {
    const matches = value.map(item => {
      return matchSingleApplicationOption(item, options);
    });

    if (matches.some(match => !match)) return [];

    return [...new Set(matches)];
  }

  return matchSingleApplicationOption(value, options);
};

const truncateApplicationAnswer = (value, maxLength) => {
  if (
    typeof value !== 'string' ||
    !Number.isFinite(maxLength) ||
    maxLength <= 0 ||
    value.length <= maxLength
  ) {
    return value;
  }

  const shortened = value.slice(0, maxLength + 1);
  const lastSpace = shortened.lastIndexOf(' ');

  return (
    lastSpace >= Math.floor(maxLength * 0.7)
      ? shortened.slice(0, lastSpace)
      : shortened.slice(0, maxLength)
  ).trim();
};

const mapEvidenceSourceToStoredSource = source => {
  if (source === 'profile') return 'profile';
  if (source === 'applicationMemory') return 'applicationMemory';

  if (
    source === 'resume' ||
    source === 'cqfo' ||
    source === 'coverLetter'
  ) {
    return 'documents';
  }

  if (source === 'generated' || source === 'derived') return 'generated';

  return 'unknown';
};

const normalizeGeneratedAnswers = (
  result,
  fields,
  candidateContext
) => {
  const rawAnswers = Array.isArray(result?.answers)
    ? result.answers
    : [];

  const answerMap = new Map();

  rawAnswers.forEach(answer => {
    const fieldId = cleanText(answer?.fieldId);

    if (fieldId) {
      answerMap.set(fieldId, answer);
    }
  });

  return fields.map(field => {
    const rawAnswer = answerMap.get(field.fieldId) || {};
    const evidenceValid = validateAgentEvidence({
      answer: rawAnswer,
      field,
      candidateContext
    });

    if (!evidenceValid) {
      return {
        fieldId: field.fieldId,
        label: field.label,
        value: '',
        source: 'unknown',
        confidence: 0,
        requiresReview: true,
        reviewReason:
          'No supporting information was found in the profile or uploaded documents.'
      };
    }

    let value = rawAnswer.value ?? '';

    if (
      field.type === 'select' ||
      field.type === 'radio' ||
      field.type === 'checkbox'
    ) {
      value = matchApplicationOption(
        value,
        field.options
      );

      if (!hasApplicationValue(value)) {
        return {
          fieldId: field.fieldId,
          label: field.label,
          value: '',
          source: 'unknown',
          confidence: 0,
          requiresReview: true,
          reviewReason:
            'Supporting information was found, but it did not match an available form option.'
        };
      }
    }

    value = truncateApplicationAnswer(
      value,
      field.maxLength
    );

    if (!hasApplicationValue(value)) {
      return {
        fieldId: field.fieldId,
        label: field.label,
        value: '',
        source: 'unknown',
        confidence: 0,
        requiresReview: true,
        reviewReason:
          'No supported answer was available for this field.'
      };
    }

    const confidence = Math.min(
      1,
      Math.max(
        0,
        Number(rawAnswer.confidence) || 0
      )
    );

    // 'review' = the answer is plausible but not literally evidenced (label
    // not on the relevance whitelist, or a reasoned/derived answer); keep the
    // answer and flag it for the user instead of blanking it.
    const softAccepted = evidenceValid === 'review';
    const isDerived = cleanText(rawAnswer.evidenceSource) === 'derived';

    return {
      fieldId: field.fieldId,
      label: field.label,
      value,
      source: mapEvidenceSourceToStoredSource(
        rawAnswer.evidenceSource
      ),
      confidence: softAccepted ? Math.min(confidence, 0.6) : confidence,
      requiresReview:
        softAccepted || rawAnswer.requiresReview === true,
      reviewReason: softAccepted
        ? isDerived
          ? 'FastApply reasoned this answer from your profile data — please double-check it.'
          : 'The answer matches the profile, but the question wording could not be verified automatically.'
        : rawAnswer.requiresReview === true
          ? cleanText(rawAnswer.reviewReason)
          : ''
    };
  });
};

const getApplicationMemoryValue = (answers, key) => {
  const wantedKey = normalizeMemoryKey(key);

  const match = (answers || []).find(item => {
    return normalizeMemoryKey(item.key) === wantedKey;
  });

  return cleanText(match?.answer);
};

const inferJobCountry = jobContext => {
  const text = [
    jobContext?.location,
    jobContext?.description,
    jobContext?.jobUrl
  ].join(' ').toLowerCase();

  if (
    /\bcanada\b|\bcanadian\b|\bvancouver\b|\btoronto\b|\bmontreal\b|\bcalgary\b|\bottawa\b|\bbc\b|\bontario\b|\balberta\b/i.test(
      text
    )
  ) {
    return 'Canada';
  }

  if (
    /\bunited states\b|\busa\b|\bu\.s\.a?\b|\bcalifornia\b|\btexas\b|\bnew york\b/i.test(
      text
    )
  ) {
    return 'United States';
  }

  return '';
};

const applyStructuredAnswerFallbacks = ({
  answers,
  fields,
  profileData,
  jobContext
}) => {
  const fieldMap = new Map(fields.map(field => [field.fieldId, field]));
  const memory = profileData.applicationMemory?.answers || [];
  const profile = profileData || {};
  const personal = profile.personalInfo || {};
  const contact = profile.contactInfo || {};
  const websites = profile.websitesAndSkills || {};
  const eeo = profile.eeo || {};

  const memoryValue = key => getApplicationMemoryValue(memory, key);
  const jobCountry = inferJobCountry(jobContext);

  const resolveValue = field => {
    const label = normalizeComparable(field.label);

    if (/\bpreferred (first|given) name\b/.test(label)) return personal.preferredName;
    if (/\b(first|given) name\b/.test(label) && !/preferred/.test(label)) {
      return personal.firstName;
    }
    if (/\b(last|family|surname) name\b/.test(label)) return personal.lastName;
    if (/\bemail( address)?\b/.test(label)) return contact.email;
    if (/\bphone (number|mobile)\b|\btelephone\b/.test(label) && !/extension|code/.test(label)) {
      return contact.phone;
    }
    if (/\baddress line 1\b|\bstreet address\b/.test(label)) return contact.addressLine1;
    if (/\baddress line 2\b|\bapartment\b|\baddress 2\b/.test(label)) {
      return contact.addressLine2;
    }
    if (/^city\b|\bmunicipality\b/.test(label)) return contact.city;
    if (/^(state|province|state province|region)\b/.test(label)) return contact.state;
    if (/\b(postal|zip) code\b/.test(label)) return contact.postalCode;
    if (/^(country|country territory)\b/.test(label) && !/phone|code/.test(label)) {
      return contact.country;
    }
    if (/\blinkedin\b/.test(label)) return websites.linkedin;
    if (/\bgithub\b/.test(label)) return websites.github;
    if (/\bportfolio\b|\bpersonal website\b/.test(label)) return websites.portfolio;

    if (/\brelocat(e|ing|ion)\b/.test(label)) {
      return memoryValue('willingToRelocate');
    }
    if (/\bnon compete\b|\bnon solicitation\b/.test(label)) {
      return memoryValue('employmentAgreement');
    }
    if (/\bgovernment\b/.test(label) && /\b(employee|employment|worked)\b/.test(label)) {
      return memoryValue('governmentEmployment');
    }
    if (/\bauthorized to work\b/.test(label)) {
      if (jobCountry === 'Canada' || /\bcanada\b/.test(label)) {
        return memoryValue('authorizedToWorkCanada');
      }
      if (jobCountry === 'United States' || /\b(united states|usa|u s)\b/.test(label)) {
        return memoryValue('authorizedToWorkUSA') || eeo.authorizedToWork;
      }

      const usa = memoryValue('authorizedToWorkUSA');
      const canada = memoryValue('authorizedToWorkCanada');
      if (usa && !canada) return usa;
      if (canada && !usa) return canada;
      if (normalizeComparable(usa) === normalizeComparable(canada)) return usa;
      return '';
    }
    if (/\bsponsorship\b|\bimmigration filing\b/.test(label)) {
      const stored = memoryValue('sponsorshipRequired');
      if (stored) return stored;
      const now = cleanText(eeo.requireVisaNow);
      const future = cleanText(eeo.requireVisaFuture);
      if (/^yes$/i.test(now) || /^yes$/i.test(future)) return 'Yes';
      if (/^no$/i.test(now) && /^no$/i.test(future)) return 'No';
    }

    return '';
  };

  return answers.map(answer => {
    if (hasApplicationValue(answer.value)) return answer;
    const field = fieldMap.get(answer.fieldId);
    if (!field) return answer;

    let value = cleanText(resolveValue(field));
    if (!value) return answer;

    if (['select', 'radio', 'checkbox'].includes(field.type)) {
      value = matchApplicationOption(value, field.options);
      if (!hasApplicationValue(value)) return answer;
    }

    value = truncateApplicationAnswer(value, field.maxLength);
    if (!hasApplicationValue(value)) return answer;

    return {
      ...answer,
      value,
      source: 'profile',
      confidence: 1,
      requiresReview: false,
      reviewReason: ''
    };
  });
};

const applyAnswerReviewRules = ({
  answers,
  fields,
  jobContext,
  applicationMemory
}) => {
  const fieldMap = new Map(
    fields.map(field => [field.fieldId, field])
  );

  const jobCountry = inferJobCountry(jobContext);

  const storedSalaryCurrency = getApplicationMemoryValue(
    applicationMemory,
    'salaryCurrency'
  ).toUpperCase();

  return answers.map(answer => {
    const field = fieldMap.get(answer.fieldId);
    const label = cleanText(field?.label).toLowerCase();

    const isSalaryField =
      /\bsalary\b|\bcompensation\b|\bpay range\b/.test(label);

    // Preserve all existing review information for non-salary answers.
    if (!isSalaryField || !hasApplicationValue(answer.value)) {
      return answer;
    }

    const currencyMismatch =
      (jobCountry === 'Canada' && storedSalaryCurrency === 'USD') ||
      (
        jobCountry === 'United States' &&
        storedSalaryCurrency === 'CAD'
      );

    if (!currencyMismatch) {
      return answer;
    }

    return {
      ...answer,
      confidence: Math.min(answer.confidence, 0.9),
      requiresReview: true,
      reviewReason:
        `Stored salary currency is ${storedSalaryCurrency}, but the job appears to be in ${jobCountry}.`
    };
  });
};



// @desc    Get current user's profile
// @route   GET /api/profile
const toClientProfile = profile => {
  if (!profile) return profile;

  const value = typeof profile.toObject === 'function'
    ? profile.toObject()
    : structuredClone(profile);

  ['resume', 'cqfo', 'coverLetter'].forEach(type => {
    const document = value[type] || {};

    value[type] = {
      fileName: document.fileName || '',
      fileUrl: document.fileUrl || '',
      mimeType: document.mimeType || '',
      uploadedAt: document.uploadedAt || null
    };
  });

  return value;
};

export const getProfile = async (req, res, next) => {
  try {
    const profile = await Profile.findOne({ user: req.user._id });
    if (!profile) {
      res.status(404);
      throw new Error('Profile not found');
    }
    res.status(200).json(toClientProfile(profile));
  } catch (error) { next(error); }
};

// @desc    Update profile (or add new data)
// @route   PUT /api/profile
export const updateProfile = async (req, res, next) => {
  try {
    const allowedSections = [
      'personalInfo',
      'contactInfo',
      'websitesAndSkills',
      'workHistory',
      'educationHistory',
      'eeo'
    ];

    const updatePayload = {};

    if (
      Object.prototype.hasOwnProperty.call(req.body, 'websitesAndSkills') &&
      req.body.websitesAndSkills &&
      typeof req.body.websitesAndSkills === 'object'
    ) {
      const invalidLinkFields = ['linkedin', 'github', 'twitter', 'portfolio']
        .filter(key => {
          const raw = cleanText(req.body.websitesAndSkills[key]);
          return raw && !normalizeHttpUrl(raw);
        });

      if (invalidLinkFields.length > 0) {
        return res.status(400).json({
          message: `Invalid website URL: ${invalidLinkFields.join(', ')}. Use a valid HTTP or HTTPS address.`
        });
      }
    }

    allowedSections.forEach(section => {
      if (Object.prototype.hasOwnProperty.call(req.body, section)) {
        updatePayload[section] = section === 'websitesAndSkills'
          ? cleanWebsitesAndSkills(req.body[section])
          : req.body[section];
      }
    });

    if (Object.keys(updatePayload).length === 0) {
      return res.status(400).json({
        message: 'No supported profile sections were provided.'
      });
    }

    const updatedProfile = await Profile.findOneAndUpdate(
      { user: req.user._id },
      { $set: updatePayload },
      { new: true, runValidators: true }
    );

    if (!updatedProfile) {
      res.status(404);
      throw new Error('Profile not found');
    }

    res.status(200).json(toClientProfile(updatedProfile));
  } catch (error) { next(error); }
};

// @desc    Replace the current resume file
// @route   POST /api/profile/upload-resume
export const uploadResume = async (req, res, next) => {
  let newStoragePath = '';

  try {
    if (!req.file) {
      return res.status(400).json({
        message: 'No resume uploaded.'
      });
    }

    let profile = await Profile.findOne({ user: req.user._id });

    if (!profile) {
      profile = await Profile.create({ user: req.user._id });
    }

    const documentContent = await extractDocumentContent(req.file);
    const rawText = documentContent.text;

    if (!rawText.trim()) {
      return res.status(400).json({
        message: 'No readable text was found in the resume.'
      });
    }

    const oldFileReference = getOldDocumentReference(profile.resume);

    const resumeMetadata = await uploadDocumentToFirebase(
      req.user._id,
      'resume',
      req.file,
      rawText
    );

    newStoragePath = resumeMetadata.storagePath;

    profile.resume = resumeMetadata;
    await profile.save();

    if (oldFileReference) {
      await deleteFirebaseFile(oldFileReference);
    }

    res.status(200).json({
      message: 'Resume replaced successfully.',
      resume: toClientProfile(profile).resume
    });
  } catch (error) {
    if (newStoragePath) {
      await deleteFirebaseFile(newStoragePath);
    }

    next(error);
  }
};
// @desc    Clear entirely ALL profile data
// @route   DELETE /api/profile/clear-all
export const clearEntireProfile = async (req, res, next) => {
  try {
    const emptyProfileData = {
      personalInfo: { firstName: '', lastName: '', preferredName: '', pronouns: '', languages: [] },
      contactInfo: { email: '', phone: '', addressLine1: '', addressLine2: '', city: '', state: '', country: '', postalCode: '' },
      websitesAndSkills: { linkedin: '', github: '', twitter: '', portfolio: '', skills: [] },
      workHistory: [],
      educationHistory: [],
      eeo: { optOut: false, authorizedToWork: '', requireVisaNow: '', requireVisaFuture: '', disability: '', veteran: '', gender: '', ethnicity: '', race: '', age: '', willingToRelocate: '' }
      // Note: We intentionally DO NOT clear the resume here. If they want to delete the file, they should do it explicitly.
    };

    const updatedProfile = await Profile.findOneAndUpdate(
      { user: req.user._id },
      { $set: emptyProfileData },
      { new: true }
    );

    res.status(200).json({
      message: 'Entire profile cleared',
      profile: toClientProfile(updatedProfile)
    });
  } catch (error) { next(error); }
};

// @desc    Clear a specific section of the profile
// @route   DELETE /api/profile/clear-section/:sectionName
export const clearProfileSection = async (req, res, next) => {
  try {
    const { sectionName } = req.params;
    
    // Define the valid sections and their empty states
    const validSections = {
      personalInfo: { firstName: '', lastName: '', preferredName: '', pronouns: '', languages: [] },
      contactInfo: { email: '', phone: '', addressLine1: '', addressLine2: '', city: '', state: '', country: '', postalCode: '' },
      websitesAndSkills: { linkedin: '', github: '', twitter: '', portfolio: '', skills: [] },
      workHistory: [],
      educationHistory: [],
      eeo: { optOut: false, authorizedToWork: '', requireVisaNow: '', requireVisaFuture: '', disability: '', veteran: '', gender: '', ethnicity: '', race: '', age: '', willingToRelocate: '' }
    };

    if (!validSections[sectionName]) {
      res.status(400);
      throw new Error('Invalid section name provided');
    }

    // Use dynamic key insertion to clear only the requested section
    const updatedProfile = await Profile.findOneAndUpdate(
      { user: req.user._id },
      { $set: { [sectionName]: validSections[sectionName] } },
      { new: true }
    );

    res.status(200).json({
      message: `${sectionName} cleared successfully`,
      profile: toClientProfile(updatedProfile)
    });
  } catch (error) { next(error); }
};

// @desc    Parse documents, rebuild profile data and replace uploaded files
// @route   POST /api/profile/parse-docs
export const parseDocumentsAndPopulateProfile = async (req, res, next) => {
  const newlyUploadedPaths = [];

  try {
    const uploadedFiles = getUploadedDocumentFiles(req);
    const uploadedTypes = Object.keys(uploadedFiles).filter(type => uploadedFiles[type]);

    if (uploadedTypes.length === 0) {
      return res.status(400).json({
        message: 'No documents uploaded for parsing.'
      });
    }

    let profile = await Profile.findOne({ user: req.user._id });

    if (!profile) {
      profile = await Profile.create({ user: req.user._id });
    }

    const parsedDocuments = {};

    for (const type of uploadedTypes) {
      const file = uploadedFiles[type];

      if (type === 'cqfo' && file.mimetype !== 'application/pdf') {
        return res.status(400).json({
          message: 'The CQFO must currently be uploaded as a PDF so highlighted selections can be read.'
        });
      }

      const documentContent = await extractDocumentContent(file, type === 'cqfo');

      if (!documentContent.text.trim()) {
        return res.status(400).json({
          message: `No readable text was found in ${file.originalname}.`
        });
      }

      parsedDocuments[type] = {
        file,
        rawText: documentContent.text,
        pageImages: documentContent.pageImages
      };
    }

    const latestDocumentText = {
      resume: parsedDocuments.resume?.rawText || profile.resume?.rawText || '',
      cqfo: parsedDocuments.cqfo?.rawText || profile.cqfo?.rawText || '',
      coverLetter: parsedDocuments.coverLetter?.rawText || profile.coverLetter?.rawText || ''
    };

    let combinedTextContent = '';

    for (const type of Object.keys(latestDocumentText)) {
      const rawText = latestDocumentText[type];

      if (rawText.trim()) {
        combinedTextContent += `\n--- ${DOCUMENT_LABELS[type]} ---\n${rawText}`;
      }
    }

    if (!combinedTextContent.trim()) {
      return res.status(400).json({
        message: 'No readable document context is available.'
      });
    }

    const extractedData = await extractProfileData({
      resumeText: latestDocumentText.resume,
      cqfoText: latestDocumentText.cqfo,
      coverLetterText: latestDocumentText.coverLetter,
      cqfoImages: parsedDocuments.cqfo?.pageImages || [],
      existingEeo: profile.eeo?.toObject?.() || profile.eeo || {},
      existingApplicationMemory:
        profile.applicationMemory?.toObject?.() ||
        profile.applicationMemory ||
        { answers: [] }
    });
    let structuredProfile = normalizeExtractedProfile(extractedData);

    structuredProfile = postProcessExtractedProfile(
      structuredProfile,
      latestDocumentText
    );

    validateExtractedProfile(
      structuredProfile,
      latestDocumentText,
      parsedDocuments.cqfo?.pageImages?.length > 0
    );

    console.log(
      'AI Extracted Data:',
      JSON.stringify(extractedData, null, 2)
    );

    const newDocumentMetadata = {};
    const oldDocumentReferences = [];

    for (const type of uploadedTypes) {
      const oldReference = getOldDocumentReference(profile[type]);

      if (oldReference) {
        oldDocumentReferences.push(oldReference);
      }

      const documentMetadata = await uploadDocumentToFirebase(
        req.user._id,
        type,
        parsedDocuments[type].file,
        parsedDocuments[type].rawText
      );

      newDocumentMetadata[type] = documentMetadata;
      newlyUploadedPaths.push(documentMetadata.storagePath);
    }

    const updatePayload = {
      ...structuredProfile,
      ...newDocumentMetadata
    };

    const updatedProfile = await Profile.findOneAndUpdate(
      { user: req.user._id },
      { $set: updatePayload },
      {
        new: true,
        runValidators: true,
        upsert: true,
        setDefaultsOnInsert: true
      }
    );

    for (const oldReference of oldDocumentReferences) {
      await deleteFirebaseFile(oldReference);
    }

    res.status(200).json({
      message: 'Documents replaced and profile rebuilt successfully.',
      replacedDocuments: uploadedTypes,
      profile: toClientProfile(updatedProfile)
    });
  } catch (error) {
    for (const storagePath of newlyUploadedPaths) {
      await deleteFirebaseFile(storagePath);
    }

    console.error('Document Parsing Error:', error);
    next(error);
  }
};

// @desc    Audit and answer supported application fields
// @route   POST /api/profile/answer-questions
export const answerApplicationQuestions = async (req, res, next) => {
  const startedAt = Date.now();
  const runtime = getWritingRuntimeInfo();

  let application = null;
  let inputCharacters = 0;

  try {
    let incomingFields = req.body.fields;

    if (
      !Array.isArray(incomingFields) &&
      Array.isArray(req.body.unansweredQuestions)
    ) {
      incomingFields = req.body.unansweredQuestions;
    }

    if (Array.isArray(incomingFields) && incomingFields.length > 300) {
      return res.status(400).json({
        message: 'A maximum of 300 application fields may be audited per request.'
      });
    }

    const fields = normalizeApplicationFields(
      incomingFields,
      cleanText(req.body.pageKey || req.body.pageIdentity)
    );

    if (fields.length === 0) {
      return res.status(400).json({
        message: 'No supported application fields were provided.'
      });
    }

    const profile = await Profile.findOne({
      user: req.user._id
    });

    if (!profile) {
      return res.status(404).json({
        message: 'Profile not found. Upload the client documents first.'
      });
    }

    const jobContext = normalizeJobContext(req.body);
    const applicationId = cleanText(req.body.applicationId);

    if (applicationId && !/^[a-f\d]{24}$/i.test(applicationId)) {
      return res.status(400).json({
        message: 'Invalid application ID.'
      });
    }

    if (applicationId) {
      application = await Application.findOne({
        _id: applicationId,
        user: req.user._id
      });

      if (!application) {
        return res.status(404).json({
          message: 'Application not found.'
        });
      }

      application.jobContext = jobContext;
      application.fields = mergeApplicationItemsByFieldId(
        application.fields,
        fields
      );
      application.status = 'analysing';
      application.errorMessage = '';
      await application.save();
    } else {
      application = await Application.create({
        user: req.user._id,
        atsPlatform: cleanText(req.body.atsPlatform) || 'generic',
        jobContext,
        fields,
        status: 'analysing'
      });
    }

    const profileData = profile.toObject();

    const candidateContext = {
      profile: {
        personalInfo: profileData.personalInfo,
        contactInfo: profileData.contactInfo,
        websitesAndSkills: profileData.websitesAndSkills,
        workHistory: profileData.workHistory,
        educationHistory: profileData.educationHistory,
        eeo: profileData.eeo
      },

      applicationMemory:
        profileData.applicationMemory?.answers || [],

      documents: {
        resume: {
          fileName: profileData.resume?.fileName || '',
          rawText: limitContextText(
            profileData.resume?.rawText,
            35000
          )
        },

        cqfo: {
          fileName: profileData.cqfo?.fileName || '',
          rawText: limitContextText(
            profileData.cqfo?.rawText,
            30000
          )
        },

        coverLetter: {
          fileName: profileData.coverLetter?.fileName || '',
          rawText: limitContextText(
            profileData.coverLetter?.rawText,
            20000
          )
        }
      }
    };

    inputCharacters = JSON.stringify({
      candidateContext,
      jobContext,
      fields
    }).length;

    const fieldBatches = [];
    for (let index = 0; index < fields.length; index += 35) {
      fieldBatches.push(fields.slice(index, index + 35));
    }

    const generatedAnswers = [];
    for (const fieldBatch of fieldBatches) {
      const batchResult = await generateFormAnswers({
        candidateContext,
        jobContext,
        fields: fieldBatch
      });

      if (Array.isArray(batchResult?.answers)) {
        generatedAnswers.push(...batchResult.answers);
      }
    }

    const result = { answers: generatedAnswers };

    let answers = normalizeGeneratedAnswers(
      result,
      fields,
      candidateContext
    );

    answers = applyAnswerReviewRules({
      answers,
      fields,
      jobContext,
      applicationMemory:
        profileData.applicationMemory?.answers || []
    });

    answers = applyStructuredAnswerFallbacks({
      answers,
      fields,
      profileData,
      jobContext
    });

    const aiFilled = answers.filter(answer => {
      return hasApplicationValue(answer.value);
    }).length;

    const unresolved = answers.length - aiFilled;

    application.answers = mergeApplicationItemsByFieldId(
      application.answers,
      answers
    );
    application.status = 'ready_for_review';
    application.errorMessage = '';

    const cumulativeAnswered = application.answers.filter(answer => {
      return hasApplicationValue(answer.value);
    }).length;

    const cumulativeUnresolved = application.answers.length -
      cumulativeAnswered;

    const cumulativeScriptFilled = application.fields.filter(field => {
      return field.valueOwner === 'deterministic' &&
        hasApplicationValue(field.currentValue);
    }).length;

    application.stats = {
      totalFields: application.fields.length,
      scriptFilled: Math.max(
        cumulativeScriptFilled,
        Number(req.body.scriptStats?.scriptFilled) || 0
      ),
      aiFilled: cumulativeAnswered,
      unresolved: cumulativeUnresolved
    };

    await application.save();

    await AIUsageLog.create({
      user: req.user._id,
      application: application._id,
      task: 'form_answers',
      provider: runtime.provider,
      model: runtime.model,
      inputCharacters,
      outputCharacters: JSON.stringify(result).length,
      durationMs: Date.now() - startedAt,
      success: true
    });

    res.status(200).json({
      message: 'Application fields analysed successfully.',
      applicationId: application._id,
      status: application.status,
      jobContext,
      requestedFields: fields.length,
      answeredFields: aiFilled,
      unresolvedFields: unresolved,
      answers
    });
  } catch (error) {
    if (application) {
      application.status = 'failed';
      application.errorMessage = error.message;

      try {
        await application.save();
      } catch (saveError) {
        console.error(
          'Could not save failed application:',
          saveError.message
        );
      }
    }

    try {
      await AIUsageLog.create({
        user: req.user._id,
        application: application?._id || null,
        task: 'form_answers',
        provider: runtime.provider,
        model: runtime.model,
        inputCharacters,
        outputCharacters: 0,
        durationMs: Date.now() - startedAt,
        success: false,
        errorMessage: error.message
      });
    } catch (logError) {
      console.error(
        'Could not save AI usage log:',
        logError.message
      );
    }

    console.error('AI Form Answering Error:', error);
    next(error);
  }
};
