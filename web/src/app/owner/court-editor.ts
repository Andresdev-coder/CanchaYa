import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import type { WritableSignal } from '@angular/core';
import { switchMap, tap } from 'rxjs';
import { friendlyError } from '../core/api';
import { SPORT_LABEL, to12h } from '../core/format';
import type { CourtBody, OwnerCourt, PriceRule, Sport } from '../core/models';
import { OwnerApi } from '../core/owner-api';
import { WEEK, timeOptions, validateRules, withCurrent } from './schedule';

interface RuleDraft {
  key: number;
  weekdays: number[];
  start: string;
  end: string;
  price: string;
}

let nextKey = 1;
const draft = (r: Partial<PriceRule> = {}): RuleDraft => ({
  key: nextKey++,
  weekdays: r.weekdays ? [...r.weekdays] : [0, 1, 2, 3, 4, 5, 6],
  start: r.start ?? '06:00',
  end: r.end ?? '22:00',
  price: r.pricePerHour ? String(r.pricePerHour) : '',
});

const SLOTS = [
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hora' },
  { value: 90, label: '1 h 30' },
  { value: 120, label: '2 horas' },
];

/** Crea o edita una cancha, con sus reglas de pago y sus franjas de precio. */
@Component({
  selector: 'app-court-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex h-full flex-col">
      <div class="flex items-center justify-between gap-3 border-b border-line p-5">
        <h2 class="text-2xl font-extrabold">{{ court() ? 'Editar cancha' : 'Nueva cancha' }}</h2>
        <button type="button" class="chip size-11 shrink-0 px-0" aria-label="Cerrar" (click)="closed.emit()">✕</button>
      </div>

      <form class="flex-1 space-y-6 overflow-y-auto p-5" (submit)="$event.preventDefault(); save()">
        <div>
          <label class="text-sm font-bold" for="court-name">Nombre</label>
          <input id="court-name" class="field mt-1" placeholder="Cancha 1" [value]="name()" (input)="onInput(name, $event)" />
        </div>

        <div>
          <p class="text-sm font-bold">Deporte</p>
          <div class="mt-1 grid grid-cols-2 gap-2">
            @for (s of sports; track s.value) {
              <button type="button" class="chip" [attr.aria-pressed]="sport() === s.value" (click)="sport.set(s.value)">{{ s.label }}</button>
            }
          </div>
        </div>

        <div>
          <label class="text-sm font-bold" for="court-surface">Superficie (opcional)</label>
          <input id="court-surface" class="field mt-1" placeholder="Sintética, arena, cemento…" [value]="surface()" (input)="onInput(surface, $event)" />
        </div>

        <div>
          <p class="text-sm font-bold">Duración de cada turno</p>
          <div class="mt-1 grid grid-cols-4 gap-2">
            @for (s of slotOptions; track s.value) {
              <button type="button" class="chip px-1 text-[13px]" [attr.aria-pressed]="slotMinutes() === s.value" (click)="slotMinutes.set(s.value)">{{ s.label }}</button>
            }
          </div>
        </div>

        <fieldset class="space-y-3 rounded-2xl border border-line p-4">
          <legend class="px-1 text-sm font-bold">Pagos por adelantado</legend>
          <label class="flex items-center gap-3 font-semibold">
            <input type="checkbox" class="size-5 accent-ink" [checked]="allowDeposit()" (change)="allowDeposit.set(!allowDeposit())" />
            Permitir abono
          </label>
          @if (allowDeposit()) {
            <label class="block text-sm font-bold" for="court-deposit">Valor del abono</label>
            <input id="court-deposit" class="field" type="number" inputmode="numeric" min="1" placeholder="30000" [value]="depositAmount()" (input)="onInput(depositAmount, $event)" />
          }
          <label class="flex items-center gap-3 font-semibold">
            <input type="checkbox" class="size-5 accent-ink" [checked]="allowFull()" (change)="allowFull.set(!allowFull())" />
            Permitir pagar todo
          </label>
          <p class="text-xs text-muted">El jugador siempre puede elegir pagar en la cancha.</p>
        </fieldset>

        <section>
          <h3 class="text-sm font-bold">Tarifas por hora</h3>
          <p class="mt-1 text-xs text-muted">Los turnos de una hora que no tengan tarifa no se ofrecen a los jugadores.</p>

          <div class="mt-3 space-y-3">
            @for (r of rules(); track r.key) {
              <div class="rounded-2xl border border-line p-3">
                <div class="flex flex-wrap gap-1.5">
                  @for (d of week; track d.value) {
                    <button type="button" class="chip min-h-9 px-2.5 text-xs" [attr.aria-pressed]="r.weekdays.includes(d.value)" (click)="toggleDay(r.key, d.value)">{{ d.short }}</button>
                  }
                </div>
                <div class="mt-3 grid grid-cols-2 gap-2">
                  <label class="text-xs font-bold text-muted">
                    Desde
                    <select class="field mt-1 min-h-11" (change)="setTime(r.key, 'start', $event)">
                      @for (t of options('start', r.start); track t) {
                        <option [value]="t" [selected]="t === r.start">{{ to12h(t) }}</option>
                      }
                    </select>
                  </label>
                  <label class="text-xs font-bold text-muted">
                    Hasta
                    <select class="field mt-1 min-h-11" (change)="setTime(r.key, 'end', $event)">
                      @for (t of options('end', r.end); track t) {
                        <option [value]="t" [selected]="t === r.end">{{ to12h(t) }}</option>
                      }
                    </select>
                  </label>
                </div>
                <div class="mt-3 flex items-end gap-2">
                  <label class="flex-1 text-xs font-bold text-muted">
                    Precio por hora
                    <input class="field mt-1 min-h-11" type="number" inputmode="numeric" min="1" placeholder="70000" [value]="r.price" (input)="setPrice(r.key, $event)" />
                  </label>
                  <button type="button" class="min-h-11 px-3 text-sm font-bold text-danger" (click)="removeRule(r.key)">Quitar</button>
                </div>
              </div>
            }
          </div>
          <button type="button" class="btn-outline mt-3" (click)="addRule()">Agregar franja</button>
        </section>

        @if (error()) {
          <p role="alert" class="rounded-xl bg-soft p-3 text-sm font-semibold text-danger">{{ error() }}</p>
        }

        <div>
          <button type="submit" class="btn-primary" [disabled]="busy() || !!problem()">{{ busy() ? 'Guardando…' : 'Guardar cancha' }}</button>
          @if (problem(); as p) {
            <p class="mt-2 text-center text-sm text-muted">{{ p }}</p>
          }
        </div>

        @if (court(); as c) {
          <button type="button" class="btn-text" [disabled]="busy()" (click)="toggleActive()">
            {{ c.active ? 'Desactivar cancha' : 'Activar cancha' }}
          </button>
        }
      </form>
    </div>
  `,
})
export class CourtEditor {
  /** La cancha que se edita, o null para crear una nueva. */
  readonly court = input<OwnerCourt | null>(null);
  readonly prices = input<PriceRule[]>([]);
  readonly saved = output<void>();
  readonly closed = output<void>();

  private readonly api = inject(OwnerApi);

  protected readonly week = WEEK;
  protected readonly slotOptions = SLOTS;
  protected readonly sports = (Object.keys(SPORT_LABEL) as Sport[]).map((value) => ({ value, label: SPORT_LABEL[value] }));
  protected readonly to12h = to12h;

  protected readonly name = linkedSignal(() => this.court()?.name ?? '');
  protected readonly sport = linkedSignal<Sport>(() => this.court()?.sport ?? 'FOOTBALL');
  protected readonly surface = linkedSignal(() => this.court()?.surface ?? '');
  protected readonly slotMinutes = linkedSignal(() => this.court()?.slotMinutes ?? 60);
  protected readonly allowDeposit = linkedSignal(() => this.court()?.allowDeposit ?? true);
  protected readonly depositAmount = linkedSignal(() => {
    const amount = this.court()?.depositAmount;
    return amount ? String(amount) : '';
  });
  protected readonly allowFull = linkedSignal(() => this.court()?.allowFullPayment ?? true);
  protected readonly rules = linkedSignal<RuleDraft[]>(() => (this.court() ? this.prices().map(draft) : [draft()]));

  protected readonly busy = signal(false);
  protected readonly error = signal('');
  /** Si la cancha se creó pero fallaron las tarifas, el reintento no la vuelve a crear. */
  private createdId: string | null = null;

  protected readonly problem = computed(() => {
    if (this.name().trim().length < 1) return 'Escribe el nombre de la cancha.';
    if (this.allowDeposit()) {
      const amount = Number(this.depositAmount());
      if (!Number.isInteger(amount) || amount < 1) return 'Indica el valor del abono.';
    }
    return validateRules(this.rules());
  });

  protected options(kind: 'start' | 'end', current: string) {
    return withCurrent(timeOptions(kind), current);
  }

  protected onInput(target: WritableSignal<string>, event: Event) {
    target.set((event.target as HTMLInputElement).value);
  }

  private patchRule(key: number, change: Partial<RuleDraft>) {
    this.rules.update((list) => list.map((r) => (r.key === key ? { ...r, ...change } : r)));
  }

  protected toggleDay(key: number, day: number) {
    const rule = this.rules().find((r) => r.key === key);
    if (!rule) return;
    const weekdays = rule.weekdays.includes(day) ? rule.weekdays.filter((d) => d !== day) : [...rule.weekdays, day];
    this.patchRule(key, { weekdays });
  }

  protected setTime(key: number, field: 'start' | 'end', event: Event) {
    this.patchRule(key, { [field]: (event.target as HTMLSelectElement).value });
  }

  protected setPrice(key: number, event: Event) {
    this.patchRule(key, { price: (event.target as HTMLInputElement).value });
  }

  protected addRule() {
    this.rules.update((list) => [...list, draft({ weekdays: [] })]);
  }

  protected removeRule(key: number) {
    this.rules.update((list) => list.filter((r) => r.key !== key));
  }

  protected save() {
    if (this.problem() || this.busy()) return;

    const body: CourtBody = {
      name: this.name().trim(),
      sport: this.sport(),
      surface: this.surface().trim() || null,
      slotMinutes: this.slotMinutes(),
      allowDeposit: this.allowDeposit(),
      depositAmount: this.allowDeposit() ? Number(this.depositAmount()) : null,
      allowFullPayment: this.allowFull(),
    };
    const rules = this.rules().map((r) => ({
      weekdays: r.weekdays,
      start: r.start,
      end: r.end,
      pricePerHour: Number(r.price),
    }));

    const id = this.court()?.id ?? this.createdId;
    this.busy.set(true);
    this.error.set('');
    (id ? this.api.updateCourt(id, body) : this.api.createCourt(body))
      .pipe(
        tap((court) => (this.createdId = court.id)),
        switchMap((court) => this.api.setPrices(court.id, rules)),
      )
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.saved.emit();
        },
        error: (err: unknown) => {
          const message = friendlyError(err).message;
          this.busy.set(false);
          this.error.set(
            this.createdId && !this.court() ? `La cancha se creó, pero no se pudieron guardar las tarifas: ${message}` : message,
          );
        },
      });
  }

  protected toggleActive() {
    const court = this.court();
    if (!court) return;
    this.busy.set(true);
    this.error.set('');
    this.api.updateCourt(court.id, { active: !court.active }).subscribe({
      next: () => {
        this.busy.set(false);
        this.saved.emit();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.error.set(friendlyError(err).message);
      },
    });
  }
}
