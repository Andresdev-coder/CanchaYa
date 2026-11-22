import { ChangeDetectionStrategy, Component, afterNextRender, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import type { WritableSignal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, map, of, startWith, switchMap } from 'rxjs';
import { Api, friendlyError } from '../core/api';
import { SPORT_LABEL, addDays, bogotaDate, formatCOP, isMobilePhone, normalizePhone, to12h } from '../core/format';
import type { OwnerBooking, OwnerCourt, Slot } from '../core/models';
import { OwnerApi } from '../core/owner-api';

type SlotsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; slots: Slot[] }
  | { status: 'error'; message: string };

/** Reserva que el establecimiento crea cuando alguien llama por teléfono: nace confirmada. */
@Component({
  selector: 'app-manual-booking',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex h-full flex-col">
      <div class="flex items-center justify-between gap-3 border-b border-line p-5">
        <h2 class="text-2xl font-extrabold">Nueva reserva</h2>
        <button type="button" class="chip size-11 shrink-0 px-0" aria-label="Cerrar" (click)="closed.emit()">✕</button>
      </div>

      <form class="flex-1 overflow-y-auto p-5" (submit)="$event.preventDefault(); submit()">
        <label class="text-sm font-bold" for="court">Cancha</label>
        <select id="court" class="field mt-1" [value]="court()?.id" (change)="chooseCourt($event)">
          @for (c of courts(); track c.id) {
            <option [value]="c.id" [selected]="c.id === court()?.id">{{ c.name }} · {{ sportLabel[c.sport] }}</option>
          }
        </select>

        <label class="mt-4 block text-sm font-bold" for="day">Fecha</label>
        <input id="day" class="field mt-1" type="date" [value]="day()" [min]="today" [max]="last" (change)="chooseDay($event)" />

        <p class="mt-5 text-sm font-bold">Horario</p>
        @if (loading()) {
          <p class="py-4 text-sm text-muted" aria-live="polite">Buscando horarios…</p>
        } @else if (slotsError()) {
          <p role="alert" class="mt-2 rounded-xl bg-soft p-3 text-sm text-danger">{{ slotsError() }}</p>
        } @else if (slots().length === 0) {
          <p class="mt-2 rounded-xl bg-soft p-3 text-sm text-muted">No hay horarios este día.</p>
        } @else {
          <div class="mt-2 grid grid-cols-3 gap-2">
            @for (s of slots(); track s.start) {
              <button type="button" class="chip min-h-14 px-1 py-1" [disabled]="!s.available" [attr.aria-pressed]="picked()?.start === s.start" (click)="picked.set(s)">
                <span class="block">{{ to12h(s.startTime) }}</span>
                <span class="block text-xs font-semibold text-muted no-underline">{{ cop(s.price) }}</span>
              </button>
            }
          </div>
        }

        <label class="mt-5 block text-sm font-bold" for="name">Nombre de quien reserva</label>
        <input id="name" class="field mt-1" autocomplete="off" [value]="name()" (input)="onInput(name, $event)" />
        @if (fieldErrors()['name']) {
          <p class="mt-1 text-sm text-danger">{{ fieldErrors()['name'] }}</p>
        }

        <label class="mt-4 block text-sm font-bold" for="phone">Celular</label>
        <input id="phone" class="field mt-1" type="tel" inputmode="numeric" autocomplete="off" placeholder="310 123 4567" [value]="phone()" (input)="onInput(phone, $event)" />
        @if (fieldErrors()['phone']) {
          <p class="mt-1 text-sm text-danger">{{ fieldErrors()['phone'] }}</p>
        } @else if (phone() && !phoneOk()) {
          <p class="mt-1 text-sm text-muted">Escribe un celular de 10 dígitos.</p>
        }

        <label class="mt-4 block text-sm font-bold" for="note">Nota (opcional)</label>
        <input id="note" class="field mt-1" [value]="note()" (input)="onInput(note, $event)" />

        @if (formError()) {
          <p role="alert" class="mt-4 rounded-xl bg-soft p-3 text-sm font-semibold text-danger">{{ formError() }}</p>
        }

        <button type="submit" class="btn-primary mt-6" [disabled]="!canSubmit()">
          {{ submitting() ? 'Guardando…' : 'Crear reserva confirmada' }}
        </button>
      </form>
    </div>
  `,
})
export class ManualBooking {
  readonly courts = input.required<OwnerCourt[]>();
  readonly slug = input.required<string>();
  readonly initialDate = input.required<string>();
  readonly created = output<OwnerBooking>();
  readonly closed = output<void>();

  private readonly publicApi = inject(Api);
  private readonly ownerApi = inject(OwnerApi);

  protected readonly sportLabel = SPORT_LABEL;
  protected readonly to12h = to12h;
  protected readonly cop = formatCOP;
  protected readonly today = bogotaDate();
  protected readonly last = addDays(this.today, 30);

  private readonly pickedCourt = signal<string | null>(null);
  protected readonly court = computed(() => this.courts().find((c) => c.id === this.pickedCourt()) ?? this.courts()[0] ?? null);
  protected readonly day = linkedSignal(() => this.initialDate());
  protected readonly picked = signal<Slot | null>(null);

  private readonly slotsState = signal<SlotsState>({ status: 'idle' });
  protected readonly loading = computed(() => this.slotsState().status === 'loading');
  protected readonly slots = computed(() => {
    const s = this.slotsState();
    return s.status === 'ready' ? s.slots : [];
  });
  protected readonly slotsError = computed(() => {
    const s = this.slotsState();
    return s.status === 'error' ? s.message : '';
  });

  protected readonly name = signal('');
  protected readonly phone = signal('');
  protected readonly note = signal('');
  protected readonly submitting = signal(false);
  protected readonly formError = signal('');
  protected readonly fieldErrors = signal<Record<string, string>>({});
  protected readonly phoneOk = computed(() => isMobilePhone(this.phone()));
  protected readonly canSubmit = computed(
    () => !!this.picked() && this.name().trim().length >= 2 && this.phoneOk() && !this.submitting(),
  );

  private readonly reload = new Subject<void>();

  constructor() {
    this.reload
      .pipe(
        switchMap(() => {
          const court = this.court();
          if (!court) return of<SlotsState>({ status: 'idle' });
          return this.publicApi.availability(this.slug(), court.id, this.day()).pipe(
            map((a): SlotsState => ({ status: 'ready', slots: a.slots })),
            startWith<SlotsState>({ status: 'loading' }),
            catchError((err: unknown) => of<SlotsState>({ status: 'error', message: friendlyError(err).message })),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.slotsState.set(state));

    afterNextRender(() => this.reload.next());
  }

  protected chooseCourt(event: Event) {
    this.pickedCourt.set((event.target as HTMLSelectElement).value);
    this.picked.set(null);
    this.reload.next();
  }

  protected chooseDay(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    if (!value) return;
    this.day.set(value);
    this.picked.set(null);
    this.reload.next();
  }

  protected onInput(target: WritableSignal<string>, event: Event) {
    target.set((event.target as HTMLInputElement).value);
  }

  protected submit() {
    const court = this.court();
    const slot = this.picked();
    if (!court || !slot || !this.canSubmit()) return;

    this.submitting.set(true);
    this.formError.set('');
    this.fieldErrors.set({});
    this.ownerApi
      .createManual({
        courtId: court.id,
        start: slot.start,
        name: this.name().trim(),
        phone: normalizePhone(this.phone()),
        note: this.note().trim() || undefined,
      })
      .subscribe({
        next: (booking) => this.created.emit(booking),
        error: (err: unknown) => {
          const e = friendlyError(err);
          this.submitting.set(false);
          this.formError.set(e.message);
          this.fieldErrors.set(e.fields);
          if (e.status === 409) {
            this.picked.set(null);
            this.reload.next();
          }
        },
      });
  }
}
