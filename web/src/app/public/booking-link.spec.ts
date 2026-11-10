import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import type { PlayerBooking } from '../core/models';
import { BookingLink } from './booking-link';

const booking = (over: Partial<PlayerBooking> = {}): PlayerBooking => ({
  status: 'PENDING',
  paymentChoice: 'AT_COURT',
  price: 90000,
  paid: 0,
  balance: 90000,
  paymentStatus: 'UNPAID',
  amountDue: 0,
  start: '2026-10-30T00:00:00.000Z',
  end: '2026-10-30T01:00:00.000Z',
  expiresAt: null,
  cancelReason: null,
  court: { name: 'Cancha 1', sport: 'FOOTBALL' },
  establishment: { slug: 'los-llanos', name: 'Complejo Los Llanos', city: 'Yopal', phone: '3101234567' },
  paymentInstructions: null,
  canCancel: true,
  ...over,
});

async function setup(response: PlayerBooking | 404) {
  await TestBed.configureTestingModule({
    imports: [BookingLink],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ token: 'abc' }) } } },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(BookingLink);
  const http = TestBed.inject(HttpTestingController);
  await fixture.whenStable();

  const req = http.expectOne((r) => r.url.endsWith('/public/bookings/abc'));
  if (response === 404) req.flush({ message: 'Reserva no encontrada' }, { status: 404, statusText: 'Not Found' });
  else req.flush(response);
  await fixture.whenStable();
  return { fixture, http, text: () => (fixture.nativeElement as HTMLElement).textContent ?? '' };
}

describe('BookingLink', () => {
  it('muestra la solicitud enviada con sus datos', async () => {
    const { text } = await setup(booking());
    expect(text()).toContain('¡Solicitud enviada!');
    expect(text()).toContain('Complejo Los Llanos');
    expect(text()).toContain('Cancha 1');
    expect(text()).toContain('Cancelar reserva');
  });

  it('con un abono pendiente, indica cuánto transferir y cómo', async () => {
    const { text } = await setup(booking({ amountDue: 30000, paymentInstructions: 'Nequi 310 123 4567' }));
    expect(text()).toContain('transfiere');
    expect(text()).toContain('Nequi 310 123 4567');
  });

  it('si ya hay un pago, no ofrece cancelar y explica por qué', async () => {
    const { text } = await setup(booking({ canCancel: false, paid: 30000, balance: 60000 }));
    expect(text()).not.toContain('Cancelar reserva');
    expect(text()).toContain('comunícate con el establecimiento');
  });

  it('una reserva cancelada se muestra como tal, sin enlace para guardar', async () => {
    const { text } = await setup(booking({ status: 'CANCELLED', canCancel: false }));
    expect(text()).toContain('Reserva cancelada');
    expect(text()).not.toContain('Guarda este enlace');
  });

  it('si el jugador la canceló, se lo dice con claridad', async () => {
    const { text } = await setup(
      booking({ status: 'CANCELLED', canCancel: false, cancelReason: 'Cancelada por el jugador' }),
    );
    expect(text()).toContain('Cancelaste esta reserva');
  });

  it('un enlace desconocido muestra que no se encontró', async () => {
    const { text } = await setup(404);
    expect(text()).toContain('No encontramos tu reserva');
  });
});
