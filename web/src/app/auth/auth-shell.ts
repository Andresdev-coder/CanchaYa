import { ChangeDetectionStrategy, Component } from '@angular/core';

/** El marco de ingresar y registrarse: panel de marca a la izquierda en computador, y solo el formulario en celular. */
@Component({
  selector: 'app-auth-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-dvh lg:grid lg:grid-cols-[1.05fr_1fr]">
      <aside class="hidden flex-col justify-between bg-ink p-12 text-white lg:flex">
        <p class="text-2xl font-extrabold">Cancha<span class="ml-0.5 rounded-md bg-lime px-1.5 text-ink">Ya</span></p>
        <div>
          <h2 class="text-4xl leading-tight font-extrabold">Tu agenda de canchas, siempre a la mano.</h2>
          <p class="mt-3 text-lg text-[#c9d4cc]">Entra para ver las reservas del día, confirmar y cobrar.</p>
        </div>
        <p class="text-sm text-[#a9bab0]">¿Eres jugador? No necesitas cuenta: entra al enlace de tu cancha.</p>
      </aside>
      <main class="grid place-items-center px-5 py-10">
        <div class="w-full max-w-sm">
          <p class="mb-8 text-2xl font-extrabold lg:hidden">Cancha<span class="ml-0.5 rounded-md bg-lime px-1.5">Ya</span></p>
          <ng-content />
        </div>
      </main>
    </div>
  `,
})
export class AuthShell {}
