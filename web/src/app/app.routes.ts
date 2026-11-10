import { Routes } from '@angular/router';
import { Home } from './home/home';
import { NotFound } from './home/not-found';
import { BookingLink } from './public/booking-link';
import { BookingPage } from './public/booking-page';
import { pageResolver } from './public/page.resolver';

export const routes: Routes = [
  { path: '', component: Home, title: 'CanchaYa · reserva tu cancha' },
  // El enlace privado de una reserva. Va antes que ':slug' para que 'r' no se tome por un establecimiento.
  { path: 'r/:token', component: BookingLink, title: 'Tu reserva · CanchaYa' },
  { path: ':slug', component: BookingPage, resolve: { page: pageResolver } },
  { path: '**', component: NotFound },
];
