import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { WritableSignal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { friendlyError } from '../core/api';
import { AuthService } from '../core/auth';
import { normalizePhone } from '../core/format';
import { AuthShell } from './auth-shell';

@Component({
  selector: 'app-register',
  imports: [AuthShell, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-auth-shell>
      <div class="flex border-b-[3px] border-line">
        <a routerLink="/ingresar" class="flex-1 py-3 text-center font-bold text-muted">Ingresar</a>
        <span class="-mb-[3px] flex-1 border-b-[3px] border-ink py-3 text-center font-bold">Crear cuenta</span>
      </div>

      <form class="mt-2" (submit)="$event.preventDefault(); submit()">
        <label class="label block" for="establishmentName">Nombre del establecimiento</label>
        <input id="establishmentName" class="field" autocomplete="organization" [value]="establishmentName()" (input)="onInput(establishmentName, $event)" />
        @if (fieldErrors()['establishmentName']) {
          <p class="mt-1 text-sm text-danger">{{ fieldErrors()['establishmentName'] }}</p>
        }

        <label class="label block" for="name">Tu nombre</label>
        <input id="name" class="field" autocomplete="name" [value]="name()" (input)="onInput(name, $event)" />
        @if (fieldErrors()['name']) {
          <p class="mt-1 text-sm text-danger">{{ fieldErrors()['name'] }}</p>
        }

        <label class="label block" for="email">Correo</label>
        <input id="email" class="field" type="email" autocomplete="email" [value]="email()" (input)="onInput(email, $event)" />
        @if (fieldErrors()['email']) {
          <p class="mt-1 text-sm text-danger">{{ fieldErrors()['email'] }}</p>
        }

        <label class="label block" for="password">Contraseña (mínimo 8)</label>
        <input id="password" class="field" type="password" autocomplete="new-password" [value]="password()" (input)="onInput(password, $event)" />
        @if (fieldErrors()['password']) {
          <p class="mt-1 text-sm text-danger">{{ fieldErrors()['password'] }}</p>
        }

        <label class="label block" for="phone">WhatsApp del establecimiento (opcional)</label>
        <input id="phone" class="field" type="tel" inputmode="numeric" autocomplete="tel" placeholder="310 123 4567" [value]="phone()" (input)="onInput(phone, $event)" />
        @if (fieldErrors()['phone']) {
          <p class="mt-1 text-sm text-danger">{{ fieldErrors()['phone'] }}</p>
        }

        @if (error()) {
          <p role="alert" class="mt-4 rounded-xl bg-white p-3 text-sm font-semibold text-danger">{{ error() }}</p>
        }

        <button type="submit" class="btn-primary mt-6" [disabled]="busy() || !valid()">
          {{ busy() ? 'Creando…' : 'Crear mi establecimiento' }}
        </button>
      </form>
    </app-auth-shell>
  `,
})
export class Register {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly establishmentName = signal('');
  protected readonly name = signal('');
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly phone = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly fieldErrors = signal<Record<string, string>>({});

  protected readonly valid = computed(
    () =>
      this.establishmentName().trim().length >= 2 &&
      this.name().trim().length >= 2 &&
      this.email().includes('@') &&
      this.password().length >= 8,
  );

  protected onInput(target: WritableSignal<string>, event: Event) {
    target.set((event.target as HTMLInputElement).value);
  }

  protected submit() {
    if (this.busy() || !this.valid()) return;
    this.busy.set(true);
    this.error.set('');
    this.fieldErrors.set({});
    const phone = normalizePhone(this.phone());

    this.auth
      .register({
        establishmentName: this.establishmentName().trim(),
        name: this.name().trim(),
        email: this.email().trim().toLowerCase(),
        password: this.password(),
        phone: phone || undefined,
      })
      .subscribe({
        next: () => void this.router.navigate(['/app']),
        error: (err: unknown) => {
          const e = friendlyError(err);
          this.busy.set(false);
          this.error.set(e.message);
          this.fieldErrors.set(e.fields);
        },
      });
  }
}
