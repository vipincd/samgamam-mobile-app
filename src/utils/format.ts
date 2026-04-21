export function capitalizeLabel(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function formatCurrency(
  amountInCents: number,
  currency: string,
  locale = 'en',
) {
  if (!amountInCents) {
    return 'Free';
  }

  return new Intl.NumberFormat(locale, {
    currency,
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(amountInCents / 100);
}

export function formatEventDate(value: string, locale = 'en') {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    weekday: 'short',
  }).format(new Date(value));
}

export function formatDateTime(value: string, locale = 'en') {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

export function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function toShortName(value: string | null | undefined) {
  if (!value) {
    return 'there';
  }

  return value.split(' ')[0] ?? value;
}
