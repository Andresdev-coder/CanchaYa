import { ChangeDetectionStrategy, Component, RESPONSE_INIT, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="mx-auto grid min-h-dvh w-full max-w-lg place-items-center px-5 text-center">
      <div>
        <h1 class="text-3xl font-extrabold">Esta página no existe</h1>
        <p class="mt-3 text-muted">Revisa que el enlace esté bien escrito.</p>
        <a routerLink="/" class="mt-6 inline-block font-bold underline">Ir al inicio</a>
      </div>
    </main>
  `,
})
export class NotFound {
  constructor() {
    inject(Title).setTitle('Página no encontrada · CanchaYa');
    const init = inject(RESPONSE_INIT, { optional: true });
    if (init) init.status = 404;
  }
}
