/** Sin los caracteres que se confunden al leerlos (0, O, 1, l, I). */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Una contraseña al azar para entregársela a un empleado, que luego la cambia en «Mi cuenta». */
export function generatePassword(length = 10) {
  // Se descartan los valores que sesgarían la elección hacia los primeros caracteres.
  const limit = 256 - (256 % ALPHABET.length);
  let result = '';
  while (result.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length))) {
      if (byte < limit && result.length < length) result += ALPHABET[byte % ALPHABET.length];
    }
  }
  return result;
}
