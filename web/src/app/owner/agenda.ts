import { ChangeDetectionStrategy, Component, DestroyRef, afterNextRender, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { friendlyError } from '../core/api';
import { AuthService } from '../core/auth';
import {
  SPORT_LABEL,
  addDays,
  bogotaDate,
  formatClock,
  formatCOP,
  formatDayTitle,
  minutesOfDay,
  timeToMin,
  to12h,
  weekdayOf,
} from '../core/format';
import type { OpeningHour, OwnerBooking, OwnerCourt } from '../core/models';
import { OwnerApi } from '../core/owner-api';
import { BookingDetail } from './booking-detail';
import { ManualBooking } from './manual-booking';

/** Cada reserva se pinta según su estado y lo pagado: el borde punteado es "por confirmar". */
function look(b: OwnerBooking): { cls: string; label: string } {
  switch (b.status) {
    case 'PENDING':
      return { cls: 'border-[1.5px] border-dashed border-muted bg-white text-ink', label: b.paid > 0 ? 'Por confirmar · abono' : 'Por confirmar' };
    case 'CONFIRMED':
      if (b.paymentStatus === 'PAID') return { cls: 'bg-ink text-white', label: 'Pagada' };
      if (b.paymentStatus === 'PARTIAL') return { cls: 'bg-lime-soft text-ink', label: 'Con abono' };
      return { cls: 'bg-soft text-ink', label: 'Confirmada' };
    case 'COMPLETED':
      return { cls: 'bg-taken text-muted', label: 'Completada' };
    case 'NO_SHOW':
      return { cls: 'bg-taken text-danger', label: 'No asistió' };
    default:
      return { cls: 'bg-taken text-muted', label: 'Cancelada' };
  }
}

const ROW_MINUTES = 30;
const pad = (n: number) => String(n).padStart(2, '0');
const hourLabel = (minutes: number) => to12h(`${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`);

interface LoadResult {
  silent: boolean;
  ok: boolean;
  message?: string;
  bookings?: OwnerBooking[];
  courts?: OwnerCourt[];
  hours?: OpeningHour[];
}

@Component({
  selector: 'app-agenda',
  imports: [BookingDetail, ManualBooking],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="p-4 lg:p-8">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <h1 class="mr-2 text-2xl font-extrabold">{{ title() }}</h1>
          <button type="button" class="chip size-11 px-0" aria-label="Día anterior" (click)="go(-1)">‹</button>
          <button type="button" class="chip size-11 px-0" aria-label="Día siguiente" (click)="go(1)">›</button>
          @if (date() !== today) {
            <button type="button" class="chip" (click)="goToday()">Hoy</button>
          }
        </div>
        <button type="button" class="min-h-11 cursor-pointer rounded-xl bg-ink px-4 font-extrabold text-lime disabled:cursor-not-allowed disabled:opacity-50" [disabled]="activeCourts().length === 0" (click)="creating.set(true)">
          Nueva reserva
        </button>
      </div>

      <div class="mt-5 flex flex-wrap gap-x-9 gap-y-2 border-y border-line py-3.5">
        <p><b class="text-2xl">{{ stats().total }}</b><span class="ml-1.5 text-muted">reservas</span></p>
        <p><b class="text-2xl">{{ stats().pending }}</b><span class="ml-1.5 text-muted">por confirmar</span></p>
        <p><b class="text-2xl">{{ cop(stats().collected) }}</b><span class="ml-1.5 text-muted">cobrado</span></p>
        <p><b class="text-2xl">{{ cop(stats().toCollect) }}</b><span class="ml-1.5 text-muted">por cobrar en cancha</span></p>
      </div>

      @if (error()) {
        <p role="alert" class="mt-4 rounded-xl bg-white p-3 text-sm font-semibold text-danger">{{ error() }}</p>
      }

      @if (loading()) {
        <p class="py-16 text-center text-muted" aria-live="polite">Cargando la agenda…</p>
      } @else if (columns().length === 0) {
        <p class="mt-6 rounded-2xl bg-white p-6 text-muted">Todavía no hay canchas configuradas.</p>
      } @else {
        <div class="mt-4 mb-3 flex flex-wrap gap-5 text-xs text-muted">
          <span class="flex items-center gap-1.5"><i class="size-3.5 rounded border-[1.5px] border-dashed border-muted"></i>Por confirmar</span>
          <span class="flex items-center gap-1.5"><i class="size-3.5 rounded bg-soft"></i>Confirmada</span>
          <span class="flex items-center gap-1.5"><i class="size-3.5 rounded bg-lime-soft"></i>Con abono</span>
          <span class="flex items-center gap-1.5"><i class="size-3.5 rounded bg-ink"></i>Pagada</span>
        </div>

        @if (bookings().length === 0) {
          <p class="mb-3 text-sm text-muted">No hay reservas este día.</p>
        }

        <!-- Computador: canchas en columnas y horas en filas. -->
        @if (range()) {
          <div class="hidden overflow-x-auto lg:block">
            <div
              class="grid gap-x-1.5"
              [style.grid-template-columns]="'64px repeat(' + columns().length + ', minmax(140px, 1fr))'"
              [style.grid-template-rows]="'auto repeat(' + rows() + ', 32px)'"
            >
              @for (c of columns(); track c.id; let i = $index) {
                <div class="px-1 pb-2 font-extrabold" [style.grid-column]="i + 2" style="grid-row: 1">
                  {{ c.name }}<span class="block text-xs font-medium text-muted">{{ sportLabel[c.sport] }}</span>
                </div>
              }
              @for (h of hourLines(); track h.min) {
                <div class="border-t border-line" style="grid-column: 1 / -1" [style.grid-row]="h.row + ' / span 2'"></div>
                <div class="pt-2 text-xs font-bold text-muted" style="grid-column: 1" [style.grid-row]="h.row + ' / span 2'">{{ h.label }}</div>
              }
              @for (t of tiles(); track t.b.id) {
                <button
                  type="button"
                  class="z-10 m-0.5 flex cursor-pointer flex-col justify-between overflow-hidden rounded-[10px] px-2.5 py-1.5 text-left text-[13px]"
                  [class]="t.cls"
                  [class.ring-2]="selectedId() === t.b.id"
                  [class.ring-ink]="selectedId() === t.b.id"
                  [class.ring-offset-2]="selectedId() === t.b.id"
                  [style.grid-column]="t.col"
                  [style.grid-row]="t.row + ' / span ' + t.span"
                  (click)="selectedId.set(t.b.id)"
                >
                  <b class="truncate">{{ t.b.customer.name }}</b>
                  <span class="text-xs font-bold">{{ t.label }}</span>
                </button>
              }
            </div>
          </div>
        } @else if (bookings().length === 0) {
          <p class="hidden rounded-2xl bg-white p-6 text-muted lg:block">Este día no hay horario de atención ni reservas.</p>
        }

        <!-- Celular: lista por hora. -->
        <ul class="space-y-2 lg:hidden">
          @for (t of tiles(); track t.b.id) {
            <li>
              <button type="button" class="flex w-full cursor-pointer items-center justify-between gap-3 rounded-2xl p-4 text-left" [class]="t.cls" (click)="selectedId.set(t.b.id)">
                <span class="min-w-0">
                  <b class="block truncate">{{ t.b.customer.name }}</b>
                  <span class="block text-sm">{{ t.b.court.name }}</span>
                </span>
                <span class="shrink-0 text-right text-sm">
                  <b class="block">{{ clock(t.b.start) }}</b>
                  <span class="text-xs font-bold">{{ t.label }}</span>
                </span>
              </button>
            </li>
          }
        </ul>
      }
    </section>

    @if (selected(); as b) {
      <div class="fixed inset-0 z-30 bg-ink/40" (click)="selectedId.set(null)" aria-hidden="true"></div>
      <aside class="fixed inset-y-0 right-0 z-40 w-full max-w-md bg-white shadow-xl" role="dialog" aria-modal="true" aria-label="Detalle de la reserva">
        <app-booking-detail [booking]="b" [isOwner]="isOwner()" (changed)="onChanged($event)" (closed)="selectedId.set(null)" />
      </aside>
    }

    @if (creating() && establishment(); as e) {
      <div class="fixed inset-0 z-30 bg-ink/40" (click)="creating.set(false)" aria-hidden="true"></div>
      <aside class="fixed inset-y-0 right-0 z-40 w-full max-w-md bg-white shadow-xl" role="dialog" aria-modal="true" aria-label="Nueva reserva">
        <app-manual-booking [courts]="activeCourts()" [slug]="e.slug" [initialDate]="date()" (created)="onCreated($event)" (closed)="creating.set(false)" />
      </aside>
    }
  `,
})
export class Agenda {
  private readonly api = inject(OwnerApi);
  private readonly auth = inject(AuthService);

  protected readonly sportLabel = SPORT_LABEL;
  protected readonly cop = formatCOP;
  protected readonly clock = formatClock;
  protected readonly today = bogotaDate();
  protected readonly isOwner = this.auth.isOwner;
  protected readonly establishment = this.auth.establishment;

  protected readonly date = signal(this.today);
  protected readonly bookings = signal<OwnerBooking[]>([]);
  protected readonly courts = signal<OwnerCourt[]>([]);
  protected readonly hours = signal<OpeningHour[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly selectedId = signal<string | null>(null);
  protected readonly creating = signal(false);

  protected readonly title = computed(() => formatDayTitle(this.date()));
  protected readonly selected = computed(() => this.bookings().find((b) => b.id === this.selectedId()) ?? null);
  protected readonly activeCourts = computed(() => this.courts().filter((c) => c.active));

  /** Las canchas activas, y las inactivas que ese día todavía tienen reservas. */
  protected readonly columns = computed(() => {
    const used = new Set(this.bookings().map((b) => b.court.id));
    return this.courts().filter((c) => c.active || used.has(c.id));
  });

  protected readonly stats = computed(() => {
    const active = this.bookings().filter((b) => b.status !== 'CANCELLED');
    const sum = (items: number[]) => items.reduce((a, b) => a + b, 0);
    return {
      total: active.length,
      pending: active.filter((b) => b.status === 'PENDING').length,
      collected: sum(active.map((b) => b.paid)),
      toCollect: sum(active.filter((b) => b.status === 'CONFIRMED' || b.status === 'COMPLETED').map((b) => Math.max(b.balance, 0))),
    };
  });

  /** De qué hora a qué hora se dibuja el día: el horario de atención, ampliado si una reserva se sale. */
  protected readonly range = computed(() => {
    const day = this.hours().find((h) => h.weekday === weekdayOf(this.date()));
    let start = day ? timeToMin(day.opens) : null;
    let end = day ? timeToMin(day.closes) : null;
    for (const b of this.bookings()) {
      const s = minutesOfDay(b.start);
      const e = s + Math.round((Date.parse(b.end) - Date.parse(b.start)) / 60_000);
      start = start === null ? s : Math.min(start, s);
      end = end === null ? e : Math.max(end, e);
    }
    if (start === null || end === null) return null;
    return { start: Math.floor(start / 60) * 60, end: Math.ceil(end / 60) * 60 };
  });

  protected readonly rows = computed(() => {
    const r = this.range();
    return r ? (r.end - r.start) / ROW_MINUTES : 0;
  });

  protected readonly hourLines = computed(() => {
    const r = this.range();
    if (!r) return [];
    return Array.from({ length: (r.end - r.start) / 60 }, (_, i) => ({
      min: r.start + i * 60,
      row: i * 2 + 2,
      label: hourLabel(r.start + i * 60),
    }));
  });

  protected readonly tiles = computed(() => {
    const r = this.range();
    const cols = this.columns();
    return this.bookings()
      .map((b) => {
        const start = minutesOfDay(b.start);
        const duration = Math.round((Date.parse(b.end) - Date.parse(b.start)) / 60_000);
        return {
          b,
          ...look(b),
          col: cols.findIndex((c) => c.id === b.court.id) + 2,
          row: r ? Math.round((start - r.start) / ROW_MINUTES) + 2 : 0,
          span: Math.max(1, Math.ceil(duration / ROW_MINUTES)),
        };
      })
      .filter((t) => t.col >= 2)
      .sort((a, z) => Date.parse(a.b.start) - Date.parse(z.b.start));
  });

  private readonly reload = new Subject<boolean>();

  constructor() {
    const destroyRef = inject(DestroyRef);

    this.reload
      .pipe(
        switchMap((silent) => {
          if (!silent) this.loading.set(true);
          return forkJoin({
            bookings: this.api.bookings(this.date()),
            courts: this.api.courts(),
            hours: this.api.hours(),
          }).pipe(
            map((data): LoadResult => ({ silent, ok: true, ...data })),
            catchError((err: unknown) => of<LoadResult>({ silent, ok: false, message: friendlyError(err).message })),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((r) => {
        this.loading.set(false);
        if (r.ok) {
          this.bookings.set(r.bookings ?? []);
          this.courts.set(r.courts ?? []);
          this.hours.set(r.hours ?? []);
          this.error.set('');
        } else if (!r.silent) {
          this.error.set(r.message ?? 'No se pudo cargar la agenda.');
        }
      });

    afterNextRender(() => {
      this.reload.next(false);
      // Llegan reservas nuevas desde la página pública: la agenda se actualiza sola cada 30 segundos.
      const timer = setInterval(() => {
        if (document.visibilityState === 'visible') this.reload.next(true);
      }, 30_000);
      destroyRef.onDestroy(() => clearInterval(timer));
    });
  }

  protected go(days: number) {
    this.date.set(addDays(this.date(), days));
    this.selectedId.set(null);
    this.reload.next(false);
  }

  protected goToday() {
    this.date.set(this.today);
    this.selectedId.set(null);
    this.reload.next(false);
  }

  /** Una acción sobre una reserva devuelve la reserva actualizada: se reemplaza, o se quita si quedó cancelada. */
  protected onChanged(updated: OwnerBooking) {
    if (updated.status === 'CANCELLED') {
      this.bookings.update((list) => list.filter((b) => b.id !== updated.id));
      this.selectedId.set(null);
    } else {
      this.bookings.update((list) => list.map((b) => (b.id === updated.id ? updated : b)));
    }
  }

  protected onCreated(created: OwnerBooking) {
    this.creating.set(false);
    if (Date.parse(created.start) >= 0 && this.sameDay(created.start)) {
      this.bookings.update((list) => [...list, created]);
      this.selectedId.set(created.id);
    } else {
      this.reload.next(true);
    }
  }

  private sameDay(iso: string) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date(iso)) === this.date();
  }
}
