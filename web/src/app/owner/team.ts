import { ChangeDetectionStrategy, Component, afterNextRender, inject, signal } from '@angular/core';
import { friendlyError } from '../core/api';
import { AuthService } from '../core/auth';
import type { TeamMember } from '../core/models';
import { OwnerApi } from '../core/owner-api';
import { MemberEditor } from './member-editor';

@Component({
  selector: 'app-team',
  imports: [MemberEditor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="max-w-3xl p-4 lg:p-8">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h1 class="text-2xl font-extrabold">Equipo</h1>
        <button type="button" class="min-h-11 cursor-pointer rounded-xl bg-ink px-4 font-extrabold text-lime" (click)="adding.set(true)">Agregar persona</button>
      </div>
      <p class="mt-2 text-sm text-muted">
        Cada persona ingresa con su propio correo y contraseña. Los empleados atienden la agenda y cobran, pero no cambian la configuración.
      </p>

      @if (error()) {
        <p role="alert" class="mt-4 rounded-xl bg-white p-3 text-sm font-semibold text-danger">{{ error() }}</p>
      }

      @if (loading()) {
        <p class="py-16 text-center text-muted" aria-live="polite">Cargando el equipo…</p>
      } @else {
        <ul class="mt-5 space-y-3">
          @for (m of members(); track m.id) {
            <li>
              @if (m.role === 'OWNER') {
                <div class="flex items-center justify-between gap-3 rounded-2xl border border-line bg-white p-5">
                  <div class="min-w-0">
                    <p class="truncate font-extrabold">{{ m.name }}@if (m.id === me()?.id) { <span class="font-semibold text-muted"> (tú)</span> }</p>
                    <p class="truncate text-sm text-muted">{{ m.email }}</p>
                  </div>
                  <span class="shrink-0 rounded-lg bg-ink px-2.5 py-1 text-xs font-bold text-white">Dueño</span>
                </div>
              } @else {
                <button type="button" class="flex w-full cursor-pointer items-center justify-between gap-3 rounded-2xl border border-line bg-white p-5 text-left" [class.opacity-60]="!m.active" (click)="editing.set(m)">
                  <span class="min-w-0">
                    <span class="block truncate font-extrabold">{{ m.name }}</span>
                    <span class="block truncate text-sm text-muted">{{ m.email }}</span>
                  </span>
                  <span class="shrink-0 rounded-lg px-2.5 py-1 text-xs font-bold" [class]="m.active ? 'bg-lime-soft' : 'bg-taken text-muted'">
                    {{ m.active ? 'Empleado' : 'Desactivado' }}
                  </span>
                </button>
              }
            </li>
          }
        </ul>
        @if (members().length === 1) {
          <p class="mt-4 rounded-2xl bg-white p-5 text-muted">Todavía no has agregado a nadie. Agrega a quien atiende tu establecimiento para que no tenga que usar tu contraseña.</p>
        }
      }
    </section>

    @if (adding() || editing()) {
      <div class="fixed inset-0 z-30 bg-ink/40" (click)="close()" aria-hidden="true"></div>
      <aside class="fixed inset-y-0 right-0 z-40 w-full max-w-md bg-white shadow-xl" role="dialog" aria-modal="true" aria-label="Persona del equipo">
        <app-member-editor [member]="editing()" (saved)="onSaved()" (closed)="close()" />
      </aside>
    }
  `,
})
export class Team {
  private readonly api = inject(OwnerApi);

  protected readonly me = inject(AuthService).user;
  protected readonly members = signal<TeamMember[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly adding = signal(false);
  protected readonly editing = signal<TeamMember | null>(null);

  constructor() {
    afterNextRender(() => this.load());
  }

  private load() {
    this.api.team().subscribe({
      next: (members) => {
        this.members.set(members);
        this.error.set('');
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(friendlyError(err).message);
        this.loading.set(false);
      },
    });
  }

  protected close() {
    this.adding.set(false);
    this.editing.set(null);
  }

  protected onSaved() {
    this.close();
    this.load();
  }
}
