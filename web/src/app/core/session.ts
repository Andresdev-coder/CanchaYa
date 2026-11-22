const KEY = 'canchaya_token';

/** El token de la sesión del dueño o del empleado. Solo existe en el navegador. */
export const session = {
  get(): string | null {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  set(token: string) {
    try {
      localStorage.setItem(KEY, token);
    } catch {
      /* sin almacenamiento disponible: la sesión dura solo mientras la pestaña esté abierta */
    }
  },
  clear() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* nada que borrar */
    }
  },
};
