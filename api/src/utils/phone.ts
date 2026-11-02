import { z } from "zod";

/** "+57 310 123 4567" -> "3101234567" */
export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 12 && digits.startsWith("57") ? digits.slice(2) : digits;
}

/** Celular colombiano: 10 dígitos que empiezan por 3. Acepta espacios, guiones y el prefijo +57. */
export const mobilePhoneSchema = z
  .string()
  .transform(normalizePhone)
  .pipe(z.string().regex(/^3\d{9}$/, "Escribe un número de celular (10 dígitos)"));