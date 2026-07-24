import Profile from '../models/Profile.js';
import { storage } from '../config/firebase.js';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { extractProfileData, generateFormAnswers } from '../services/llmService.js';

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

    websitesAndSkills: {
      linkedin: cleanText(data.websitesAndSkills?.linkedin),
      github: cleanText(data.websitesAndSkills?.github),
      twitter: cleanText(data.websitesAndSkills?.twitter),
      portfolio: cleanText(data.websitesAndSkills?.portfolio),
      skills: cleanStringArray(data.websitesAndSkills?.skills)
    },

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
      age: cleanText(data.eeo?.age)
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

  let answers = enrichAuthorizationMemory(profileData, cqfoText);

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
      aliases: MEMORY_ALIASES.race || [
        'racial background',
        'race category'
      ],
      source: 'cqfo',
      sensitive: true,
      confidence: 1
    });
  }

  profileData.workHistory = correctEmploymentTypes(
    profileData.workHistory
  );

  const interviewAvailability = findMemoryAnswer(
    answers,
    'interviewAvailability'
  );

  if (interviewAvailability) {
    interviewAvailability.answer = normalizeInterviewTime(
      interviewAvailability.answer
    );
  }

  answers = addMemoryAliases(answers);

  profileData.applicationMemory = {
    ...profileData.applicationMemory,
    answers
  };

  return profileData;
};

const limitContextText = (value, maxLength) => {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
};

const cleanFieldOptions = (options) => {
  if (!Array.isArray(options)) return [];

  return [...new Set(
    options
      .map(option => typeof option === 'string' ? option.trim() : option?.label?.trim())
      .filter(Boolean)
  )].slice(0, 50);
};

const normalizeApplicationFields = (fields) => {
  if (!Array.isArray(fields)) return [];

  const usedIds = new Set();

  return fields.slice(0, 40).map((field, index) => {
    const item = typeof field === 'string' ? { label: field } : field;
    const label = cleanText(item?.label || item?.question);
    let fieldId = cleanText(item?.fieldId || item?.id || item?.name);

    if (!fieldId) fieldId = `field_${index + 1}`;
    if (usedIds.has(fieldId)) fieldId = `${fieldId}_${index + 1}`;

    usedIds.add(fieldId);

    return {
      fieldId: fieldId.slice(0, 200),
      label: label.slice(0, 1000),
      type: cleanText(item?.type || 'text').slice(0, 50),
      required: item?.required === true,
      options: cleanFieldOptions(item?.options),
      currentValue: item?.currentValue ?? '',
      maxLength: Number.isFinite(Number(item?.maxLength)) ? Number(item.maxLength) : null
    };
  }).filter(field => field.label);
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


const validateExtractedProfile = (profileData, documentText, usedCqfoVision) => {
  const errors = [];

  if (documentText.resume.trim() && profileData.workHistory.length === 0) {
    errors.push('No work history was extracted from the resume.');
  }

  if (
    documentText.resume.toLowerCase().includes('education') &&
    profileData.educationHistory.length === 0
  ) {
    errors.push('No education history was extracted.');
  }

  if (
    usedCqfoVision &&
    profileData.applicationMemory.answers.length < 5
  ) {
    errors.push('The CQFO visual extraction returned too few reusable answers.');
  }

  if (!profileData.personalInfo.firstName && !profileData.personalInfo.lastName) {
    errors.push('The candidate name was not extracted.');
  }

  if (errors.length > 0) {
    throw new Error(`Document extraction validation failed: ${errors.join(' ')}`);
  }
};

// @desc    Get current user's profile
// @route   GET /api/profile
export const getProfile = async (req, res, next) => {
  try {
    const profile = await Profile.findOne({ user: req.user._id });
    if (!profile) {
      res.status(404);
      throw new Error('Profile not found');
    }
    res.status(200).json(profile);
  } catch (error) { next(error); }
};

// @desc    Update profile (or add new data)
// @route   PUT /api/profile
export const updateProfile = async (req, res, next) => {
  try {
    // Finds the profile and updates only the fields provided in req.body
    const updatedProfile = await Profile.findOneAndUpdate(
      { user: req.user._id },
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!updatedProfile) {
      res.status(404);
      throw new Error('Profile not found');
    }

    res.status(200).json(updatedProfile);
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
      resume: profile.resume
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
      eeo: { optOut: false, authorizedToWork: '', requireVisaNow: '', requireVisaFuture: '', disability: '', veteran: '', gender: '', ethnicity: '', race: '', age: '' }
      // Note: We intentionally DO NOT clear the resume here. If they want to delete the file, they should do it explicitly.
    };

    const updatedProfile = await Profile.findOneAndUpdate(
      { user: req.user._id },
      { $set: emptyProfileData },
      { new: true }
    );

    res.status(200).json({ message: 'Entire profile cleared', profile: updatedProfile });
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
      eeo: { optOut: false, authorizedToWork: '', requireVisaNow: '', requireVisaFuture: '', disability: '', veteran: '', gender: '', ethnicity: '', race: '', age: '' }
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

    res.status(200).json({ message: `${sectionName} cleared successfully`, profile: updatedProfile });
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
      profile: updatedProfile
    });
  } catch (error) {
    for (const storagePath of newlyUploadedPaths) {
      await deleteFirebaseFile(storagePath);
    }

    console.error('Document Parsing Error:', error);
    next(error);
  }
};

// @desc    Answer unresolved application fields using profile, memory and job context
// @route   POST /api/profile/answer-questions
export const answerApplicationQuestions = async (req, res, next) => {
  try {
    let incomingFields = req.body.fields;

    // Temporary support for the previous request format
    if (!Array.isArray(incomingFields) && Array.isArray(req.body.unansweredQuestions)) {
      incomingFields = req.body.unansweredQuestions;
    }

    const fields = normalizeApplicationFields(incomingFields);

    if (fields.length === 0) {
      return res.status(400).json({
        message: 'No valid unresolved application fields were provided.'
      });
    }

    const profile = await Profile.findOne({ user: req.user._id });

    if (!profile) {
      return res.status(404).json({
        message: 'Profile not found. Upload the client documents first.'
      });
    }

    const profileData = profile.toObject();
    const jobContext = normalizeJobContext(req.body);

    const candidateContext = {
      profile: {
        personalInfo: profileData.personalInfo,
        contactInfo: profileData.contactInfo,
        websitesAndSkills: profileData.websitesAndSkills,
        workHistory: profileData.workHistory,
        educationHistory: profileData.educationHistory,
        eeo: profileData.eeo
      },

      applicationMemory: profileData.applicationMemory?.answers || [],

      documents: {
        resume: {
          fileName: profileData.resume?.fileName || '',
          rawText: limitContextText(profileData.resume?.rawText, 35000)
        },
        cqfo: {
          fileName: profileData.cqfo?.fileName || '',
          rawText: limitContextText(profileData.cqfo?.rawText, 30000)
        },
        coverLetter: {
          fileName: profileData.coverLetter?.fileName || '',
          rawText: limitContextText(profileData.coverLetter?.rawText, 20000)
        }
      }
    };

    const hasCandidateContext =
      candidateContext.documents.resume.rawText ||
      candidateContext.documents.cqfo.rawText ||
      candidateContext.documents.coverLetter.rawText ||
      candidateContext.applicationMemory.length > 0;

    if (!hasCandidateContext) {
      return res.status(400).json({
        message: 'No profile or document context is available for this client.'
      });
    }

    const result = await generateFormAnswers({
      candidateContext,
      jobContext,
      fields
    });

    const answers = Array.isArray(result?.answers) ? result.answers : [];

    res.status(200).json({
      message: 'Application fields analysed successfully.',
      jobContext,
      requestedFields: fields.length,
      answeredFields: answers.filter(item => item.value !== '' && item.value !== null).length,
      answers
    });
  } catch (error) {
    console.error('AI Form Answering Error:', error);
    next(error);
  }
};