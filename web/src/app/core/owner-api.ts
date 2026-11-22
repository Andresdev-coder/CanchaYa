import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import type { ManualBookingBody, OpeningHour, OwnerBooking, OwnerCourt, PaymentBody } from './models';

/** Peticiones de la zona privada. El token lo agrega el interceptor. */
@Injectable({ providedIn: 'root' })
export class OwnerApi {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  bookings(date: string) {
    return this.http.get<OwnerBooking[]>(`${this.base}/bookings`, { params: new HttpParams().set('date', date) });
  }

  createManual(body: ManualBookingBody) {
    return this.http.post<OwnerBooking>(`${this.base}/bookings`, body);
  }

  confirm(id: string) {
    return this.http.post<OwnerBooking>(`${this.base}/bookings/${id}/confirm`, {});
  }

  cancel(id: string, reason?: string) {
    return this.http.post<OwnerBooking>(`${this.base}/bookings/${id}/cancel`, reason ? { reason } : {});
  }

  complete(id: string) {
    return this.http.post<OwnerBooking>(`${this.base}/bookings/${id}/complete`, {});
  }

  noShow(id: string) {
    return this.http.post<OwnerBooking>(`${this.base}/bookings/${id}/no-show`, {});
  }

  pay(id: string, body: PaymentBody) {
    return this.http.post<OwnerBooking>(`${this.base}/bookings/${id}/payments`, body);
  }

  voidPayment(id: string, paymentId: string, reason: string) {
    return this.http.post<OwnerBooking>(`${this.base}/bookings/${id}/payments/${paymentId}/void`, { reason });
  }

  courts() {
    return this.http.get<OwnerCourt[]>(`${this.base}/courts`, {
      params: new HttpParams().set('includeInactive', 'true'),
    });
  }

  hours() {
    return this.http.get<OpeningHour[]>(`${this.base}/establishment/hours`);
  }
}
