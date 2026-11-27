import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth';
import { session } from '../core/session';
import { Account } from './account';

const api = environment.apiUrl;
let current: ComponentFixture<Account>;
const settle = () => current.whenStable();

async function setup() {
  session.set('sesion-vieja');
  await TestBed.configureTestingModule({
    imports: [Account],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  }).compileComponents();
  TestBed.inject(AuthService).me.set({
    user: { id: 'u1', name: 'Mateo Giraldo', email: 'mateo@test.com', role: 'STAFF', establishmentId: 'e1' },
    establishment: { id: 'e1', slug: 'los-llanos', name: 'Los Llanos', city: 'Yopal', phone: null, timezone: 'America/Bogota', paymentInstructions: null },
  });
  const fixture = TestBed.createComponent(Account);
  current = fixture;
  await fixture.whenStable();

  const el = fixture.nativeElement as HTMLElement;
  const type = async (id: string, value: string) => {
    const input = el.querySelector<HTMLInputElement>(`#${id}`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };
  const fill = async (currentPassword: string, next: string, again = next) => {
    await type('current', currentPassword);
    await type('next', next);
    await type('again', again);
  };
  const submit = async () => {
    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
  };
  const button = () => el.querySelector<HTMLButtonElement>('button[type=submit]')!;
  return { el, fill, submit, button, type, http: TestBed.inject(HttpTestingController) };
}

describe('Mi cuenta', () => {
  beforeEach(() => session.clear());

  it('muestra quién eres', async () => {
    const { el } = await setup();
    expect(el.textContent).toContain('Mateo Giraldo');
    expect(el.textContent).toContain('mateo@test.com');
    expect(el.textContent).toContain('Empleado');
  });

  it('no dice nada hasta que empiezas a escribir, y luego explica qué falta', async () => {
    const { el, fill, button, type } = await setup();
    expect(button().disabled).toBe(true);
    expect(el.textContent).not.toContain('Escribe tu contraseña actual');

    await type('next', 'abc');
    expect(el.textContent).toContain('Escribe tu contraseña actual');

    await fill('clave-vieja-1', '123');
    expect(el.textContent).toContain('al menos 8 caracteres');
    await fill('clave-vieja-1', 'clave-vieja-1');
    expect(el.textContent).toContain('distinta de la actual');
    await fill('clave-vieja-1', 'clave-nueva-22', 'clave-nueva-23');
    expect(el.textContent).toContain('no coinciden');
    expect(button().disabled).toBe(true);

    await fill('clave-vieja-1', 'clave-nueva-22');
    expect(button().disabled).toBe(false);
  });

  it('cambia la contraseña, guarda la sesión nueva y limpia el formulario', async () => {
    const { el, fill, submit, http } = await setup();
    await fill('clave-vieja-1', 'clave-nueva-22');
    await submit();

    const req = http.expectOne(`${api}/auth/change-password`);
    expect(req.request.body).toEqual({ currentPassword: 'clave-vieja-1', newPassword: 'clave-nueva-22' });
    req.flush({ token: 'sesion-nueva' });
    await settle();

    expect(session.get()).toBe('sesion-nueva');
    expect(el.textContent).toContain('Contraseña cambiada');
    expect(el.querySelector<HTMLInputElement>('#current')!.value).toBe('');
    expect(el.querySelector<HTMLInputElement>('#next')!.value).toBe('');
  });

  it('con la contraseña actual equivocada muestra el motivo y no toca la sesión', async () => {
    const { el, fill, submit, http } = await setup();
    session.set('sesion-vieja');
    await fill('no-es-esa', 'clave-nueva-22');
    await submit();
    http.expectOne(`${api}/auth/change-password`).flush({ message: 'La contraseña actual no es correcta' }, { status: 400, statusText: 'Bad Request' });
    await settle();

    expect(el.textContent).toContain('La contraseña actual no es correcta');
    expect(session.get()).toBe('sesion-vieja');
    expect(el.textContent).not.toContain('Contraseña cambiada');
  });

  it('si se pasó el límite de intentos, lo explica', async () => {
    const { el, fill, submit, http } = await setup();
    await fill('no-es-esa', 'clave-nueva-22');
    await submit();
    http.expectOne(`${api}/auth/change-password`).flush({ message: 'Demasiados intentos. Espera 14 minutos e inténtalo de nuevo.' }, { status: 429, statusText: 'Too Many Requests' });
    await settle();
    expect(el.textContent).toContain('Demasiados intentos. Espera 14 minutos');
  });
});
