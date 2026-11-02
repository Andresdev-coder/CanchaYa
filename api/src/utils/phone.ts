/** "+57 310 123 4567" -> "3101234567" */
export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 12 && digits.startsWith("57") ? digits.slice(2) : digits;
}