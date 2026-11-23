import { ChangeDetectionStrategy, Component, afterNextRender, computed, signal } from '@angular/core';
import { inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin, of, switchMap } from 'rxjs';
import { friendlyError } from '../core/api';
import { SPORT_LABEL, formatCOP, to12h } from '../core/format';
import type { OpeningHour, OwnerCourt, PriceRule } from '../core/models';
import { OwnerApi } from '../core/owner-api';
import { CourtEditor } from './court-editor';
import { summarizeDays } from './schedule';

interface CourtRow {
  court: OwnerCourt;
  rules: PriceRule[];
}

@Component({
  selector: 'app-courts',
  imports: [CourtEditor, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="p-4 lg:p-8">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h1 class="text-2xl font-extrabold">Canchas y precios</h1>
        <button type="button" class="min-h-11 cursor-pointer rounded-xl bg-ink px-4 font-extrabold text-lime" (click)="newCourt()">Agregar cancha</button>
      </div>

      @if (error()) {
        <p role="alert" class="mt-4 rounded-xl bg-white p-3 text-sm font-semibold text-danger">{{ error() }}</p>
      }

      @if (loading()) {
        <p class="py-16 text-center text-muted" aria-live="polite">Cargando tus canchas…</p>
      } @else {
        @if (!hasHours()) {
          <p class="mt-5 rounded-2xl border-2 border-ink bg-white p-4 text-sm">
            <b>Falta tu horario de atención.</b> Sin él no hay turnos que ofrecer.
            <a routerLink="/app/establecimiento" class="font-bold underline">Defínelo aquí</a>.
          </p>
        }

        @if (rows().length === 0) {
          <p class="mt-5 rounded-2xl bg-white p-6 text-muted">Aún no tienes canchas. Agrega la primera para empezar a recibir reservas.</p>
        }

        <ul class="mt-5 space-y-3">
          @for (r of rows(); track r.court.id) {
            <li>
              <button type="button" class="w-full cursor-pointer rounded-2xl border border-line bg-white p-5 text-left" [class.opacity-60]="!r.court.active" (click)="edit(r)">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <p class="text-lg font-extrabold">
                    {{ r.court.name }}
                    <span class="ml-1 text-sm font-semibold text-muted">{{ sportLabel[r.court.sport] }}@if (r.court.surface) { · {{ r.court.surface }} }</span>
                  </p>
                  <span class="rounded-lg px-2.5 py-1 text-xs font-bold" [class]="r.court.active ? 'bg-lime-soft' : 'bg-taken text-muted'">
                    {{ r.court.active ? 'Activa' : 'Inactiva' }}
                  </span>
                </div>
                @if (r.rules.length === 0) {
                  <p class="mt-2 text-sm font-bold text-danger">Sin tarifas: los jugadores no ven horarios de esta cancha.</p>
                } @else {
                  <ul class="mt-2 space-y-0.5 text-sm text-muted">
                    @for (line of summary(r.rules); track line) {
                      <li>{{ line }}</li>
                    }
                  </ul>
                }
              </button>
            </li>
          }
        </ul>
      }
    </section>

    @if (editing()) {
      <div class="fixed inset-0 z-30 bg-ink/40" (click)="close()" aria-hidden="true"></div>
      <aside class="fixed inset-y-0 right-0 z-40 w-full max-w-md bg-white shadow-xl" role="dialog" aria-modal="true" aria-label="Editar cancha">
        <app-court-editor [court]="editing()!.court" [prices]="editing()!.rules" (saved)="onSaved()" (closed)="close()" />
      </aside>
    }
  `,
})
export class Courts {
  private readonly api = inject(OwnerApi);

  protected readonly sportLabel = SPORT_LABEL;
  protected readonly rows = signal<CourtRow[]>([]);
  protected readonly hours = signal<OpeningHour[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  /** La cancha abierta en el panel. Para crear una nueva, el panel se abre sin cancha. */
  protected readonly editing = signal<{ court: OwnerCourt | null; rules: PriceRule[] } | null>(null);
  protected readonly hasHours = computed(() => this.hours().length > 0);

  constructor() {
    afterNextRender(() => this.load());
  }

  private load() {
    this.loading.set(true);
    forkJoin({ courts: this.api.courts(), hours: this.api.hours() })
      .pipe(
        switchMap(({ courts, hours }) =>
          (courts.length ? forkJoin(courts.map((c) => this.api.prices(c.id))) : of<PriceRule[][]>([])).pipe(
            switchMap((prices) => of({ hours, rows: courts.map((court, i) => ({ court, rules: prices[i] })) })),
          ),
        ),
      )
      .subscribe({
        next: ({ hours, rows }) => {
          this.hours.set(hours);
          this.rows.set(rows);
          this.error.set('');
          this.loading.set(false);
        },
        error: (err: unknown) => {
          this.error.set(friendlyError(err).message);
          this.loading.set(false);
        },
      });
  }

  protected summary(rules: PriceRule[]) {
    return rules.map((r) => `${summarizeDays(r.weekdays)} · ${to12h(r.start)} a ${to12h(r.end)} · ${formatCOP(r.pricePerHour)} la hora`);
  }

  protected newCourt() {
    this.editing.set({ court: null, rules: [] });
  }

  protected edit(row: CourtRow) {
    this.editing.set({ court: row.court, rules: row.rules });
  }

  protected close() {
    this.editing.set(null);
  }

  protected onSaved() {
    this.editing.set(null);
    this.load();
  }
}
