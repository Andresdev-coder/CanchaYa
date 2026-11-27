import { HttpErrorResponse } from '@angular/common/http';
import { friendlyError } from './api';

const http = (status: number, error: unknown = null) => new HttpErrorResponse({ status, error });

describe('friendlyError', () => {
  it('sin conexión, lo dice en claro', () => {
    expect(friendlyError(http(0))).toMatchObject({ status: 0 });
    expect(friendlyError(http(0)).message).toMatch(/No se pudo conectar/);
  });

  it('usa el mensaje que manda la API, y los errores por campo', () => {
    const e = friendlyError(http(400, { message: 'Datos inválidos', errors: [{ field: 'phone', message: 'Teléfono inválido' }] }));
    expect(e).toEqual({ status: 400, message: 'Datos inválidos', fields: { phone: 'Teléfono inválido' } });
  });

  it('el límite de intentos conserva el mensaje de la API, con el tiempo de espera', () => {
    const e = friendlyError(http(429, { message: 'Demasiados intentos. Espera 14 minutos e inténtalo de nuevo.' }));
    expect(e.status).toBe(429);
    expect(e.message).toBe('Demasiados intentos. Espera 14 minutos e inténtalo de nuevo.');
  });

  it('un 429 sin cuerpo (por ejemplo, de un proxy) también se explica', () => {
    expect(friendlyError(http(429)).message).toMatch(/muchas solicitudes seguidas/);
    expect(friendlyError(http(429, '<html>Too Many Requests</html>')).message).toMatch(/muchas solicitudes seguidas/);
  });

  it('un error sin mensaje da uno genérico, y algo que no es un error HTTP también', () => {
    expect(friendlyError(http(500)).message).toMatch(/Algo salió mal/);
    expect(friendlyError(new Error('x'))).toMatchObject({ status: -1 });
  });
});
