import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../environments/environment';
import type { OpeningHour, OwnerCourt, PriceRule } from '../core/models';
import { Courts } from './courts';

const api = environment.apiUrl;
const court = (over: Partial<OwnerCourt> = {}): OwnerCourt => ({
  id: 'c1', name: 'Cancha 1', sport: 'FOOTBALL', surface: 'Sintética', slotMinutes: 60, active: true,
  allowDeposit: true, depositAmount: 30000, allowFullPayment: true, sortOrder: 0, ...over,
});
const day: PriceRule = { weekdays: [1, 2, 3, 4, 5], start: '06:00', end: '17:00', pricePerHour: 70000 };
const night: PriceRule = { weekdays: [1, 2, 3, 4, 5], start: '17:00', end: '22:00', pricePerHour: 90000 };
const hours: OpeningHour[] = [{ weekday: 1, opens: '06:00', closes: '22:00' }];

async function setup(data: { courts: OwnerCourt[]; prices?: Record<string, PriceRule[]>; hours?: OpeningHour[] }) {
  await TestBed.configureTestingModule({
    imports: [Courts],
    providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
  }).compileComponents();
  const fixture = TestBed.createComponent(Courts);
  const http = TestBed.inject(HttpTestingController);
  await fixture.whenStable();

  http.expectOne((r) => r.url === `${api}/courts`).flush(data.courts);
  http.expectOne(`${api}/establishment/hours`).flush(data.hours ?? hours);
  await fixture.whenStable();
  for (const c of data.courts) http.expectOne(`${api}/courts/${c.id}/prices`).flush(data.prices?.[c.id] ?? []);
  await fixture.whenStable();

  const el = fixture.nativeElement as HTMLElement;
  const press = async (text: string) => {
    const button = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes(text));
    if (!button) throw new Error(`No encontré el botón "${text}"`);
    button.click();
    await fixture.whenStable();
  };
  return { fixture, el, http, press };
}

describe('Canchas y precios', () => {
  it('lista cada cancha con el resumen de sus tarifas', async () => {
    const { el } = await setup({ courts: [court()], prices: { c1: [day, night] } });
    const text = el.textContent ?? '';
    expect(text).toContain('Cancha 1');
    expect(text).toContain('Fútbol');
    expect(text).toContain('Sintética');
    expect(text).toContain('Activa');
    expect(text).toMatch(/Lun a Vie · 6:00 am a 5:00 pm · \$\s?70\.000 la hora/);
    expect(text).toMatch(/Lun a Vie · 5:00 pm a 10:00 pm · \$\s?90\.000 la hora/);
  });

  it('avisa de la cancha sin tarifas y de las inactivas', async () => {
    const { el } = await setup({ courts: [court(), court({ id: 'c2', name: 'Cancha 2', active: false })], prices: { c1: [day] } });
    expect(el.textContent).toContain('Sin tarifas');
    expect(el.textContent).toContain('Inactiva');
  });

  it('avisa cuando falta el horario de atención, con el enlace para definirlo', async () => {
    const { el } = await setup({ courts: [court()], prices: { c1: [day] }, hours: [] });
    expect(el.textContent).toContain('Falta tu horario de atención');
    expect(el.querySelector('a[href="/app/establecimiento"]')).toBeTruthy();
  });

  it('con horario no muestra ese aviso', async () => {
    const { el } = await setup({ courts: [court()], prices: { c1: [day] } });
    expect(el.textContent).not.toContain('Falta tu horario de atención');
  });

  it('sin canchas invita a crear la primera', async () => {
    const { el } = await setup({ courts: [] });
    expect(el.textContent).toContain('Aún no tienes canchas');
  });

  it('al elegir una cancha se abre su editor con lo guardado', async () => {
    const { el, press } = await setup({ courts: [court()], prices: { c1: [day] } });
    await press('Cancha 1');
    expect(el.querySelector('app-court-editor')?.textContent).toContain('Editar cancha');
    expect(el.querySelector<HTMLInputElement>('#court-name')!.value).toBe('Cancha 1');
  });

  it('"Agregar cancha" abre el editor vacío', async () => {
    const { el, press } = await setup({ courts: [] });
    await press('Agregar cancha');
    expect(el.querySelector('app-court-editor')?.textContent).toContain('Nueva cancha');
  });

  it('al guardar, vuelve a cargar la lista', async () => {
    const { fixture, el, http, press } = await setup({ courts: [court()], prices: { c1: [day] } });
    await press('Cancha 1');
    const form = el.querySelector('app-court-editor form')!;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();

    http.expectOne(`${api}/courts/c1`).flush(court({ name: 'Cancha 1' }));
    http.expectOne(`${api}/courts/c1/prices`).flush([day]);
    await fixture.whenStable();

    http.expectOne((r) => r.url === `${api}/courts`).flush([court({ name: 'Cancha Principal' })]);
    http.expectOne(`${api}/establishment/hours`).flush(hours);
    await fixture.whenStable();
    http.expectOne(`${api}/courts/c1/prices`).flush([day]);
    await fixture.whenStable();

    expect(el.querySelector('app-court-editor')).toBeNull();
    expect(el.textContent).toContain('Cancha Principal');
  });
});
