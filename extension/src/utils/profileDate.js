const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const MONTH_LOOKUP = MONTH_NAMES.reduce((lookup, month, index) => {
  lookup[month.toLowerCase()] = index + 1;
  lookup[month.slice(0, 3).toLowerCase()] = index + 1;
  return lookup;
}, {});

MONTH_LOOKUP.sept = 9;

const buildMonthInputValue = (year, month) => {
  const numericYear = Number(year);
  const numericMonth = Number(month);

  if (
    !Number.isInteger(numericYear) ||
    numericYear < 1000 ||
    numericYear > 9999 ||
    !Number.isInteger(numericMonth) ||
    numericMonth < 1 ||
    numericMonth > 12
  ) {
    return '';
  }

  return `${numericYear}-${String(numericMonth).padStart(2, '0')}`;
};

export const toMonthInputValue = (value, fallbackMonth = 1) => {
  let text = String(value ?? '').trim();

  if (!text) return '';

  // Resume extractors sometimes preserve the complete range in one value.
  // A month input can only display one side, so use the first side for starts
  // and the final side for ends without splitting ISO values such as 2024-06.
  const rangeParts = text
    .split(/\s+(?:-|\u2013|\u2014|to|through|until)\s+/i)
    .map(part => part.trim())
    .filter(Boolean);
  if (rangeParts.length > 1) {
    text = fallbackMonth === 12
      ? rangeParts[rangeParts.length - 1]
      : rangeParts[0];
  }

  text = text
    .replace(/^(?:from|since|started|expected(?: graduation)?|graduated|graduation)\s*:?[\s-]*/i, '')
    .trim();

  let match = text.match(/^(\d{4})[./-](\d{1,2})(?:[./-]\d{1,2})?(?:[T\s].*)?$/);

  if (match) {
    return buildMonthInputValue(match[1], match[2]);
  }

  match = text.match(/^(\d{1,2})[./-](\d{4})$/);

  if (match) {
    return buildMonthInputValue(match[2], match[1]);
  }

  match = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);

  if (match) {
    const first = Number(match[1]);
    const second = Number(match[2]);
    const month = first > 12 ? second : first;
    return buildMonthInputValue(match[3], month);
  }

  match = text.match(/^(\d{4})$/);

  if (match) {
    return buildMonthInputValue(match[1], fallbackMonth);
  }

  const normalizedText = text
    .replace(/[.,/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  match = normalizedText.match(/^([A-Za-z]+)\s+(\d{4})$/);

  if (match) {
    const month = MONTH_LOOKUP[match[1].toLowerCase()];
    return buildMonthInputValue(match[2], month);
  }

  match = normalizedText.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);

  if (match) {
    const month = MONTH_LOOKUP[match[2].toLowerCase()];
    return buildMonthInputValue(match[3], month);
  }

  match = normalizedText.match(/^(\d{4})\s+([A-Za-z]+)$/);

  if (match) {
    const month = MONTH_LOOKUP[match[2].toLowerCase()];
    return buildMonthInputValue(match[1], month);
  }

  match = normalizedText.match(/^([A-Za-z]+)\s+\d{1,2}\s+(\d{4})$/);

  if (match) {
    const month = MONTH_LOOKUP[match[1].toLowerCase()];
    return buildMonthInputValue(match[2], month);
  }

  return '';
};

export const fromMonthInputValue = value => {
  const match = String(value ?? '').match(/^(\d{4})-(\d{2})$/);

  if (!match) return '';

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;

  if (
    year < 1000 ||
    year > 9999 ||
    monthIndex < 0 ||
    monthIndex >= MONTH_NAMES.length
  ) {
    return '';
  }

  return `${MONTH_NAMES[monthIndex]} ${year}`;
};
