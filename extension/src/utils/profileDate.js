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

export const toMonthInputValue = value => {
  const text = String(value ?? '').trim();

  if (!text) return '';

  let match = text.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?(?:T.*)?$/);

  if (match) {
    return buildMonthInputValue(match[1], match[2]);
  }

  match = text.match(/^(\d{1,2})[/-](\d{4})$/);

  if (match) {
    return buildMonthInputValue(match[2], match[1]);
  }

  const normalizedText = text
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  match = normalizedText.match(/^([A-Za-z]+)\s+(\d{4})$/);

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