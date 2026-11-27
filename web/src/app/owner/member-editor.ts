import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import type { WritableSignal } from '@angular/core';
import { friendlyError } from '../core/api';
import type { TeamMember } from '../core/models';
import { OwnerApi } from '../core/owner-api';
import { generatePassword } from '../core/password';

/** Agrega a una persona al equipo, o edita a un empleado: nombre, activar o desactivar, y restablecer su contraseña. */
@Component({
  selector: 'app-member-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex h-full flex-col">
      <div class="flex items-center justify-between gap-3 border-b border-line p-5">
        <h2 class="text-2xl font-extrabold">{{ member() ? 'Editar persona' : 'Agregar persona' }}</h2>
        <button type="button" class="chip size-11 shrink-0 px-0" aria-label="Cerrar" (click)="closed.emit()">✕</button>
      </div>

      <div class="flex-1 space-y-6 overflow-y-auto p-5">
        @if (error()) {
          <p role="alert" class="rounded-xl bg-soft p-3 text-sm font-semibold text-danger">{{ error() }}</p>
        }
        @if (notice()) {
          <p role="status" class="rounded-xl bg-lime-soft p-3 text-sm font-bold">{{ notice() }}</p>
        }

        @if (!member()) {
          <form class="space-y-4" (submit)="$event.preventDefault(); create()">
            <div>
              <label class="text-sm font-bold" for="m-name">Nombre</label>
              <input id="m-name" class="field mt-1" autocomplete="off" [value]="name()" (input)="onInput(name, $event)" />
            </div>
            <div>
              <label class="text-sm font-bold" for="m-email">Correo</label>
              <input id="m-email" class="field mt-1" type="email" autocomplete="off" [value]="email()" (input)="onInput(email, $event)" />
              @if (fieldErrors()['email']) {
                <p class="mt-1 text-sm text-danger">{{ fieldErrors()['email'] }}</p>
              }
            </div>
            <div>
              <label class="text-sm font-bold" for="m-pass">Contraseña para su primer ingreso</label>
              <div class="mt-1 flex gap-2">
                <input id="m-pass" class="field" autocomplete="off" [value]="password()" (input)="onInput(password, $event)" />
                <button type="button" class="chip shrink-0" (click)="password.set(generate())">Generar</button>
              </div>
              <p class="mt-1 text-xs text-muted">Entrégasela a la persona. Después la cambia en «Mi cuenta».</p>
              @if (fieldErrors()['password']) {
                <p class="mt-1 text-sm text-danger">{{ fieldErrors()['password'] }}</p>
              }
            </div>
            <button type="submit" class="btn-primary" [disabled]="busy() || !canCreate()">{{ busy() ? 'Guardando…' : 'Agregar al equipo' }}</button>
            @if (!canCreate() && (name() || email() || password())) {
              <p class="text-center text-sm text-muted">Escribe el nombre, un correo y una contraseña de al menos 8 caracteres.</p>
            }
          </form>
        } @else {
          <section>
            <p class="text-sm font-bold">Correo</p>
            <p class="mt-1 text-muted">{{ member()!.email }}</p>
          </section>

          <form class="space-y-3" (submit)="$event.preventDefault(); rename()">
            <label class="text-sm font-bold" for="m-name">Nombre</label>
            <input id="m-name" class="field" autocomplete="off" [value]="name()" (input)="onInput(name, $event)" />
            <button type="submit" class="btn-outline" [disabled]="busy() || !canRename()">Guardar nombre</button>
          </form>

          <section class="space-y-3 rounded-2xl border border-line p-4">
            <h3 class="font-extrabold">Restablecer contraseña</h3>
            <p class="text-xs text-muted">Si la persona la olvidó. Se cierran sus sesiones abiertas y tendrá que ingresar con la nueva.</p>
            <div class="flex gap-2">
              <input id="m-reset" class="field" autocomplete="off" aria-label="Nueva contraseña" [value]="password()" (input)="onInput(password, $event)" />
              <button type="button" class="chip shrink-0" (click)="password.set(generate())">Generar</button>
            </div>
            <button type="button" class="btn-outline" [disabled]="busy() || password().length < 8" (click)="resetPassword()">Restablecer contraseña</button>
          </section>

          <section>
            <button type="button" class="btn-text" [disabled]="busy()" (click)="toggleActive()">
              {{ member()!.active ? 'Desactivar a esta persona' : 'Activar a esta persona' }}
            </button>
            <p class="mt-1 text-center text-xs text-muted">
              {{ member()!.active ? 'Pierde el acceso de inmediato. Sus reservas y pagos se conservan.' : 'Hoy no puede ingresar.' }}
            </p>
          </section>
        }
      </div>
    </div>
  `,
})
export class MemberEditor {
  /** La persona que se edita, o null para agregar una nueva. */
  readonly member = input<TeamMember | null>(null);
  readonly saved = output<void>();
  readonly closed = output<void>();

  private readonly api = inject(OwnerApi);

  protected readonly generate = generatePassword;
  protected readonly name = linkedSignal(() => this.member()?.name ?? '');
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly fieldErrors = signal<Record<string, string>>({});

  protected readonly canCreate = computed(
    () => this.name().trim().length >= 2 && this.email().includes('@') && this.password().length >= 8,
  );
  protected readonly canRename = computed(
    () => this.name().trim().length >= 2 && this.name().trim() !== this.member()?.name,
  );

  protected onInput(target: WritableSignal<string>, event: Event) {
    target.set((event.target as HTMLInputElement).value);
  }

  private start() {
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    this.fieldErrors.set({});
  }

  private fail(err: unknown) {
    const e = friendlyError(err);
    this.busy.set(false);
    this.error.set(e.message);
    this.fieldErrors.set(e.fields);
  }

  protected create() {
    if (this.busy() || !this.canCreate()) return;
    this.start();
    this.api
      .createMember({ name: this.name().trim(), email: this.email().trim().toLowerCase(), password: this.password() })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.saved.emit();
        },
        error: (err: unknown) => this.fail(err),
      });
  }

  protected rename() {
    const member = this.member();
    if (!member || this.busy() || !this.canRename()) return;
    this.start();
    this.api.updateMember(member.id, { name: this.name().trim() }).subscribe({
      next: () => {
        this.busy.set(false);
        this.saved.emit();
      },
      error: (err: unknown) => this.fail(err),
    });
  }

  protected resetPassword() {
    const member = this.member();
    if (!member || this.busy() || this.password().length < 8) return;
    this.start();
    this.api.updateMember(member.id, { password: this.password() }).subscribe({
      next: () => {
        this.busy.set(false);
        this.notice.set('Contraseña restablecida. Entrégasela a la persona: sus sesiones abiertas se cerraron.');
      },
      error: (err: unknown) => this.fail(err),
    });
  }

  protected toggleActive() {
    const member = this.member();
    if (!member || this.busy()) return;
    this.start();
    this.api.updateMember(member.id, { active: !member.active }).subscribe({
      next: () => {
        this.busy.set(false);
        this.saved.emit();
      },
      error: (err: unknown) => this.fail(err),
    });
  }
}
