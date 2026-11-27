import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { WritableSignal } from '@angular/core';
import { friendlyError } from '../core/api';
import { AuthService } from '../core/auth';
import { OwnerApi } from '../core/owner-api';
import { session } from '../core/session';

@Component({
  selector: 'app-account',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="max-w-xl space-y-6 p-4 lg:p-8">
      <h1 class="text-2xl font-extrabold">Mi cuenta</h1>

      @if (auth.user(); as u) {
        <dl class="rounded-2xl border border-line bg-white px-5 py-2">
          <div class="flex justify-between gap-4 border-b border-line py-3 text-sm">
            <dt class="text-muted">Nombre</dt>
            <dd class="font-bold">{{ u.name }}</dd>
          </div>
          <div class="flex justify-between gap-4 border-b border-line py-3 text-sm">
            <dt class="text-muted">Correo</dt>
            <dd class="font-bold">{{ u.email }}</dd>
          </div>
          <div class="flex justify-between gap-4 py-3 text-sm">
            <dt class="text-muted">Rol</dt>
            <dd class="font-bold">{{ auth.isOwner() ? 'Dueño' : 'Empleado' }}</dd>
          </div>
        </dl>
      }

      <form class="rounded-2xl border border-line bg-white p-5" (submit)="$event.preventDefault(); submit()">
        <h2 class="text-lg font-extrabold">Cambiar mi contraseña</h2>

        <label class="mt-4 block text-sm font-bold" for="current">Contraseña actual</label>
        <input id="current" class="field mt-1" type="password" autocomplete="current-password" [value]="current()" (input)="onInput(current, $event)" />

        <label class="mt-4 block text-sm font-bold" for="next">Contraseña nueva (mínimo 8)</label>
        <input id="next" class="field mt-1" type="password" autocomplete="new-password" [value]="next()" (input)="onInput(next, $event)" />

        <label class="mt-4 block text-sm font-bold" for="again">Repite la contraseña nueva</label>
        <input id="again" class="field mt-1" type="password" autocomplete="new-password" [value]="again()" (input)="onInput(again, $event)" />

        @if (error()) {
          <p role="alert" class="mt-4 rounded-xl bg-soft p-3 text-sm font-semibold text-danger">{{ error() }}</p>
        }
        @if (done()) {
          <p role="status" class="mt-4 rounded-xl bg-lime-soft p-3 text-sm font-bold">Contraseña cambiada. Tus sesiones en otros dispositivos se cerraron.</p>
        }

        <button type="submit" class="btn-primary mt-5" [disabled]="busy() || !canSubmit()">{{ busy() ? 'Guardando…' : 'Cambiar contraseña' }}</button>
        @if (problem(); as p) {
          <p class="mt-2 text-center text-sm text-muted">{{ p }}</p>
        }
      </form>
    </section>
  `,
})
export class Account {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(OwnerApi);

  protected readonly current = signal('');
  protected readonly next = signal('');
  protected readonly again = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly done = signal(false);

  /** Qué falta para poder guardar. No aparece hasta que la persona empieza a escribir. */
  protected readonly problem = computed(() => {
    if (!this.current() && !this.next() && !this.again()) return null;
    if (!this.current()) return 'Escribe tu contraseña actual.';
    if (this.next().length < 8) return 'La contraseña nueva debe tener al menos 8 caracteres.';
    if (this.next() === this.current()) return 'La contraseña nueva debe ser distinta de la actual.';
    if (this.next() !== this.again()) return 'Las contraseñas nuevas no coinciden.';
    return null;
  });

  /** El botón solo se activa cuando están los tres campos y todo es válido. */
  protected readonly canSubmit = computed(() => !!this.current() && !!this.next() && !this.problem());

  protected onInput(target: WritableSignal<string>, event: Event) {
    target.set((event.target as HTMLInputElement).value);
    this.done.set(false);
  }

  protected submit() {
    if (this.busy() || !this.canSubmit()) return;
    this.busy.set(true);
    this.error.set('');
    this.done.set(false);
    this.api.changePassword(this.current(), this.next()).subscribe({
      next: ({ token }) => {
        // La sesión anterior ya no sirve: se guarda la nueva antes de que la persona haga otra cosa.
        session.set(token);
        this.current.set('');
        this.next.set('');
        this.again.set('');
        this.busy.set(false);
        this.done.set(true);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.error.set(friendlyError(err).message);
      },
    });
  }
}
