import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { environment } from '../../environments/environment';
import { session } from '../core/session';
import { Login } from './login';

async function setup() {
  session.clear();
  await TestBed.configureTestingModule({
    imports: [Login],
    providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
  }).compileComponents();
  const fixture = TestBed.createComponent(Login);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const type = async (id: string, value: string) => {
    const input = el.querySelector<HTMLInputElement>(`#${id}`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };
  const submit = async () => {
    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
  };
  return { fixture, el, type, submit, http: TestBed.inject(HttpTestingController), router: TestBed.inject(Router) };
}

describe('Login', () => {
  it('el botón espera a que estén el correo y la contraseña', async () => {
    const { el, type } = await setup();
    const button = el.querySelector<HTMLButtonElement>('button[type=submit]')!;
    expect(button.disabled).toBe(true);
    await type('email', 'diana@test.com');
    await type('password', '12345678');
    expect(button.disabled).toBe(false);
  });

  it('ingresa, guarda la sesión y lleva a la agenda', async () => {
    const { type, submit, http, router } = await setup();
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    await type('email', ' Diana@Test.com ');
    await type('password', '12345678');
    await submit();

    const login = http.expectOne(`${environment.apiUrl}/auth/login`);
    expect(login.request.body).toEqual({ email: 'diana@test.com', password: '12345678' });
    login.flush({ token: 'abc', user: { id: 'u1', name: 'Diana', email: 'diana@test.com', role: 'OWNER', establishmentId: 'e1' } });
    http.expectOne(`${environment.apiUrl}/auth/me`).flush({
      user: { id: 'u1', name: 'Diana', email: 'diana@test.com', role: 'OWNER', establishmentId: 'e1' },
      establishment: { id: 'e1', slug: 'los-llanos', name: 'Los Llanos', city: 'Yopal', phone: null, timezone: 'America/Bogota', paymentInstructions: null },
    });
    await Promise.resolve();

    expect(session.get()).toBe('abc');
    expect(navigate).toHaveBeenCalledWith(['/app']);
  });

  it('con credenciales incorrectas muestra el mensaje de la API y no guarda nada', async () => {
    const { fixture, el, type, submit, http } = await setup();
    await type('email', 'diana@test.com');
    await type('password', 'mala-clave');
    await submit();

    http
      .expectOne(`${environment.apiUrl}/auth/login`)
      .flush({ message: 'Correo o contraseña incorrectos' }, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();

    expect(el.textContent).toContain('Correo o contraseña incorrectos');
    expect(session.get()).toBeNull();
  });
});
