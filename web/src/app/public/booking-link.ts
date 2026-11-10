import { ChangeDetectionStrategy, Component, afterNextRender, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Api, friendlyError } from '../core/api';
import {
  PAYMENT_LABEL,
  SPORT_LABEL,
  capitalize,
  formatClock,
  formatCOP,
  formatLongDate,
  waLink,
} from '../core/format';
import type { BookingStatus, PlayerBooking } from '../core/models';

type Tone = 'pending' | 'ok' | 'off';

const HEADLINE: Record<BookingStatus, { tone: Tone; title: string }> = {
  PENDING: { tone: 'pending', title: '¡Solicitud enviada!' },
  CONFIRMED: { tone: 'ok', title: '¡Reserva confirmada!' },
  CANCELLED: { tone: 'off', title: 'Reserva cancelada' },
  COMPLETED: { tone: 'ok', title: 'Partido terminado' },
  NO_SHOW: { tone: 'off', title: 'Marcada como no asistió' },
};

const STATUS_LABEL: Record<BookingStatus, string> = {
  PENDING: 'Por confirmar',
  CONFIRMED: 'Confirmada',
  CANCELLED: 'Cancelada',
  COMPLETED: 'Completada',
  NO_SHOW: 'No asistió',
};

@Component({
  selector: 'app-booking-link',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="mx-auto w-full max-w-lg px-5 pb-16 pt-12">
      @if (loading()) {
        <p class="py-24 text-center text-muted" aria-live="polite">Cargando tu reserva…</p>
      } @else if (booking(); as b) {
        <div
          class="mx-auto grid size-[72px] place-items-center rounded-full"
          [class.bg-lime]="tone() !== 'off'"
          [class.bg-taken]="tone() === 'off'"
          aria-hidden="true"
        >
          @if (tone() === 'pending') {
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#10231C" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
            </svg>
          } @else if (tone() === 'ok') {
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#10231C" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          } @else {
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#53635B" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          }
        </div>

        <h1 class="mt-5 text-center text-3xl font-extrabold">{{ headline().title }}</h1>
        <p class="mt-2 text-center text-muted">{{ subtitle() }}</p>

        <dl class="mt-7 rounded-2xl border border-line bg-white px-5 py-1.5">
          @for (row of rows(); track row.label) {
            <div class="flex items-center justify-between gap-4 border-b border-line py-3 last:border-0">
              <dt class="text-muted">{{ row.label }}</dt>
              <dd class="text-right font-bold">{{ row.value }}</dd>
            </div>
          }
        </dl>

        @if (b.amountDue > 0) {
          <section class="mt-4 rounded-2xl border-2 border-ink bg-white p-4">
            <p class="font-extrabold">Para asegurar tu cupo, transfiere {{ cop(b.amountDue) }}</p>
            @if (b.paymentInstructions) {
              <p class="mt-2 text-sm whitespace-pre-line">{{ b.paymentInstructions }}</p>
              <p class="mt-2 text-sm text-muted">Luego envía el comprobante por WhatsApp.</p>
            } @else {
              <p class="mt-2 text-sm text-muted">Pregunta al establecimiento por WhatsApp cómo hacer el pago.</p>
            }
          </section>
        }

        @if (b.status === 'PENDING' || b.status === 'CONFIRMED') {
          <section class="mt-4 rounded-2xl border border-line bg-white p-4">
            <p class="font-extrabold">Guarda este enlace</p>
            <p class="mt-1 text-sm text-muted">Con él puedes ver o cancelar tu reserva, sin crear cuenta.</p>
            <div class="mt-3 flex items-center gap-2">
              <span class="min-w-0 flex-1 truncate rounded-lg bg-taken/60 px-3 py-2.5 text-sm font-bold">{{ url() }}</span>
              <button type="button" class="min-h-10 shrink-0 rounded-lg bg-ink px-4 text-sm font-extrabold text-lime" (click)="copy()">
                {{ copied() ? 'Copiado' : 'Copiar' }}
              </button>
            </div>
          </section>
        }

        <div class="mt-8 flex flex-col gap-2">
          @if (whatsapp(); as link) {
            <a class="btn-primary grid place-items-center" [href]="link" target="_blank" rel="noopener">
              Escribir al establecimiento
            </a>
          }

          @if (error()) {
            <p role="alert" class="rounded-xl bg-white p-3 text-center text-sm font-semibold text-danger">{{ error() }}</p>
          }

          @if (b.canCancel) {
            @if (confirming()) {
              <div class="rounded-2xl bg-white p-4 text-center">
                <p class="font-bold">¿Seguro que quieres cancelar tu reserva?</p>
                <div class="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" class="btn-outline" (click)="confirming.set(false)">No, mantenerla</button>
                  <button type="button" class="btn-primary" [disabled]="cancelling()" (click)="cancel()">
                    {{ cancelling() ? 'Cancelando…' : 'Sí, cancelar' }}
                  </button>
                </div>
              </div>
            } @else {
              <button type="button" class="btn-text" (click)="confirming.set(true)">Cancelar reserva</button>
            }
          } @else if (b.status === 'PENDING' || b.status === 'CONFIRMED') {
            <p class="text-center text-sm text-muted">
              @if (b.paid > 0) {
                Ya hay un pago registrado. Para cancelar, comunícate con el establecimiento.
              } @else {
                Ya no se puede cancelar desde aquí.
              }
            </p>
          }
        </div>
      } @else {
        <div class="py-24 text-center">
          <h1 class="text-2xl font-extrabold">{{ error() || 'No encontramos tu reserva' }}</h1>
          <p class="mt-3 text-muted">Revisa que el enlace esté completo.</p>
          <a routerLink="/" class="mt-6 inline-block font-bold underline">Ir al inicio</a>
        </div>
      }
    </main>
  `,
})
export class BookingLink {
  private readonly api = inject(Api);
  private readonly token = inject(ActivatedRoute).snapshot.paramMap.get('token') ?? '';

  protected readonly cop = formatCOP;
  protected readonly loading = signal(true);
  protected readonly booking = signal<PlayerBooking | null>(null);
  protected readonly error = signal('');
  protected readonly confirming = signal(false);
  protected readonly cancelling = signal(false);
  protected readonly copied = signal(false);
  protected readonly url = signal('');

  protected readonly headline = computed(() => HEADLINE[this.booking()?.status ?? 'PENDING']);
  protected readonly tone = computed(() => this.headline().tone);

  protected readonly subtitle = computed(() => {
    const b = this.booking();
    if (!b) return '';
    switch (b.status) {
      case 'PENDING':
        return `${b.establishment.name} la confirmará por WhatsApp.`;
      case 'CONFIRMED':
        return `Te esperamos en ${b.establishment.name}.`;
      case 'CANCELLED':
        return b.cancelReason === 'Venció sin confirmar'
          ? 'Venció porque el establecimiento no alcanzó a confirmarla.'
          : 'Esta reserva ya no está activa.';
      default:
        return b.establishment.name;
    }
  });

  protected readonly rows = computed(() => {
    const b = this.booking();
    if (!b) return [];
    const rows = [
      { label: 'Establecimiento', value: b.establishment.name },
      { label: 'Cancha', value: `${b.court.name} · ${SPORT_LABEL[b.court.sport]}` },
      { label: 'Fecha', value: capitalize(formatLongDate(b.start)) },
      { label: 'Hora', value: `${formatClock(b.start)} a ${formatClock(b.end)}` },
      { label: 'Precio', value: formatCOP(b.price) },
      { label: 'Pago elegido', value: PAYMENT_LABEL[b.paymentChoice] },
    ];
    if (b.paid > 0) rows.push({ label: 'Pagado', value: `${formatCOP(b.paid)} · falta ${formatCOP(Math.max(b.balance, 0))}` });
    rows.push({ label: 'Estado', value: STATUS_LABEL[b.status] });
    return rows;
  });

  protected readonly whatsapp = computed(() => {
    const b = this.booking();
    if (!b) return null;
    const text = `Hola, tengo una reserva en ${b.establishment.name} para el ${formatLongDate(b.start)} a las ${formatClock(b.start)}.`;
    return waLink(b.establishment.phone, text);
  });

  constructor() {
    afterNextRender(() => {
      this.url.set(window.location.href);
      this.api.booking(this.token).subscribe({
        next: (b) => {
          this.booking.set(b);
          this.loading.set(false);
        },
        error: (err: unknown) => {
          const e = friendlyError(err);
          this.error.set(e.status === 404 || e.status === 400 ? '' : e.message);
          this.loading.set(false);
        },
      });
    });
  }

  protected copy() {
    void navigator.clipboard.writeText(this.url()).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }

  protected cancel() {
    this.cancelling.set(true);
    this.error.set('');
    this.api.cancel(this.token).subscribe({
      next: (b) => {
        this.booking.set(b);
        this.confirming.set(false);
        this.cancelling.set(false);
      },
      error: (err: unknown) => {
        this.error.set(friendlyError(err).message);
        this.confirming.set(false);
        this.cancelling.set(false);
      },
    });
  }
}
