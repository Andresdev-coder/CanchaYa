import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // La portada no cambia: se genera una sola vez al compilar.
  { path: '', renderMode: RenderMode.Prerender },
  // Ingresar y la zona privada tienen la sesión en el navegador: no se generan en el servidor.
  { path: 'ingresar', renderMode: RenderMode.Client },
  { path: 'registro', renderMode: RenderMode.Client },
  { path: 'app', renderMode: RenderMode.Client },
  { path: 'app/**', renderMode: RenderMode.Client },
  // El enlace privado tiene datos de una persona: solo se muestra en el navegador.
  { path: 'r/:token', renderMode: RenderMode.Client },
  // La página de cada establecimiento se genera en cada petición, para que WhatsApp vea su nombre.
  { path: '**', renderMode: RenderMode.Server },
];
