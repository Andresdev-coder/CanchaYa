import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import type { OwnerCourt, PriceRule } from '../core/models';
import { CourtEditor } from './court-editor';

const api = environment.apiUrl;

const court = (over: Partial<OwnerCourt> = {}): OwnerCourt => ({
  id: 'c1', name: 'Cancha 1', sport: 'FOOTBALL', surface: 'Sintética', slotMinutes: 60, active: true,
  allowDeposit: true, depositAmount: 30000, allowFullPayment: true, sortOrder: 0, ...over,
});
const rule = (over: Partial<PriceRule> = {}): PriceRule => ({
  id: 'r1', weekdays: [1, 2, 3, 4, 5], start: '06:00', end: '17:00', pricePerHour: 70000, ...over,
});

let current: ComponentFixture<CourtEditor>;
/** Espera a que Angular termine de actualizar la pantalla. */
const settle = () => current.whenStable();

async function setup(inputs: { court?: OwnerCourt | null; prices?: PriceRule[] } = {}) {
  await TestBed.configureTestingModule({
    imports: [CourtEditor],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  }).compileComponents();
  const fixture = TestBed.createComponent(CourtEditor);
  current = fixture;
  if (inputs.court) fixture.componentRef.setInput('court', inputs.court);
  if (inputs.prices) fixture.componentRef.setInput('prices', inputs.prices);
  const saved = vi.fn();
  fixture.componentInstance.saved.subscribe(saved);
  await fixture.whenStable();

  const el = fixture.nativeElement as HTMLElement;
  const type = async (selector: string, value: string) => {
    const input = el.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };
  const press = async (text: string) => {
    const button = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes(text));
    if (!button) throw new Error(`No encontré el botón "${text}"`);
    button.click();
    await fixture.whenStable();
  };
  const submit = async () => {
    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
  };
  const saveButton = () => Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Guardar cancha'))!;
  return { fixture, el, type, press, submit, saveButton, saved, http: TestBed.inject(HttpTestingController) };
}

describe('CourtEditor', () => {
  it('crear: guarda la cancha y luego sus tarifas', async () => {
    const { el, type, submit, http, saved } = await setup();
    expect(el.textContent).toContain('Nueva cancha');

    await type('#court-name', 'Cancha 1');
    await type('#court-deposit', '30000');
    await type('input[placeholder="70000"]', '70000');
    await submit();

    const create = http.expectOne(`${api}/courts`);
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual({
      name: 'Cancha 1', sport: 'FOOTBALL', surface: null, slotMinutes: 60,
      allowDeposit: true, depositAmount: 30000, allowFullPayment: true,
    });
    create.flush(court({ id: 'nueva' }));

    const prices = http.expectOne(`${api}/courts/nueva/prices`);
    expect(prices.request.method).toBe('PUT');
    expect(prices.request.body).toEqual({
      rules: [{ weekdays: [0, 1, 2, 3, 4, 5, 6], start: '06:00', end: '22:00', pricePerHour: 70000 }],
    });
    prices.flush([]);
    await settle();
    expect(saved).toHaveBeenCalledTimes(1);
  });

  it('no deja guardar si falta algo, y dice qué', async () => {
    const { el, type, saveButton } = await setup();
    expect(saveButton().disabled).toBe(true);
    expect(el.textContent).toContain('Escribe el nombre de la cancha');

    await type('#court-name', 'Cancha 1');
    expect(el.textContent).toContain('Indica el valor del abono');

    await type('#court-deposit', '30000');
    expect(el.textContent).toContain('Escribe el precio por hora');

    await type('input[placeholder="70000"]', '70000');
    expect(saveButton().disabled).toBe(false);
  });

  it('sin abono no pide su valor y lo manda vacío', async () => {
    const { el, type, press, submit, http } = await setup();
    await type('#court-name', 'Cancha 2');
    await type('input[placeholder="70000"]', '70000');
    const checkbox = Array.from(el.querySelectorAll('label')).find((l) => l.textContent?.includes('Permitir abono'))!.querySelector('input')!;
    checkbox.click();
    await press('Todo').catch(() => undefined);
    await submit();

    expect(el.querySelector('#court-deposit')).toBeNull();
    const create = http.expectOne(`${api}/courts`);
    expect(create.request.body).toMatchObject({ allowDeposit: false, depositAmount: null });
  });

  it('editar: muestra lo guardado y manda los cambios a la cancha y a sus tarifas', async () => {
    const { el, type, submit, http, saved } = await setup({ court: court(), prices: [rule(), rule({ id: 'r2', start: '17:00', end: '22:00', pricePerHour: 90000 })] });
    expect(el.textContent).toContain('Editar cancha');
    expect(el.querySelector<HTMLInputElement>('#court-name')!.value).toBe('Cancha 1');
    expect(el.querySelector<HTMLInputElement>('#court-deposit')!.value).toBe('30000');
    expect(el.querySelectorAll('input[placeholder="70000"]')).toHaveLength(2);

    await type('#court-name', 'Cancha Principal');
    await submit();

    const patch = http.expectOne(`${api}/courts/c1`);
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toMatchObject({ name: 'Cancha Principal', depositAmount: 30000 });
    patch.flush(court({ name: 'Cancha Principal' }));

    const put = http.expectOne(`${api}/courts/c1/prices`);
    expect(put.request.body.rules).toEqual([
      { weekdays: [1, 2, 3, 4, 5], start: '06:00', end: '17:00', pricePerHour: 70000 },
      { weekdays: [1, 2, 3, 4, 5], start: '17:00', end: '22:00', pricePerHour: 90000 },
    ]);
    put.flush([]);
    await settle();
    expect(saved).toHaveBeenCalled();
  });

  it('avisa cuando dos franjas se cruzan y no deja guardar', async () => {
    const { el, saveButton } = await setup({ court: court(), prices: [rule(), rule({ id: 'r2', start: '16:00', end: '22:00' })] });
    expect(el.textContent).toContain('Hay franjas que se cruzan');
    expect(saveButton().disabled).toBe(true);
  });

  it('se puede quitar y agregar una franja', async () => {
    const { el, press } = await setup({ court: court(), prices: [rule()] });
    expect(el.querySelectorAll('input[placeholder="70000"]')).toHaveLength(1);
    await press('Agregar franja');
    expect(el.querySelectorAll('input[placeholder="70000"]')).toHaveLength(2);
    await press('Quitar');
    await press('Quitar');
    expect(el.querySelectorAll('input[placeholder="70000"]')).toHaveLength(0);
  });

  it('si la cancha se crea pero las tarifas fallan, el reintento no crea otra cancha', async () => {
    const { el, type, submit, http, saved } = await setup();
    await type('#court-name', 'Cancha 1');
    await type('#court-deposit', '30000');
    await type('input[placeholder="70000"]', '70000');
    await submit();

    http.expectOne(`${api}/courts`).flush(court({ id: 'nueva' }));
    http.expectOne(`${api}/courts/nueva/prices`).flush({ message: 'Error interno del servidor' }, { status: 500, statusText: 'Server Error' });
    await settle();
    expect(el.textContent).toContain('La cancha se creó, pero no se pudieron guardar las tarifas');
    expect(saved).not.toHaveBeenCalled();

    await submit();
    expect(http.match(`${api}/courts`)).toHaveLength(0); // no vuelve a crearla
    const patch = http.expectOne(`${api}/courts/nueva`);
    expect(patch.request.method).toBe('PATCH');
    patch.flush(court({ id: 'nueva' }));
    http.expectOne(`${api}/courts/nueva/prices`).flush([]);
    await settle();
    expect(saved).toHaveBeenCalledTimes(1);
  });

  it('desactivar manda active=false, y si hay reservas muestra el motivo', async () => {
    const { el, press, http, saved } = await setup({ court: court(), prices: [] });
    await press('Desactivar cancha');
    const req = http.expectOne(`${api}/courts/c1`);
    expect(req.request.body).toEqual({ active: false });
    req.flush({ message: 'No se puede desactivar: tiene 2 reserva(s) pendiente(s) o confirmada(s). Cancélalas primero.' }, { status: 409, statusText: 'Conflict' });
    await settle();
    expect(el.textContent).toContain('No se puede desactivar');
    expect(saved).not.toHaveBeenCalled();
  });

  it('una cancha inactiva se puede activar', async () => {
    const { el, press, http } = await setup({ court: court({ active: false }), prices: [] });
    expect(el.textContent).toContain('Activar cancha');
    await press('Activar cancha');
    expect(http.expectOne(`${api}/courts/c1`).request.body).toEqual({ active: true });
  });
});

