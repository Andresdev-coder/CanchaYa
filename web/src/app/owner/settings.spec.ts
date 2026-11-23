import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth';
import type { Establishment, OpeningHour } from '../core/models';
import { Settings } from './settings';

const api = environment.apiUrl;
const establishment: Establishment = {
  id: 'e1', slug: 'los-llanos', name: 'Complejo Los Llanos', city: 'Yopal', phone: null,
  timezone: 'America/Bogota', paymentInstructions: null,
};
const weekdays: OpeningHour[] = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, opens: '06:00', closes: '22:00' }));

let current: ComponentFixture<Settings>;
/** Espera a que Angular termine de actualizar la pantalla. */
const settle = () => current.whenStable();

async function setup(hours: OpeningHour[] = weekdays) {
  await TestBed.configureTestingModule({
    imports: [Settings],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  }).compileComponents();
  const auth = TestBed.inject(AuthService);
  auth.me.set({ user: { id: 'u1', name: 'Diana', email: 'd@test.com', role: 'OWNER', establishmentId: 'e1' }, establishment });

  const fixture = TestBed.createComponent(Settings);
  current = fixture;
  const http = TestBed.inject(HttpTestingController);
  await fixture.whenStable();
  http.expectOne(`${api}/establishment/hours`).flush(hours);
  await fixture.whenStable();

  const el = fixture.nativeElement as HTMLElement;
  const type = async (selector: string, value: string) => {
    const input = el.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };
  const submit = async (index: number) => {
    el.querySelectorAll('form')[index].dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
  };
  const dayRow = (label: string) => Array.from(el.querySelectorAll('li')).find((li) => li.textContent?.includes(label))!;
  return { fixture, el, auth, http, type, submit, dayRow };
}

describe('Mi establecimiento', () => {
  it('muestra los datos actuales y los días abiertos', async () => {
    const { el, dayRow } = await setup();
    expect(el.querySelector<HTMLInputElement>('#est-name')!.value).toBe('Complejo Los Llanos');
    expect(dayRow('Lunes').querySelector<HTMLInputElement>('input[type=checkbox]')!.checked).toBe(true);
    expect(dayRow('Domingo').querySelector<HTMLInputElement>('input[type=checkbox]')!.checked).toBe(false);
    expect(dayRow('Domingo').textContent).toContain('Cerrado');
  });

  it('guarda el nombre, el WhatsApp y cómo pagar, y actualiza lo que muestra la aplicación', async () => {
    const { el, auth, http, type, submit } = await setup();
    await type('#est-name', 'Complejo Los Llanos Yopal');
    await type('#est-phone', '+57 310 123 4567');
    await type('#est-pay', 'Nequi 310 123 4567 a nombre de Diana R.');
    await submit(0);

    const req = http.expectOne(`${api}/establishment`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({
      name: 'Complejo Los Llanos Yopal',
      phone: '3101234567',
      paymentInstructions: 'Nequi 310 123 4567 a nombre de Diana R.',
    });
    req.flush({ ...establishment, name: 'Complejo Los Llanos Yopal', phone: '3101234567', paymentInstructions: 'Nequi 310 123 4567 a nombre de Diana R.' });
    await settle();

    expect(auth.establishment()?.name).toBe('Complejo Los Llanos Yopal');
    expect(el.textContent).toContain('Datos guardados');
  });

  it('un teléfono o un texto vacío se mandan como null, para borrarlos', async () => {
    const { http, type, submit } = await setup();
    await type('#est-phone', '');
    await type('#est-pay', '   ');
    await submit(0);
    expect(http.expectOne(`${api}/establishment`).request.body).toMatchObject({ phone: null, paymentInstructions: null });
  });

  it('muestra el error de la API al guardar los datos', async () => {
    const { el, http, submit } = await setup();
    await submit(0);
    http.expectOne(`${api}/establishment`).flush(
      { message: 'Datos inválidos', errors: [{ field: 'phone', message: 'Teléfono inválido (solo dígitos, 7 a 15)' }] },
      { status: 400, statusText: 'Bad Request' },
    );
    await settle();
    expect(el.textContent).toContain('Teléfono inválido');
  });

  it('guarda el horario mandando solo los días abiertos', async () => {
    const { el, http, submit, dayRow } = await setup();
    dayRow('Sábado').querySelector<HTMLInputElement>('input[type=checkbox]')!.click(); // se abre
    dayRow('Lunes').querySelector<HTMLInputElement>('input[type=checkbox]')!.click(); // se cierra
    await submit(1);

    const req = http.expectOne(`${api}/establishment/hours`);
    expect(req.request.method).toBe('PUT');
    const days = (req.request.body as { days: OpeningHour[] }).days;
    expect(days.map((d) => d.weekday).sort()).toEqual([2, 3, 4, 5, 6]);
    expect(days.find((d) => d.weekday === 6)).toEqual({ weekday: 6, opens: '06:00', closes: '22:00' });
    req.flush(days);
    await settle();
    expect(el.textContent).toContain('Horario guardado');
  });

  it('"mismo horario todos los días" abre los siete días', async () => {
    const { el, http, submit } = await setup();
    const button = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('mismo horario'))!;
    button.click();
    await submit(1);
    const days = (http.expectOne(`${api}/establishment/hours`).request.body as { days: OpeningHour[] }).days;
    expect(days).toHaveLength(7);
  });

  it('no deja guardar un día que abre después de cerrar', async () => {
    const { el, fixture, dayRow } = await setup([{ weekday: 1, opens: '22:00', closes: '06:00' }]);
    expect(el.textContent).toContain('la hora de apertura debe ser menor que la de cierre');
    const save = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Guardar horario'))!;
    expect(save.disabled).toBe(true);
    dayRow('Lunes').querySelector<HTMLInputElement>('input[type=checkbox]')!.click(); // lo cierra
    await fixture.whenStable();
    expect(save.disabled).toBe(false);
  });

  it('un horario guardado con otra hora (por ejemplo 06:15) se conserva', async () => {
    const { dayRow } = await setup([{ weekday: 1, opens: '06:15', closes: '22:00' }]);
    const options = Array.from(dayRow('Lunes').querySelectorAll('select')[0].querySelectorAll('option')).map((o) => o.value);
    expect(options).toContain('06:15');
  });
});
