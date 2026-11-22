import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import type { WritableSignal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { friendlyError } from '../core/api';
import { AuthService } from '../core/auth';
import { AuthShell } from './auth-shell';

@Component({
  selector: 'app-login',
  imports: [AuthShell, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-auth-shell>
      <div class="flex border-b-[3px] border-line">
        <span class="-mb-[3px] flex-1 border-b-[3px] border-ink py-3 text-center font-bold">Ingresar</span>
        <a routerLink="/registro" class="flex-1 py-3 text-center font-bold text-muted">Crear cuenta</a>
      </div>

      <form class="mt-2" (submit)="$event.preventDefault(); submit()">
        <label class="label block" for="email">Correo</label>
        <input id="email" class="field" type="email" autocomplete="email" [value]="email()" (input)="onInput(email, $event)" />

        <label class="label block" for="password">Contraseña</label>
        <input id="password" class="field" type="password" autocomplete="current-password" [value]="password()" (input)="onInput(password, $event)" />

        @if (error()) {
          <p role="alert" class="mt-4 rounded-xl bg-white p-3 text-sm font-semibold text-danger">{{ error() }}</p>
        }

        <button type="submit" class="btn-primary mt-6" [disabled]="busy() || !email() || !password()">
          {{ busy() ? 'Ingresando…' : 'Ingresar' }}
        </button>
        <p class="mt-5 text-center text-sm text-muted">
          ¿Tu establecimiento aún no está? <a routerLink="/registro" class="font-bold text-ink underline">Créalo aquí</a>
        </p>
      </form>
    </app-auth-shell>
  `,
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected onInput(target: WritableSignal<string>, event: Event) {
    target.set((event.target as HTMLInputElement).value);
  }

  protected submit() {
    if (this.busy() || !this.email() || !this.password()) return;
    this.busy.set(true);
    this.error.set('');
    this.auth.login(this.email().trim().toLowerCase(), this.password()).subscribe({
      next: () => void this.router.navigate(['/app']),
      error: (err: unknown) => {
        this.busy.set(false);
        this.error.set(friendlyError(err).message);
      },
    });
  }
}
