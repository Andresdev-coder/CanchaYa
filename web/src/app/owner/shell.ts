import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth';

/** El marco de la zona privada: menú lateral en computador y barra superior en celular. */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-dvh lg:flex">
      <header class="flex items-center justify-between bg-ink px-4 py-3 text-white lg:hidden">
        <p class="text-lg font-extrabold">Cancha<span class="ml-0.5 rounded-md bg-lime px-1 text-ink">Ya</span></p>
        <button type="button" class="min-h-11 px-2 text-sm font-bold text-[#c9d4cc]" (click)="auth.logout()">Cerrar sesión</button>
      </header>

      <nav class="flex gap-1 overflow-x-auto bg-ink px-3 pb-3 lg:hidden" aria-label="Secciones">
        @for (item of nav(); track item.path) {
          <a [routerLink]="item.path" routerLinkActive="bg-lime text-ink" class="shrink-0 rounded-xl px-3 py-2 text-sm font-bold text-[#c9d4cc]">{{ item.label }}</a>
        }
      </nav>

      <aside class="hidden w-60 shrink-0 flex-col bg-ink p-4 text-[#c9d4cc] lg:flex">
        <p class="mx-2 mb-8 text-xl font-extrabold text-white">Cancha<span class="ml-0.5 rounded-md bg-lime px-1 text-ink">Ya</span></p>

        <nav class="flex flex-col gap-1">
          @for (item of nav(); track item.path) {
            <a [routerLink]="item.path" routerLinkActive="bg-lime text-ink" class="rounded-xl px-3 py-2.5 font-bold">{{ item.label }}</a>
          }
        </nav>

        <div class="mt-auto space-y-3">
          @if (auth.establishment(); as e) {
            <div class="rounded-xl bg-white/5 p-3">
              <p class="text-xs font-bold tracking-wider text-[#a9bab0] uppercase">Tu página de reservas</p>
              <p class="mt-1 truncate text-sm font-bold text-white">{{ publicUrl() }}</p>
              <button type="button" class="mt-2 min-h-9 rounded-lg bg-lime px-3 text-sm font-extrabold text-ink" (click)="copy()">
                {{ copied() ? 'Copiado' : 'Copiar enlace' }}
              </button>
            </div>
            <div class="px-1 text-sm">
              <p class="truncate font-bold text-white">{{ e.name }}</p>
              <p class="truncate text-[#a9bab0]">{{ auth.user()?.name }} · {{ auth.isOwner() ? 'Dueño' : 'Empleado' }}</p>
            </div>
          }
          <button type="button" class="min-h-11 w-full rounded-xl px-3 text-left text-sm font-bold hover:bg-white/5" (click)="auth.logout()">
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main class="min-w-0 flex-1"><router-outlet /></main>
    </div>
  `,
})
export class Shell {
  protected readonly auth = inject(AuthService);
  protected readonly copied = signal(false);

  protected readonly nav = computed(() => {
    const items = [{ path: '/app/agenda', label: 'Agenda' }];
    if (this.auth.isOwner()) {
      items.push(
        { path: '/app/canchas', label: 'Canchas y precios' },
        { path: '/app/equipo', label: 'Equipo' },
        { path: '/app/establecimiento', label: 'Mi establecimiento' },
      );
    }
    items.push({ path: '/app/cuenta', label: 'Mi cuenta' });
    return items;
  });

  protected readonly publicUrl = computed(() => {
    const slug = this.auth.establishment()?.slug ?? '';
    return `${environment.siteUrl.replace(/^https?:\/\//, '')}/${slug}`;
  });

  protected copy() {
    const slug = this.auth.establishment()?.slug ?? '';
    void navigator.clipboard.writeText(`${environment.siteUrl}/${slug}`).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }
}
