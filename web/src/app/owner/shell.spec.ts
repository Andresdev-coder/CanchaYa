import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../core/auth';
import type { Role } from '../core/models';
import { Shell } from './shell';

async function setup(role: Role) {
  await TestBed.configureTestingModule({
    imports: [Shell],
    providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
  }).compileComponents();
  TestBed.inject(AuthService).me.set({
    user: { id: 'u1', name: 'Pepe', email: 'p@test.com', role, establishmentId: 'e1' },
    establishment: { id: 'e1', slug: 'los-llanos', name: 'Los Llanos', city: 'Yopal', phone: null, timezone: 'America/Bogota', paymentInstructions: null },
  });
  const fixture = TestBed.createComponent(Shell);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  // El menú aparece dos veces (computador y celular): se cuenta cada enlace una sola vez.
  const links = [...new Set(Array.from(el.querySelectorAll('nav a')).map((a) => a.textContent?.trim()))];
  return { links, el };
}

describe('Menú', () => {
  it('el dueño ve toda la configuración', async () => {
    const { links } = await setup('OWNER');
    expect(links).toEqual(['Agenda', 'Canchas y precios', 'Equipo', 'Mi establecimiento', 'Mi cuenta']);
  });

  it('el empleado solo ve la agenda y su cuenta', async () => {
    const { links } = await setup('STAFF');
    expect(links).toEqual(['Agenda', 'Mi cuenta']);
  });

  it('muestra el rol de quien tiene la sesión', async () => {
    expect((await setup('STAFF')).el.textContent).toContain('Empleado');
  });
});
