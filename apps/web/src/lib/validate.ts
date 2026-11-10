/** Accept Urdu digits anywhere numbers are typed. */
export function toLatinDigits(text: string) {
  return text.replace(/[۰-۹٠-٩]/g, (digit) => {
    const code = digit.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

export function digitsOnly(text: string) {
  return toLatinDigits(text).replace(/\D/g, "");
}

/** Pakistani mobile numbers: 03XXXXXXXXX or +923XXXXXXXXX. */
export function isValidPhone(text: string) {
  return /^(?:\+?92|0)3\d{9}$/.test(toLatinDigits(text).replace(/[\s-]/g, ""));
}

export function isValidName(text: string) {
  return text.trim().length >= 2;
}

export function isValidYears(text: string) {
  if (!text) return true;
  const years = Number(text);
  return Number.isInteger(years) && years >= 0 && years <= 70;
}

export function isValidRate(text: string) {
  if (!text) return true;
  const rate = Number(text);
  return Number.isInteger(rate) && rate > 0 && rate <= 1_000_000;
}
