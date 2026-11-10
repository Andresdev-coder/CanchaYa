import { ChangeDetectionStrategy, Component, RESPONSE_INIT, afterNextRender, computed, inject, signal } from '@angular/core';
import type { WritableSignal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, catchError, map, of, startWith, switchMap } from 'rxjs';
import { environment } from '../../environments/environment';
import { Api, friendlyError } from '../core/api';
import { SPORT_LABEL, formatCOP, initials, isMobilePhone, nextDays, normalizePhone, to12h } from '../core/format';
import type { PageResult, PaymentChoice, PublicPage, Slot, Sport } from '../core/models';

type SlotsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; slots: Slot[] }
  | { status: 'error'; message: string };

@Component({
  selector: 'app-booking-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="mx-auto w-full max-w-lg px-5 pb-20 pt-6">
      @if (page(); as p) {
        <header class="flex items-center gap-3">
          <div class="grid size-11 shrink-0 place-items-center rounded-full bg-ink font-extrabold text-lime" aria-hidden="true">
            {{ initials(p.establishment.name) }}
          </div>
          <div class="min-w-0">
            <p class="truncate font-extrabold">{{ p.establishment.name }}</p>
            <p class="text-sm text-muted">{{ p.establishment.city }}</p>
          </div>
        </header>

        <h1 class="mt-6 text-3xl leading-tight font-extrabold">Reserva tu cancha</h1>

        @if (p.courts.length === 0) {
          <p class="mt-8 rounded-2xl bg-white p-5 text-muted">
            Este establecimiento todavía no tiene canchas disponibles para reservar.
          </p>
        } @else {
          @if (sports().length > 1) {
            <h2 class="label">Deporte</h2>
            <div class="flex flex-wrap gap-2">
              @for (s of sports(); track s) {
                <button type="button" class="chip" [attr.aria-pressed]="s === sport()" (click)="chooseSport(s)">
                  {{ sportLabel[s] }}
                </button>
              }
            </div>
          }

          <h2 class="label">Fecha</h2>
          <div class="-mx-5 flex gap-1.5 overflow-x-auto px-5 pb-1">
            @for (d of days; track d.value) {
              <button
                type="button"
                class="chip h-16 w-14 shrink-0 px-0 leading-tight"
                [attr.aria-pressed]="d.value === date()"
                (click)="chooseDate(d.value)"
              >
                <span class="block text-xs font-semibold">{{ d.weekday }}</span>
                <span class="block text-lg">{{ d.day }}</span>
              </button>
            }
          </div>

          @if (courts().length > 1) {
            <h2 class="label">Cancha</h2>
            <div class="grid grid-cols-2 gap-2">
              @for (c of courts(); track c.id) {
                <button type="button" class="chip py-2" [attr.aria-pressed]="c.id === court()?.id" (click)="chooseCourt(c.id)">
                  {{ c.name }}
                  @if (c.surface) {
                    <span class="block text-xs font-semibold text-muted">{{ c.surface }}</span>
                  }
                </button>
              }
            </div>
          }

          <h2 class="label">Horarios</h2>
          @if (notice()) {
            <p role="alert" class="mb-3 rounded-xl bg-white p-3 text-sm font-semibold text-danger">{{ notice() }}</p>
          }
          @if (loading()) {
            <p class="py-6 text-center text-muted" aria-live="polite">Buscando horarios…</p>
          } @else if (slotsError()) {
            <p role="alert" class="rounded-xl bg-white p-4 text-sm text-danger">{{ slotsError() }}</p>
            <button type="button" class="btn-outline mt-3" (click)="refresh()">Intentar de nuevo</button>
          } @else if (ready() && slots().length === 0) {
            <p class="rounded-2xl bg-white p-5 text-center text-muted">No hay horarios este día. Prueba con otra fecha.</p>
          } @else {
            <div class="grid grid-cols-3 gap-2">
              @for (s of slots(); track s.start) {
                <button
                  type="button"
                  class="chip min-h-14 px-1 py-1"
                  [disabled]="!s.available"
                  [attr.aria-pressed]="picked()?.start === s.start"
                  (click)="pick(s)"
                >
                  <span class="block">{{ to12h(s.startTime) }}</span>
                  <span class="block text-xs font-semibold text-muted no-underline">{{ cop(s.price) }}</span>
                </button>
              }
            </div>
          }

          @if (picked(); as slot) {
            <form id="datos" class="mt-8 rounded-2xl border border-line bg-white p-5" (submit)="$event.preventDefault(); submit()">
              <p class="font-extrabold">{{ to12h(slot.startTime) }} a {{ to12h(slot.endTime) }} · {{ cop(slot.price) }}</p>

              <h2 class="label mt-5">¿Cómo quieres pagar?</h2>
              <div class="grid grid-cols-3 gap-1.5">
                @for (o of payOptions(); track o.value) {
                  <button
                    type="button"
                    class="chip px-1 text-[13px] leading-tight"
                    [attr.aria-pressed]="o.value === effectiveChoice()"
                    (click)="choice.set(o.value)"
                  >
                    {{ o.label }}
                  </button>
                }
              </div>

              <label class="label mt-5 block" for="name">Tu nombre</label>
              <input id="name" class="field" autocomplete="name" [value]="name()" (input)="onInput(name, $event)" />
              @if (fieldErrors()['name']) {
                <p class="mt-1 text-sm text-danger">{{ fieldErrors()['name'] }}</p>
              }

              <label class="label mt-5 block" for="phone">Tu celular (WhatsApp)</label>
              <input
                id="phone"
                class="field"
                type="tel"
                inputmode="numeric"
                autocomplete="tel"
                placeholder="310 123 4567"
                [value]="phone()"
                (input)="onInput(phone, $event)"
              />
              @if (fieldErrors()['phone']) {
                <p class="mt-1 text-sm text-danger">{{ fieldErrors()['phone'] }}</p>
              } @else if (phone() && !phoneOk()) {
                <p class="mt-1 text-sm text-muted">Escribe un celular de 10 dígitos.</p>
              }

              @if (formError()) {
                <p role="alert" class="mt-4 rounded-xl bg-paper p-3 text-sm font-semibold text-danger">{{ formError() }}</p>
              }

              <button type="submit" class="btn-primary mt-6" [disabled]="!canSubmit()">
                {{ submitting() ? 'Enviando…' : 'Solicitar reserva' }}
              </button>
              <p class="mt-3 text-center text-xs text-muted">
                El establecimiento la confirma por WhatsApp. Pagar por adelantado es opcional.
              </p>
            </form>
          }
        }
      } @else {
        <div class="py-24 text-center">
          <h1 class="text-2xl font-extrabold">
            {{ unavailable() ? 'No pudimos cargar esta página' : 'No encontramos este establecimiento' }}
          </h1>
          <p class="mt-3 text-muted">
            {{ unavailable() ? 'Inténtalo de nuevo en un momento.' : 'Revisa que el enlace esté bien escrito.' }}
          </p>
          <a routerLink="/" class="mt-6 inline-block font-bold underline">Ir al inicio</a>
        </div>
      }
    </main>
  `,
})
export class BookingPage {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly responseInit = inject(RESPONSE_INIT, { optional: true });
  private readonly slug = this.route.snapshot.paramMap.get('slug') ?? '';

  protected readonly sportLabel = SPORT_LABEL;
  protected readonly initials = initials;
  protected readonly to12h = to12h;
  protected readonly cop = formatCOP;
  protected readonly days = nextDays(14);

  private readonly result = toSignal(this.route.data.pipe(map((d) => d['page'] as PageResult)), { requireSync: true });
  protected readonly page = computed(() => {
    const r = this.result();
    return 'page' in r ? r.page : null;
  });
  protected readonly unavailable = computed(() => {
    const r = this.result();
    return 'error' in r && r.error === 'unavailable';
  });

  // Lo que la persona eligió. Lo que se usa de verdad (deporte, cancha) se calcula a partir de esto.
  private readonly pickedSport = signal<Sport | null>(null);
  private readonly pickedCourt = signal<string | null>(null);
  protected readonly date = signal(this.days[0].value);
  protected readonly picked = signal<Slot | null>(null);
  protected readonly choice = signal<PaymentChoice>('AT_COURT');

  protected readonly sports = computed(() => [...new Set((this.page()?.courts ?? []).map((c) => c.sport))]);
  protected readonly sport = computed(() => {
    const all = this.sports();
    const chosen = this.pickedSport();
    return chosen && all.includes(chosen) ? chosen : (all[0] ?? null);
  });
  protected readonly courts = computed(() => (this.page()?.courts ?? []).filter((c) => c.sport === this.sport()));
  protected readonly court = computed(() => {
    const all = this.courts();
    return all.find((c) => c.id === this.pickedCourt()) ?? all[0] ?? null;
  });

  private readonly slotsState = signal<SlotsState>({ status: 'idle' });
  protected readonly loading = computed(() => this.slotsState().status === 'loading');
  protected readonly ready = computed(() => this.slotsState().status === 'ready');
  protected readonly slots = computed(() => {
    const s = this.slotsState();
    return s.status === 'ready' ? s.slots : [];
  });
  protected readonly slotsError = computed(() => {
    const s = this.slotsState();
    return s.status === 'error' ? s.message : '';
  });
  protected readonly notice = signal('');

  protected readonly payOptions = computed(() => {
    const court = this.court();
    const slot = this.picked();
    if (!court || !slot) return [];
    const options: { value: PaymentChoice; label: string }[] = [{ value: 'AT_COURT', label: 'En la cancha' }];
    if (court.allowDeposit && court.depositAmount !== null) {
      options.push({ value: 'DEPOSIT', label: `Abono ${formatCOP(Math.min(court.depositAmount, slot.price))}` });
    }
    if (court.allowFullPayment) options.push({ value: 'FULL', label: `Todo ${formatCOP(slot.price)}` });
    return options;
  });
  protected readonly effectiveChoice = computed(() =>
    this.payOptions().some((o) => o.value === this.choice()) ? this.choice() : 'AT_COURT',
  );

  protected readonly name = signal('');
  protected readonly phone = signal('');
  protected readonly submitting = signal(false);
  protected readonly formError = signal('');
  protected readonly fieldErrors = signal<Record<string, string>>({});
  protected readonly phoneOk = computed(() => isMobilePhone(this.phone()));
  protected readonly canSubmit = computed(
    () => this.name().trim().length >= 2 && this.phoneOk() && !this.submitting(),
  );

  private readonly reload = new Subject<void>();

  constructor() {
    const result = this.result();
    if ('page' in result) {
      this.setMeta(result.page);
    } else {
      this.title.setTitle('Establecimiento no encontrado · CanchaYa');
      if (this.responseInit) this.responseInit.status = result.error === 'not-found' ? 404 : 503;
    }

    this.reload
      .pipe(
        switchMap(() => {
          const court = this.court();
          if (!court) return of<SlotsState>({ status: 'idle' });
          return this.api.availability(this.slug, court.id, this.date()).pipe(
            map((a): SlotsState => ({ status: 'ready', slots: a.slots })),
            startWith<SlotsState>({ status: 'loading' }),
            catchError((err: unknown) => of<SlotsState>({ status: 'error', message: friendlyError(err).message })),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.slotsState.set(state));

    // Los horarios dependen de la hora actual, así que se piden desde el navegador y no desde el servidor.
    afterNextRender(() => this.reload.next());
  }

  private setMeta(p: PublicPage) {
    const title = `${p.establishment.name} · Reserva tu cancha`;
    const description = `Reserva tu cancha en ${p.establishment.name}, ${p.establishment.city}. Elige deporte, fecha y hora.`;
    this.title.setTitle(title);
    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ property: 'og:type', content: 'website' });
    this.meta.updateTag({ property: 'og:site_name', content: 'CanchaYa' });
    this.meta.updateTag({ property: 'og:title', content: title });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:url', content: `${environment.siteUrl}/${p.establishment.slug}` });
    this.meta.updateTag({ property: 'og:image', content: `${environment.siteUrl}/og-default.png` });
    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
  }

  protected refresh() {
    this.picked.set(null);
    this.reload.next();
  }

  protected chooseSport(sport: Sport) {
    this.pickedSport.set(sport);
    this.pickedCourt.set(null);
    this.notice.set('');
    this.refresh();
  }

  protected chooseCourt(id: string) {
    this.pickedCourt.set(id);
    this.notice.set('');
    this.refresh();
  }

  protected chooseDate(date: string) {
    this.date.set(date);
    this.notice.set('');
    this.refresh();
  }

  protected pick(slot: Slot) {
    this.picked.set(slot);
    this.formError.set('');
    this.fieldErrors.set({});
    setTimeout(() => document.getElementById('datos')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
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
    this.api
      .book(this.slug, {
        courtId: court.id,
        start: slot.start,
        name: this.name().trim(),
        phone: normalizePhone(this.phone()),
        paymentChoice: this.effectiveChoice(),
      })
      .subscribe({
        next: (booking) => void this.router.navigate(['/r', booking.publicToken]),
        error: (err: unknown) => {
          const e = friendlyError(err);
          this.submitting.set(false);
          if (e.status === 409 && /horario/i.test(e.message)) {
            // Alguien tomó el turno justo antes: se actualiza la lista y se avisa.
            this.notice.set(e.message);
            this.refresh();
          } else {
            this.formError.set(e.message);
            this.fieldErrors.set(e.fields);
          }
        },
      });
  }
}
