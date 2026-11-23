import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth';
import { bogotaDate } from '../core/format';
import type { OpeningHour, OwnerBooking, OwnerCourt } from '../core/models';
import { Agenda } from './agenda';

const api = environment.apiUrl;
const at = (time: string) => new Date(`${bogotaDate()}T${time}:00-05:00`).toISOString();

const court = (over: Partial<OwnerCourt> = {}): OwnerCourt => ({
  id: 'c1', name: 'Cancha 1', sport: 'FOOTBALL', surface: 'Sintética', slotMinutes: 60, active: true,
  allowDeposit: true, depositAmount: 30000, allowFullPayment: true, sortOrder: 0, ...over,
});

const booking = (over: Partial<OwnerBooking> = {}): OwnerBooking => ({
  id: 'b1', status: 'PENDING', source: 'ONLINE', paymentChoice: 'AT_COURT', price: 90000, paid: 0, balance: 90000,
  paymentStatus: 'UNPAID', payments: [], start: at('19:00'), end: at('20:00'), note: null, expiresAt: null,
  cancelReason: null, createdAt: at('10:00'), court: { id: 'c1', name: 'Cancha 1', sport: 'FOOTBALL' },
  customer: { id: 'p1', name: 'Camilo Torres', phone: '3105550100' }, ...over,
});

const everyDay: OpeningHour[] = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opens: '06:00', closes: '22:00' }));

async function setup(data: { bookings?: OwnerBooking[]; courts?: OwnerCourt[]; fail?: boolean } = {}) {
  await TestBed.configureTestingModule({
    imports: [Agenda],
    providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
  }).compileComponents();

  const auth = TestBed.inject(AuthService);
  auth.me.set({
    user: { id: 'u1', name: 'Diana', email: 'd@test.com', role: 'OWNER', establishmentId: 'e1' },
    establishment: { id: 'e1', slug: 'los-llanos', name: 'Los Llanos', city: 'Yopal', phone: null, timezone: 'America/Bogota', paymentInstructions: null },
  });

  const fixture = TestBed.createComponent(Agenda);
  const http = TestBed.inject(HttpTestingController);
  await fixture.whenStable();

  const bookingsReq = http.expectOne((r) => r.url === `${api}/bookings`);
  const courtsReq = http.expectOne((r) => r.url === `${api}/courts`);
  const hoursReq = http.expectOne(`${api}/establishment/hours`);
  if (data.fail) {
    // Cuando una de las tres peticiones falla, las otras dos se cancelan solas.
    bookingsReq.flush({ message: 'Error interno del servidor' }, { status: 500, statusText: 'Server Error' });
  } else {
    bookingsReq.flush(data.bookings ?? []);
    courtsReq.flush(data.courts ?? [court()]);
    hoursReq.flush(everyDay);
  }
  await fixture.whenStable();
  return { fixture, http, el: fixture.nativeElement as HTMLElement };
}

const press = async (fixture: ComponentFixture<Agenda>, text: string, index = 0) => {
  const matches = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).filter((b) =>
    b.textContent?.includes(text),
  );
  if (!matches[index]) throw new Error(`No encontré un botón con "${text}"`);
  matches[index].click();
  await fixture.whenStable();
};

describe('Agenda', () => {
  it('muestra las cifras del día y cada reserva con su estado', async () => {
    const { el } = await setup({
      bookings: [
        booking(),
        booking({ id: 'b2', status: 'CONFIRMED', paymentStatus: 'PARTIAL', paid: 30000, balance: 60000, start: at('20:00'), end: at('21:00'), customer: { id: 'p2', name: 'Laura Mejía', phone: '3105550101' } }),
      ],
    });
    const text = el.textContent ?? '';
    expect(text).toMatch(/2\s*reservas/);
    expect(text).toMatch(/1\s*por confirmar/);
    expect(text).toContain('Camilo Torres');
    expect(text).toContain('Por confirmar');
    expect(text).toContain('Con abono');
    expect(text).toContain('Cancha 1');
  });

  it('una sola reserva se escribe en singular', async () => {
    const { el } = await setup({ bookings: [booking()] });
    expect(el.textContent).toMatch(/1\s*reserva(?!s)/);
  });

  it('sin canchas, el dueño ve el enlace para configurarlas y el empleado no', async () => {
    const owner = await setup({ courts: [] });
    expect(owner.el.querySelector('a[href="/app/canchas"]')).toBeTruthy();
    TestBed.resetTestingModule();

    const staff = await setup({ courts: [] });
    TestBed.inject(AuthService).me.update((m) => (m ? { ...m, user: { ...m.user, role: 'STAFF' } } : m));
    await staff.fixture.whenStable();
    expect(staff.el.querySelector('a[href="/app/canchas"]')).toBeNull();
  });

  it('sin canchas configuradas lo dice y no deja crear reservas', async () => {
    const { el } = await setup({ courts: [] });
    expect(el.textContent).toContain('Todavía no hay canchas configuradas');
    const button = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Nueva reserva'))!;
    expect(button.disabled).toBe(true);
  });

  it('un día sin reservas lo dice', async () => {
    const { el } = await setup();
    expect(el.textContent).toContain('No hay reservas este día');
  });

  it('si la carga falla, muestra el error', async () => {
    const { el } = await setup({ fail: true });
    expect(el.textContent).toContain('Error interno del servidor');
  });

  it('al elegir una reserva se abre su detalle con las acciones de su estado', async () => {
    const { fixture, el } = await setup({ bookings: [booking()] });
    await press(fixture, 'Camilo Torres');

    const detail = el.querySelector('app-booking-detail');
    expect(detail).toBeTruthy();
    expect(detail?.textContent).toContain('Confirmar reserva');
    expect(detail?.textContent).toContain('Registrar pago');
    expect(detail?.textContent).toContain('Cancelar reserva');
    expect(detail?.textContent).toContain('3105550100');
  });

  it('confirmar la reserva actualiza la agenda', async () => {
    const { fixture, http, el } = await setup({ bookings: [booking()] });
    await press(fixture, 'Camilo Torres');
    await press(fixture, 'Confirmar reserva');

    http.expectOne(`${api}/bookings/b1/confirm`).flush(booking({ status: 'CONFIRMED' }));
    await fixture.whenStable();

    expect(el.querySelector('app-booking-detail')?.textContent).not.toContain('Confirmar reserva');
    expect(el.querySelector('app-booking-detail')?.textContent).toContain('Confirmada');
  });

  it('registrar un pago manda el valor y el método, y muestra lo pagado', async () => {
    const { fixture, http, el } = await setup({ bookings: [booking({ status: 'CONFIRMED' })] });
    await press(fixture, 'Camilo Torres');
    await press(fixture, 'Registrar pago');

    const amount = el.querySelector<HTMLInputElement>('#amount')!;
    expect(amount.value).toBe('90000'); // por defecto, lo que falta
    amount.value = '30000';
    amount.dispatchEvent(new Event('input'));
    await press(fixture, 'Transferencia');
    await press(fixture, 'Guardar pago');

    const req = http.expectOne(`${api}/bookings/b1/payments`);
    expect(req.request.body).toEqual({ amount: 30000, method: 'TRANSFER' });
    req.flush(
      booking({
        status: 'CONFIRMED', paymentStatus: 'PARTIAL', paid: 30000, balance: 60000,
        payments: [{ id: 'pay1', amount: 30000, method: 'TRANSFER', note: null, createdAt: at('12:00'), voided: false, voidReason: null }],
      }),
    );
    await fixture.whenStable();

    expect(el.querySelector('app-booking-detail')?.textContent).toMatch(/Transferencia/);
    expect(el.querySelector('app-booking-detail')?.textContent).toMatch(/60\.000/);
  });

  it('un pago que la API rechaza muestra el motivo y no cierra el formulario', async () => {
    const { fixture, http, el } = await setup({ bookings: [booking({ status: 'CONFIRMED' })] });
    await press(fixture, 'Camilo Torres');
    await press(fixture, 'Registrar pago');
    await press(fixture, 'Guardar pago');

    http
      .expectOne(`${api}/bookings/b1/payments`)
      .flush({ message: 'El pago supera lo que falta por pagar (60000)' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();

    expect(el.querySelector('app-booking-detail')?.textContent).toContain('El pago supera lo que falta por pagar');
    expect(el.querySelector('#amount')).toBeTruthy();
  });

  it('cancelar quita la reserva de la agenda y cierra el detalle', async () => {
    const { fixture, http, el } = await setup({ bookings: [booking()] });
    await press(fixture, 'Camilo Torres');
    await press(fixture, 'Cancelar reserva');

    const reason = el.querySelector<HTMLInputElement>('#reason')!;
    reason.value = 'No contestó';
    reason.dispatchEvent(new Event('input'));
    await press(fixture, 'Confirmar cancelación');

    const req = http.expectOne(`${api}/bookings/b1/cancel`);
    expect(req.request.body).toEqual({ reason: 'No contestó' });
    req.flush(booking({ status: 'CANCELLED', cancelReason: 'No contestó' }));
    await fixture.whenStable();

    expect(el.querySelector('app-booking-detail')).toBeNull();
    expect(el.textContent).not.toContain('Camilo Torres');
    expect(el.textContent).toContain('No hay reservas este día');
  });

  it('solo el dueño puede anular pagos', async () => {
    const paid = booking({
      status: 'CONFIRMED', paymentStatus: 'PARTIAL', paid: 30000, balance: 60000,
      payments: [{ id: 'pay1', amount: 30000, method: 'CASH', note: null, createdAt: at('12:00'), voided: false, voidReason: null }],
    });
    const owner = await setup({ bookings: [paid] });
    await press(owner.fixture, 'Camilo Torres');
    expect(owner.el.querySelector('app-booking-detail')?.textContent).toContain('Anular');
    TestBed.resetTestingModule();

    const staff = await setup({ bookings: [paid] });
    TestBed.inject(AuthService).me.update((m) => (m ? { ...m, user: { ...m.user, role: 'STAFF' } } : m));
    await press(staff.fixture, 'Camilo Torres');
    await staff.fixture.whenStable();
    expect(staff.el.querySelector('app-booking-detail')?.textContent).not.toContain('Anular');
  });

  it('el día siguiente pide otra fecha a la API', async () => {
    const { fixture, http } = await setup();
    await press(fixture, '›');
    const tomorrow = http.expectOne((r) => r.url === `${api}/bookings`);
    expect(tomorrow.request.params.get('date')).not.toBe(bogotaDate());
    tomorrow.flush([]);
    http.expectOne((r) => r.url === `${api}/courts`).flush([court()]);
    http.expectOne(`${api}/establishment/hours`).flush(everyDay);
  });
});
