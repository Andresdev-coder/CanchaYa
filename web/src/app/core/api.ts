import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import type {
  ApiErrorBody,
  Availability,
  CreateBooking,
  CreatedBooking,
  PlayerBooking,
  PublicPage,
} from './models';

@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  page(slug: string) {
    return this.http.get<PublicPage>(`${this.base}/public/${encodeURIComponent(slug)}`);
  }

  availability(slug: string, courtId: string, date: string) {
    const params = new HttpParams().set('courtId', courtId).set('date', date);
    return this.http.get<Availability>(`${this.base}/public/${encodeURIComponent(slug)}/availability`, { params });
  }

  book(slug: string, body: CreateBooking) {
    return this.http.post<CreatedBooking>(`${this.base}/public/${encodeURIComponent(slug)}/bookings`, body);
  }

  booking(token: string) {
    return this.http.get<PlayerBooking>(`${this.base}/public/bookings/${encodeURIComponent(token)}`);
  }

  cancel(token: string) {
    return this.http.post<PlayerBooking>(`${this.base}/public/bookings/${encodeURIComponent(token)}/cancel`, {});
  }
}

export interface FriendlyError {
  status: number;
  message: string;
  /** Errores por campo, cuando la API validó el formulario. */
  fields: Record<string, string>;
}

/** Convierte cualquier error de la API en un mensaje que se le pueda mostrar a una persona. */
export function friendlyError(err: unknown): FriendlyError {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) {
      return {
        status: 0,
        message: 'No se pudo conectar con el servidor. Revisa tu internet e inténtalo de nuevo.',
        fields: {},
      };
    }
    const body = err.error as ApiErrorBody | null;
    const fields: Record<string, string> = {};
    for (const e of body?.errors ?? []) fields[e.field] = e.message;
    return { status: err.status, message: body?.message ?? 'Algo salió mal. Inténtalo de nuevo.', fields };
  }
  return { status: -1, message: 'Algo salió mal. Inténtalo de nuevo.', fields: {} };
}
