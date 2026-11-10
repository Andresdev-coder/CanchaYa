import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="mx-auto grid min-h-dvh w-full max-w-lg place-items-center px-5 text-center">
      <div>
        <p class="text-2xl font-extrabold">Cancha<span class="rounded-md bg-lime px-1.5">Ya</span></p>
        <h1 class="mt-6 text-4xl leading-tight font-extrabold">Reserva tu cancha sin escribirle a nadie.</h1>
        <p class="mt-4 text-muted">
          Entra al enlace de tu establecimiento para elegir deporte, fecha y hora.
        </p>
      </div>
    </main>
  `,
})
export class Home {}
