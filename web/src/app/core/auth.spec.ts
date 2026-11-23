import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';
import { firstValueFrom, isObservable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth';
import { authGuard, guestGuard, ownerGuard } from './guards';
import type { Me } from './models';
import { session } from './session';

const me: Me = {
  user: { id: 'u1', name: 'Diana', email: 'diana@test.com', role: 'OWNER', establishmentId: 'e1' },
  establishment: { id: 'e1', slug: 'los-llanos', name: 'Complejo Los Llanos', city: 'Yopal', phone: null, timezone: 'America/Bogota', paymentInstructions: null },
};

function setup() {
  TestBed.configureTestingModule({
    providers: [provideRouter([{ path: 'ingresar', children: [] }]), provideHttpClient(), provideHttpClientTesting()],
  });
  return { auth: TestBed.inject(AuthService), http: TestBed.inject(HttpTestingController) };
}

const runGuard = async (guard: typeof authGuard) => {
  const result = TestBed.runInInjectionContext(() => guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot));
  if (!isObservable(result)) throw new Error('la guarda debía devolver un Observable');
  return (await firstValueFrom(result)) as boolean | UrlTree;
};

describe('AuthService', () => {
  beforeEach(() => session.clear());

  it('al ingresar guarda el token y carga al usuario', async () => {
    const { auth, http } = setup();
    const done = firstValueFrom(auth.login('diana@test.com', '12345678'));

    http.expectOne(`${environment.apiUrl}/auth/login`).flush({ token: 'abc', user: me.user });
    expect(session.get()).toBe('abc');
    http.expectOne(`${environment.apiUrl}/auth/me`).flush(me);
    await done;

    expect(auth.user()?.name).toBe('Diana');
    expect(auth.establishment()?.slug).toBe('los-llanos');
    expect(auth.isOwner()).toBe(true);
  });

  it('al registrarse deja la sesión iniciada sin pedir nada más', async () => {
    const { auth, http } = setup();
    const done = firstValueFrom(
      auth.register({ establishmentName: 'Complejo Los Llanos', name: 'Diana', email: 'diana@test.com', password: '12345678' }),
    );
    http.expectOne(`${environment.apiUrl}/auth/register`).flush({ token: 'xyz', user: me.user, establishment: me.establishment });
    await done;

    expect(session.get()).toBe('xyz');
    expect(auth.establishment()?.name).toBe('Complejo Los Llanos');
    http.verify();
  });

  it('sin token no hay sesión y no se pide nada a la API', async () => {
    const { auth, http } = setup();
    expect(await firstValueFrom(auth.restore())).toBe(false);
    http.verify();
  });

  it('con un token válido recupera la sesión, y la segunda vez no vuelve a pedirla', async () => {
    session.set('abc');
    const { auth, http } = setup();
    const first = firstValueFrom(auth.restore());
    http.expectOne(`${environment.apiUrl}/auth/me`).flush(me);
    expect(await first).toBe(true);

    expect(await firstValueFrom(auth.restore())).toBe(true);
    http.verify();
  });

  it('con un token vencido borra la sesión guardada', async () => {
    session.set('viejo');
    const { auth, http } = setup();
    const result = firstValueFrom(auth.restore());
    http.expectOne(`${environment.apiUrl}/auth/me`).flush({ message: 'Token inválido' }, { status: 401, statusText: 'Unauthorized' });

    expect(await result).toBe(false);
    expect(session.get()).toBeNull();
  });

  it('al cerrar sesión borra el token y al usuario', () => {
    session.set('abc');
    const { auth } = setup();
    auth.me.set(me);
    auth.logout();
    expect(session.get()).toBeNull();
    expect(auth.user()).toBeNull();
  });
});

describe('guardas de las rutas', () => {
  beforeEach(() => session.clear());

  it('la zona privada manda a ingresar a quien no tiene sesión', async () => {
    setup();
    const result = await runGuard(authGuard);
    expect(result).not.toBe(true);
    expect((result as UrlTree).toString()).toBe('/ingresar');
  });

  it('la zona privada deja pasar a quien ya tiene sesión', async () => {
    const { auth } = setup();
    auth.me.set(me);
    expect(await runGuard(authGuard)).toBe(true);
  });

  it('ingresar y registrarse mandan a la agenda a quien ya tiene sesión', async () => {
    const { auth } = setup();
    auth.me.set(me);
    expect((await runGuard(guestGuard)) as UrlTree).toBeTruthy();
  });

  it('ingresar y registrarse están abiertas para quien no tiene sesión', async () => {
    setup();
    expect(await runGuard(guestGuard)).toBe(true);
  });

  it('la configuración deja pasar al dueño', async () => {
    const { auth } = setup();
    auth.me.set(me);
    expect(await runGuard(ownerGuard)).toBe(true);
  });

  it('la configuración manda a la agenda al empleado', async () => {
    const { auth } = setup();
    auth.me.set({ ...me, user: { ...me.user, role: 'STAFF' } });
    const result = await runGuard(ownerGuard);
    expect(result).not.toBe(true);
    expect((result as UrlTree).toString()).toBe('/app');
  });
});
