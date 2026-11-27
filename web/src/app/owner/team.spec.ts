import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth';
import type { TeamMember } from '../core/models';
import { Team } from './team';

const api = environment.apiUrl;
const member = (over: Partial<TeamMember> = {}): TeamMember => ({
  id: 's1', name: 'Mateo Giraldo', email: 'mateo@test.com', role: 'STAFF', active: true, createdAt: '2026-11-01T10:00:00.000Z', ...over,
});
const owner = member({ id: 'u1', name: 'Diana Restrepo', email: 'diana@test.com', role: 'OWNER' });

let current: ComponentFixture<Team>;
const settle = () => current.whenStable();

async function setup(members: TeamMember[] = [owner, member()]) {
  await TestBed.configureTestingModule({
    imports: [Team],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  }).compileComponents();
  TestBed.inject(AuthService).me.set({
    user: { id: 'u1', name: 'Diana Restrepo', email: 'diana@test.com', role: 'OWNER', establishmentId: 'e1' },
    establishment: { id: 'e1', slug: 'los-llanos', name: 'Los Llanos', city: 'Yopal', phone: null, timezone: 'America/Bogota', paymentInstructions: null },
  });
  const fixture = TestBed.createComponent(Team);
  current = fixture;
  const http = TestBed.inject(HttpTestingController);
  await fixture.whenStable();
  http.expectOne(`${api}/users`).flush(members);
  await fixture.whenStable();

  const el = fixture.nativeElement as HTMLElement;
  const press = async (text: string) => {
    const button = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes(text));
    if (!button) throw new Error(`No encontré el botón "${text}"`);
    button.click();
    await fixture.whenStable();
  };
  const type = async (selector: string, value: string) => {
    const input = el.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };
  const submit = async (form = 0) => {
    el.querySelectorAll('app-member-editor form')[form].dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
  };
  return { fixture, el, http, press, type, submit };
}

describe('Equipo', () => {
  it('lista al dueño y a los empleados con su estado', async () => {
    const { el } = await setup([owner, member(), member({ id: 's2', name: 'Laura Mejía', email: 'laura@test.com', active: false })]);
    const text = el.textContent ?? '';
    expect(text).toContain('Diana Restrepo');
    expect(text).toContain('(tú)');
    expect(text).toContain('Dueño');
    expect(text).toContain('Mateo Giraldo');
    expect(text).toContain('Empleado');
    expect(text).toContain('Desactivado');
  });

  it('el dueño no se puede editar desde aquí: solo los empleados son botones', async () => {
    const { el } = await setup();
    const rows = Array.from(el.querySelectorAll('li button'));
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('Mateo Giraldo');
  });

  it('si solo está el dueño, invita a agregar a alguien', async () => {
    const { el } = await setup([owner]);
    expect(el.textContent).toContain('Todavía no has agregado a nadie');
  });

  it('agrega a una persona y recarga la lista', async () => {
    const { el, http, press, type, submit, fixture } = await setup();
    await press('Agregar persona');
    expect(el.querySelector('app-member-editor')?.textContent).toContain('Agregar persona');

    await type('#m-name', 'Laura Mejía');
    await type('#m-email', ' Laura@Test.com ');
    await type('#m-pass', 'clave-segura-1');
    await submit();

    const req = http.expectOne(`${api}/users`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ name: 'Laura Mejía', email: 'laura@test.com', password: 'clave-segura-1' });
    req.flush(member({ id: 's2', name: 'Laura Mejía', email: 'laura@test.com' }));
    await fixture.whenStable();

    http.expectOne(`${api}/users`).flush([owner, member(), member({ id: 's2', name: 'Laura Mejía', email: 'laura@test.com' })]);
    await fixture.whenStable();
    expect(el.querySelector('app-member-editor')).toBeNull();
    expect(el.textContent).toContain('Laura Mejía');
  });

  it('"Generar" escribe una contraseña lista para entregar', async () => {
    const { el, press } = await setup();
    await press('Agregar persona');
    await press('Generar');
    expect(el.querySelector<HTMLInputElement>('#m-pass')!.value).toMatch(/^[A-Za-z0-9]{10}$/);
  });

  it('no deja agregar si falta algo, y explica qué', async () => {
    const { el, type } = await setup();
    (Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Agregar persona')) as HTMLButtonElement).click();
    await current.whenStable();
    await type('#m-name', 'Laura');
    const add = Array.from(el.querySelectorAll('app-member-editor button')).find((b) => b.textContent?.includes('Agregar al equipo')) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    expect(el.textContent).toContain('de al menos 8 caracteres');
    await type('#m-email', 'laura@test.com');
    await type('#m-pass', '1234567');
    expect(add.disabled).toBe(true);
    await type('#m-pass', '12345678');
    expect(add.disabled).toBe(false);
  });

  it('un correo repetido muestra el motivo y no cierra el formulario', async () => {
    const { el, http, press, type, submit } = await setup();
    await press('Agregar persona');
    await type('#m-name', 'Laura Mejía');
    await type('#m-email', 'mateo@test.com');
    await type('#m-pass', 'clave-segura-1');
    await submit();
    http.expectOne(`${api}/users`).flush({ message: 'Ese correo ya está registrado' }, { status: 409, statusText: 'Conflict' });
    await settle();
    expect(el.querySelector('app-member-editor')?.textContent).toContain('Ese correo ya está registrado');
    expect(el.querySelector('#m-name')).toBeTruthy();
  });

  it('un equipo lleno muestra el mensaje de la API', async () => {
    const { el, http, press, type, submit } = await setup();
    await press('Agregar persona');
    await type('#m-name', 'Laura Mejía');
    await type('#m-email', 'laura@test.com');
    await type('#m-pass', 'clave-segura-1');
    await submit();
    http.expectOne(`${api}/users`).flush({ message: 'Tu equipo ya tiene 10 personas activas. Desactiva a alguien para sumar a otra.' }, { status: 409, statusText: 'Conflict' });
    await settle();
    expect(el.textContent).toContain('10 personas activas');
  });

  it('editar: muestra su correo y guarda el nombre nuevo', async () => {
    const { el, http, press, type, submit, fixture } = await setup();
    await press('Mateo Giraldo');
    expect(el.querySelector('app-member-editor')?.textContent).toContain('mateo@test.com');
    expect(el.querySelector<HTMLInputElement>('#m-name')!.value).toBe('Mateo Giraldo');

    await type('#m-name', 'Mateo G.');
    await submit(0);
    const req = http.expectOne(`${api}/users/s1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ name: 'Mateo G.' });
    req.flush(member({ name: 'Mateo G.' }));
    await fixture.whenStable();
    http.expectOne(`${api}/users`).flush([owner, member({ name: 'Mateo G.' })]);
    await fixture.whenStable();
    expect(el.textContent).toContain('Mateo G.');
  });

  it('desactivar manda active=false y recarga la lista', async () => {
    const { el, http, press, fixture } = await setup();
    await press('Mateo Giraldo');
    await press('Desactivar a esta persona');
    const req = http.expectOne(`${api}/users/s1`);
    expect(req.request.body).toEqual({ active: false });
    req.flush(member({ active: false }));
    await fixture.whenStable();
    http.expectOne(`${api}/users`).flush([owner, member({ active: false })]);
    await fixture.whenStable();
    expect(el.textContent).toContain('Desactivado');
  });

  it('una persona desactivada se puede activar', async () => {
    const { http, press } = await setup([owner, member({ active: false })]);
    await press('Mateo Giraldo');
    await press('Activar a esta persona');
    expect(http.expectOne(`${api}/users/s1`).request.body).toEqual({ active: true });
  });

  it('restablecer la contraseña la manda, avisa que se cerraron sus sesiones y deja el panel abierto', async () => {
    const { el, http, press, type } = await setup();
    await press('Mateo Giraldo');
    const reset = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Restablecer contraseña')) as HTMLButtonElement;
    expect(reset.disabled).toBe(true);

    await type('#m-reset', 'otra-clave-nueva-9');
    expect(reset.disabled).toBe(false);
    reset.click();
    await settle();

    const req = http.expectOne(`${api}/users/s1`);
    expect(req.request.body).toEqual({ password: 'otra-clave-nueva-9' });
    req.flush(member());
    await settle();
    expect(el.querySelector('app-member-editor')?.textContent).toContain('sus sesiones abiertas se cerraron');
  });
});
