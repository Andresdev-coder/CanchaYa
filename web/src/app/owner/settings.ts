import { ChangeDetectionStrategy, Component, afterNextRender, computed, inject, linkedSignal, signal } from '@angular/core';
import type { WritableSignal } from '@angular/core';
import { friendlyError } from '../core/api';
import { AuthService } from '../core/auth';
import { normalizePhone, timeToMin, to12h } from '../core/format';
import type { OpeningHour } from '../core/models';
import { OwnerApi } from '../core/owner-api';
import { WEEK, timeOptions, withCurrent } from './schedule';

interface DayDraft {
  weekday: number;
  label: string;
  open: boolean;
  opens: string;
  closes: string;
}

const DEFAULT_OPENS = '06:00';
const DEFAULT_CLOSES = '22:00';

@Component({
  selector: 'app-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="max-w-2xl space-y-6 p-4 lg:p-8">
      <h1 class="text-2xl font-extrabold">Mi establecimiento</h1>

      <form class="rounded-2xl border border-line bg-white p-5" (submit)="$event.preventDefault(); saveData()">
        <h2 class="text-lg font-extrabold">Datos</h2>

        <label class="mt-4 block text-sm font-bold" for="est-name">Nombre</label>
        <input id="est-name" class="field mt-1" [value]="name()" (input)="onInput(name, $event)" />

        <label class="mt-4 block text-sm font-bold" for="est-phone">WhatsApp del establecimiento</label>
        <input id="est-phone" class="field mt-1" type="tel" inputmode="numeric" placeholder="310 123 4567" [value]="phone()" (input)="onInput(phone, $event)" />
        <p class="mt-1 text-xs text-muted">Los jugadores lo usan para escribirte desde su reserva.</p>

        <label class="mt-4 block text-sm font-bold" for="est-pay">Cómo pagar por adelantado</label>
        <textarea id="est-pay" class="field mt-1 min-h-28 py-3" maxlength="500" placeholder="Nequi 310 123 4567 a nombre de Diana R." [value]="payment()" (input)="onInput(payment, $event)"></textarea>
        <p class="mt-1 text-xs text-muted">Lo ve el jugador cuando elige abono o pago total. El dinero llega directo a ti: CanchaYa no lo toca.</p>

        @if (dataError()) {
          <p role="alert" class="mt-4 rounded-xl bg-soft p-3 text-sm font-semibold text-danger">{{ dataError() }}</p>
        }
        @if (dataSaved()) {
          <p role="status" class="mt-4 rounded-xl bg-lime-soft p-3 text-sm font-bold">Datos guardados.</p>
        }
        <button type="submit" class="btn-primary mt-5" [disabled]="savingData() || name().trim().length < 2">
          {{ savingData() ? 'Guardando…' : 'Guardar datos' }}
        </button>
      </form>

      <form class="rounded-2xl border border-line bg-white p-5" (submit)="$event.preventDefault(); saveHours()">
        <h2 class="text-lg font-extrabold">Horario de atención</h2>
        <p class="mt-1 text-sm text-muted">Los turnos que ven los jugadores salen de este horario y de las tarifas de cada cancha.</p>

        @if (loadingHours()) {
          <p class="py-6 text-center text-muted" aria-live="polite">Cargando horario…</p>
        } @else {
          <ul class="mt-4 divide-y divide-line">
            @for (d of days(); track d.weekday) {
              <li class="flex flex-wrap items-center gap-3 py-3">
                <label class="flex w-32 items-center gap-3 font-bold">
                  <input type="checkbox" class="size-5 accent-ink" [checked]="d.open" (change)="toggleDay(d.weekday)" />
                  {{ d.label }}
                </label>
                @if (d.open) {
                  <select class="field min-h-11 w-auto" [attr.aria-label]="'Abre el ' + d.label" (change)="setTime(d.weekday, 'opens', $event)">
                    @for (t of options('start', d.opens); track t) {
                      <option [value]="t" [selected]="t === d.opens">{{ to12h(t) }}</option>
                    }
                  </select>
                  <span class="text-muted">a</span>
                  <select class="field min-h-11 w-auto" [attr.aria-label]="'Cierra el ' + d.label" (change)="setTime(d.weekday, 'closes', $event)">
                    @for (t of options('end', d.closes); track t) {
                      <option [value]="t" [selected]="t === d.closes">{{ to12h(t) }}</option>
                    }
                  </select>
                } @else {
                  <span class="text-muted">Cerrado</span>
                }
              </li>
            }
          </ul>

          <button type="button" class="btn-back mt-2 !w-auto" (click)="sameEveryDay()">Usar el mismo horario todos los días</button>

          @if (hoursError()) {
            <p role="alert" class="mt-3 rounded-xl bg-soft p-3 text-sm font-semibold text-danger">{{ hoursError() }}</p>
          }
          @if (hoursSaved()) {
            <p role="status" class="mt-3 rounded-xl bg-lime-soft p-3 text-sm font-bold">Horario guardado.</p>
          }
          <button type="submit" class="btn-primary mt-4" [disabled]="savingHours() || !!hoursProblem()">
            {{ savingHours() ? 'Guardando…' : 'Guardar horario' }}
          </button>
          @if (hoursProblem(); as p) {
            <p class="mt-2 text-center text-sm text-muted">{{ p }}</p>
          }
        }
      </form>
    </section>
  `,
})
export class Settings {
  private readonly api = inject(OwnerApi);
  private readonly auth = inject(AuthService);

  protected readonly to12h = to12h;

  protected readonly name = linkedSignal(() => this.auth.establishment()?.name ?? '');
  protected readonly phone = linkedSignal(() => this.auth.establishment()?.phone ?? '');
  protected readonly payment = linkedSignal(() => this.auth.establishment()?.paymentInstructions ?? '');
  protected readonly savingData = signal(false);
  protected readonly dataError = signal('');
  protected readonly dataSaved = signal(false);

  protected readonly days = signal<DayDraft[]>(
    WEEK.map((d) => ({ weekday: d.value, label: d.long, open: false, opens: DEFAULT_OPENS, closes: DEFAULT_CLOSES })),
  );
  protected readonly loadingHours = signal(true);
  protected readonly savingHours = signal(false);
  protected readonly hoursError = signal('');
  protected readonly hoursSaved = signal(false);

  protected readonly hoursProblem = computed(() => {
    const bad = this.days().find((d) => d.open && timeToMin(d.opens) >= timeToMin(d.closes));
    return bad ? `${bad.label}: la hora de apertura debe ser menor que la de cierre.` : null;
  });

  constructor() {
    afterNextRender(() => {
      this.api.hours().subscribe({
        next: (hours) => {
          this.days.update((list) =>
            list.map((d) => {
              const saved = hours.find((h) => h.weekday === d.weekday);
              return saved ? { ...d, open: true, opens: saved.opens, closes: saved.closes } : d;
            }),
          );
          this.loadingHours.set(false);
        },
        error: (err: unknown) => {
          this.hoursError.set(friendlyError(err).message);
          this.loadingHours.set(false);
        },
      });
    });
  }

  protected options(kind: 'start' | 'end', current: string) {
    return withCurrent(timeOptions(kind), current);
  }

  protected onInput(target: WritableSignal<string>, event: Event) {
    target.set((event.target as HTMLInputElement | HTMLTextAreaElement).value);
    this.dataSaved.set(false);
  }

  protected saveData() {
    if (this.savingData() || this.name().trim().length < 2) return;
    this.savingData.set(true);
    this.dataError.set('');
    this.dataSaved.set(false);
    this.api
      .updateEstablishment({
        name: this.name().trim(),
        phone: normalizePhone(this.phone()) || null,
        paymentInstructions: this.payment().trim() || null,
      })
      .subscribe({
        next: (establishment) => {
          this.auth.setEstablishment(establishment);
          this.savingData.set(false);
          this.dataSaved.set(true);
        },
        error: (err: unknown) => {
          const e = friendlyError(err);
          this.savingData.set(false);
          const field = Object.values(e.fields)[0];
          this.dataError.set(field ? `${e.message}: ${field}` : e.message);
        },
      });
  }

  private patchDay(weekday: number, change: Partial<DayDraft>) {
    this.days.update((list) => list.map((d) => (d.weekday === weekday ? { ...d, ...change } : d)));
    this.hoursSaved.set(false);
  }

  protected toggleDay(weekday: number) {
    const day = this.days().find((d) => d.weekday === weekday);
    if (day) this.patchDay(weekday, { open: !day.open });
  }

  protected setTime(weekday: number, field: 'opens' | 'closes', event: Event) {
    this.patchDay(weekday, { [field]: (event.target as HTMLSelectElement).value });
  }

  /** Copia el horario del primer día abierto a todos los días, y los abre. */
  protected sameEveryDay() {
    const source = this.days().find((d) => d.open) ?? this.days()[0];
    this.days.update((list) => list.map((d) => ({ ...d, open: true, opens: source.opens, closes: source.closes })));
    this.hoursSaved.set(false);
  }

  protected saveHours() {
    if (this.savingHours() || this.hoursProblem()) return;
    const days: OpeningHour[] = this.days()
      .filter((d) => d.open)
      .map((d) => ({ weekday: d.weekday, opens: d.opens, closes: d.closes }));

    this.savingHours.set(true);
    this.hoursError.set('');
    this.hoursSaved.set(false);
    this.api.setHours(days).subscribe({
      next: () => {
        this.savingHours.set(false);
        this.hoursSaved.set(true);
      },
      error: (err: unknown) => {
        this.savingHours.set(false);
        this.hoursError.set(friendlyError(err).message);
      },
    });
  }
}
