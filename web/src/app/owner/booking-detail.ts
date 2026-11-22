import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import type { WritableSignal } from '@angular/core';
import { Observable } from 'rxjs';
import { friendlyError } from '../core/api';
import { AuthService } from '../core/auth';
import { PAYMENT_LABEL, SPORT_LABEL, capitalize, formatClock, formatCOP, formatLongDate, waLink } from '../core/format';
import type { BookingStatus, OwnerBooking, PaymentMethod } from '../core/models';
import { OwnerApi } from '../core/owner-api';

const STATUS_LABEL: Record<BookingStatus, string> = {
  PENDING: 'Por confirmar',
  CONFIRMED: 'Confirmada',
  CANCELLED: 'Cancelada',
  COMPLETED: 'Completada',
  NO_SHOW: 'No asistió',
};

type Mode = 'none' | 'pay' | 'cancel' | 'void';

/** El panel con todo lo que se puede hacer con una reserva: confirmar, cobrar, cancelar y cerrar el partido. */
@Component({
  selector: 'app-booking-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex h-full flex-col">
      <div class="flex items-start justify-between gap-3 border-b border-line p-5">
        <div class="min-w-0">
          <p class="text-xs font-extrabold tracking-wider text-muted uppercase">Reserva</p>
          <h2 class="mt-1 truncate text-2xl font-extrabold">{{ booking().customer.name }}</h2>
          <p class="mt-1 text-sm font-bold">{{ statusLabel() }}</p>
        </div>
        <button type="button" class="chip size-11 shrink-0 px-0" aria-label="Cerrar" (click)="closed.emit()">✕</button>
      </div>

      <div class="flex-1 space-y-5 overflow-y-auto p-5">
        <dl>
          @for (row of rows(); track row.label) {
            <div class="flex items-start justify-between gap-4 border-b border-line py-2.5 text-sm">
              <dt class="text-muted">{{ row.label }}</dt>
              <dd class="text-right font-bold">{{ row.value }}</dd>
            </div>
          }
        </dl>

        @if (booking().payments.length > 0) {
          <section>
            <h3 class="text-xs font-extrabold tracking-wider text-muted uppercase">Pagos</h3>
            <ul class="mt-2 space-y-2">
              @for (p of booking().payments; track p.id) {
                <li class="flex items-center justify-between gap-3 rounded-xl bg-soft px-3 py-2 text-sm">
                  <span [class.line-through]="p.voided" [class.text-muted]="p.voided">
                    <b>{{ cop(p.amount) }}</b> · {{ p.method === 'CASH' ? 'Efectivo' : 'Transferencia' }}
                    @if (p.note) {
                      <span class="block text-xs text-muted">{{ p.note }}</span>
                    }
                    @if (p.voided) {
                      <span class="block text-xs no-underline">Anulado: {{ p.voidReason }}</span>
                    }
                  </span>
                  @if (isOwner() && !p.voided) {
                    <button type="button" class="min-h-9 shrink-0 text-xs font-bold text-danger" (click)="startVoid(p.id)">Anular</button>
                  }
                </li>
              }
            </ul>
          </section>
        }

        @if (error()) {
          <p role="alert" class="rounded-xl bg-soft p-3 text-sm font-semibold text-danger">{{ error() }}</p>
        }

        @switch (mode()) {
          @case ('pay') {
            <form class="space-y-3 rounded-2xl border border-line p-4" (submit)="$event.preventDefault(); submitPay()">
              <label class="block text-sm font-bold" for="amount">Valor</label>
              <input id="amount" class="field" type="number" inputmode="numeric" min="1" [value]="amount()" (input)="onInput(amount, $event)" />
              <div class="grid grid-cols-2 gap-2">
                <button type="button" class="chip" [attr.aria-pressed]="method() === 'CASH'" (click)="method.set('CASH')">Efectivo</button>
                <button type="button" class="chip" [attr.aria-pressed]="method() === 'TRANSFER'" (click)="method.set('TRANSFER')">Transferencia</button>
              </div>
              <label class="block text-sm font-bold" for="note">Nota (opcional)</label>
              <input id="note" class="field" [value]="note()" (input)="onInput(note, $event)" />
              <button type="submit" class="btn-primary" [disabled]="busy() || !amountOk()">Guardar pago</button>
              <button type="button" class="btn-text" (click)="back()">Volver</button>
            </form>
          }
          @case ('cancel') {
            <form class="space-y-3 rounded-2xl border border-line p-4" (submit)="$event.preventDefault(); submitCancel()">
              <label class="block text-sm font-bold" for="reason">Motivo (opcional)</label>
              <input id="reason" class="field" [value]="reason()" (input)="onInput(reason, $event)" />
              <button type="submit" class="btn-primary" [disabled]="busy()">Confirmar cancelación</button>
              <button type="button" class="btn-text" (click)="back()">Volver</button>
            </form>
          }
          @case ('void') {
            <form class="space-y-3 rounded-2xl border border-line p-4" (submit)="$event.preventDefault(); submitVoid()">
              <label class="block text-sm font-bold" for="voidReason">Motivo de la anulación</label>
              <input id="voidReason" class="field" [value]="reason()" (input)="onInput(reason, $event)" />
              <button type="submit" class="btn-primary" [disabled]="busy() || reason().trim().length < 3">Anular pago</button>
              <button type="button" class="btn-text" (click)="back()">Volver</button>
            </form>
          }
          @default {
            <div class="flex flex-col gap-2">
              @if (booking().status === 'PENDING') {
                <button type="button" class="btn-primary" [disabled]="busy()" (click)="confirm()">Confirmar reserva</button>
              }
              @if (canPay()) {
                <button type="button" class="btn-outline" (click)="startPay()">Registrar pago</button>
              }
              @if (canFinish()) {
                <div class="grid grid-cols-2 gap-2">
                  <button type="button" class="btn-outline" [disabled]="busy()" (click)="finish('complete')">Completada</button>
                  <button type="button" class="btn-outline" [disabled]="busy()" (click)="finish('no-show')">No asistió</button>
                </div>
              }
              @if (whatsapp(); as link) {
                <a class="btn-outline grid place-items-center" [href]="link" target="_blank" rel="noopener">Escribir por WhatsApp</a>
              }
              @if (isActive()) {
                <button type="button" class="btn-text" (click)="startCancel()">Cancelar reserva</button>
              }
            </div>
          }
        }
      </div>
    </div>
  `,
})
export class BookingDetail {
  readonly booking = input.required<OwnerBooking>();
  readonly isOwner = input(false);
  readonly changed = output<OwnerBooking>();
  readonly closed = output<void>();

  private readonly api = inject(OwnerApi);
  private readonly auth = inject(AuthService);

  protected readonly cop = formatCOP;
  protected readonly mode = signal<Mode>('none');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly amount = signal('');
  protected readonly method = signal<PaymentMethod>('CASH');
  protected readonly note = signal('');
  protected readonly reason = signal('');
  private voidTarget = '';

  protected readonly statusLabel = computed(() => STATUS_LABEL[this.booking().status]);
  protected readonly isActive = computed(() => ['PENDING', 'CONFIRMED'].includes(this.booking().status));
  protected readonly canPay = computed(() => this.booking().status !== 'CANCELLED' && this.booking().balance > 0);
  protected readonly amountOk = computed(() => {
    const value = Number(this.amount());
    return Number.isInteger(value) && value >= 1;
  });

  protected readonly rows = computed(() => {
    const b = this.booking();
    const rows = [
      { label: 'Cancha', value: `${b.court.name} · ${SPORT_LABEL[b.court.sport]}` },
      { label: 'Fecha', value: capitalize(formatLongDate(b.start)) },
      { label: 'Hora', value: `${formatClock(b.start)} a ${formatClock(b.end)}` },
      { label: 'Celular', value: b.customer.phone },
      { label: 'Precio', value: formatCOP(b.price) },
      { label: 'Pago elegido', value: PAYMENT_LABEL[b.paymentChoice] },
      { label: 'Pagado', value: formatCOP(b.paid) },
      { label: 'Falta', value: formatCOP(Math.max(b.balance, 0)) },
      { label: 'Origen', value: b.source === 'MANUAL' ? 'Por teléfono' : 'En línea' },
    ];
    if (b.note) rows.push({ label: 'Nota', value: b.note });
    if (b.cancelReason) rows.push({ label: 'Motivo de cancelación', value: b.cancelReason });
    return rows;
  });

  protected readonly whatsapp = computed(() => {
    const b = this.booking();
    const first = b.customer.name.split(' ')[0];
    const place = this.auth.establishment()?.name ?? 'el establecimiento';
    const when = `${formatLongDate(b.start)} a las ${formatClock(b.start)}`;
    const text =
      b.status === 'PENDING'
        ? `Hola ${first}, te escribimos de ${place} sobre tu reserva del ${when}. ¿La confirmamos?`
        : `Hola ${first}, te escribimos de ${place} sobre tu reserva del ${when}.`;
    return waLink(b.customer.phone, text);
  });

  /** Se evalúa al pintar: un partido se puede cerrar cuando ya empezó. */
  protected canFinish() {
    const b = this.booking();
    return b.status === 'CONFIRMED' && Date.parse(b.start) <= Date.now();
  }

  protected onInput(target: WritableSignal<string>, event: Event) {
    target.set((event.target as HTMLInputElement).value);
  }

  protected back() {
    this.mode.set('none');
    this.error.set('');
  }

  protected startPay() {
    this.error.set('');
    this.amount.set(String(Math.max(this.booking().balance, 0)));
    this.note.set('');
    this.method.set('CASH');
    this.mode.set('pay');
  }

  protected startCancel() {
    this.error.set('');
    this.reason.set('');
    this.mode.set('cancel');
  }

  protected startVoid(paymentId: string) {
    this.error.set('');
    this.reason.set('');
    this.voidTarget = paymentId;
    this.mode.set('void');
  }

  protected confirm() {
    this.run(this.api.confirm(this.booking().id));
  }

  protected finish(kind: 'complete' | 'no-show') {
    const id = this.booking().id;
    this.run(kind === 'complete' ? this.api.complete(id) : this.api.noShow(id));
  }

  protected submitPay() {
    if (!this.amountOk() || this.busy()) return;
    this.run(
      this.api.pay(this.booking().id, {
        amount: Number(this.amount()),
        method: this.method(),
        note: this.note().trim() || undefined,
      }),
    );
  }

  protected submitCancel() {
    if (this.busy()) return;
    this.run(this.api.cancel(this.booking().id, this.reason().trim() || undefined));
  }

  protected submitVoid() {
    if (this.busy() || this.reason().trim().length < 3) return;
    this.run(this.api.voidPayment(this.booking().id, this.voidTarget, this.reason().trim()));
  }

  private run(request: Observable<OwnerBooking>) {
    this.busy.set(true);
    this.error.set('');
    request.subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.mode.set('none');
        this.changed.emit(updated);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.error.set(friendlyError(err).message);
      },
    });
  }
}
