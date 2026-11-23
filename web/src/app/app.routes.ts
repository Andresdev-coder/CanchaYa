import { Routes } from '@angular/router';
import { authGuard, guestGuard, ownerGuard } from './core/guards';
import { Home } from './home/home';
import { NotFound } from './home/not-found';
import { BookingLink } from './public/booking-link';
import { BookingPage } from './public/booking-page';
import { pageResolver } from './public/page.resolver';

export const routes: Routes = [
  { path: '', component: Home, title: 'CanchaYa · reserva tu cancha' },

  // La zona privada se carga solo cuando se entra a ella: un jugador que reserva no descarga la agenda.
  {
    path: 'ingresar',
    canActivate: [guestGuard],
    loadComponent: () => import('./auth/login').then((m) => m.Login),
    title: 'Ingresar · CanchaYa',
  },
  {
    path: 'registro',
    canActivate: [guestGuard],
    loadComponent: () => import('./auth/register').then((m) => m.Register),
    title: 'Crea tu establecimiento · CanchaYa',
  },
  {
    path: 'app',
    canActivate: [authGuard],
    loadComponent: () => import('./owner/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'agenda' },
      {
        path: 'agenda',
        loadComponent: () => import('./owner/agenda').then((m) => m.Agenda),
        title: 'Agenda · CanchaYa',
      },
      // La configuración es solo del dueño.
      {
        path: 'canchas',
        canActivate: [ownerGuard],
        loadComponent: () => import('./owner/courts').then((m) => m.Courts),
        title: 'Canchas y precios · CanchaYa',
      },
      {
        path: 'establecimiento',
        canActivate: [ownerGuard],
        loadComponent: () => import('./owner/settings').then((m) => m.Settings),
        title: 'Mi establecimiento · CanchaYa',
      },
    ],
  },

  // El enlace privado de una reserva. Va antes que ':slug' para que 'r' no se tome por un establecimiento.
  { path: 'r/:token', component: BookingLink, title: 'Tu reserva · CanchaYa' },
  { path: ':slug', component: BookingPage, resolve: { page: pageResolver } },
  { path: '**', component: NotFound },
];
