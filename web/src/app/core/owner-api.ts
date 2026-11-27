import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import type {
  CourtBody,
  Establishment,
  EstablishmentPatch,
  ManualBookingBody,
  MemberPatch,
  NewMemberBody,
  OpeningHour,
  OwnerBooking,
  OwnerCourt,
  PaymentBody,
  PriceRule,
  TeamMember,
} from './models';

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

  createCourt(body: CourtBody) {
    return this.http.post<OwnerCourt>(`${this.base}/courts`, body);
  }

  updateCourt(id: string, body: Partial<CourtBody>) {
    return this.http.patch<OwnerCourt>(`${this.base}/courts/${id}`, body);
  }

  prices(courtId: string) {
    return this.http.get<PriceRule[]>(`${this.base}/courts/${courtId}/prices`);
  }

  /** Reemplaza todas las franjas de precio de la cancha. */
  setPrices(courtId: string, rules: Omit<PriceRule, 'id'>[]) {
    return this.http.put<PriceRule[]>(`${this.base}/courts/${courtId}/prices`, { rules });
  }

  updateEstablishment(patch: EstablishmentPatch) {
    return this.http.patch<Establishment>(`${this.base}/establishment`, patch);
  }

  /** Reemplaza todo el horario: un día que no se envía queda cerrado. */
  setHours(days: OpeningHour[]) {
    return this.http.put<OpeningHour[]>(`${this.base}/establishment/hours`, { days });
  }

  team() {
    return this.http.get<TeamMember[]>(`${this.base}/users`);
  }

  createMember(body: NewMemberBody) {
    return this.http.post<TeamMember>(`${this.base}/users`, body);
  }

  updateMember(id: string, patch: MemberPatch) {
    return this.http.patch<TeamMember>(`${this.base}/users/${id}`, patch);
  }

  /** Cambia la contraseña de quien tiene la sesión abierta. Devuelve una sesión nueva: las anteriores dejan de servir. */
  changePassword(currentPassword: string, newPassword: string) {
    return this.http.post<{ token: string }>(`${this.base}/auth/change-password`, { currentPassword, newPassword });
  }
}
