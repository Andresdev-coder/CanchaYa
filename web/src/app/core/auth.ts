import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, map, of, switchMap, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import type { Establishment, LoginResponse, Me, RegisterBody, RegisterResponse } from './models';
import { session } from './session';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly base = environment.apiUrl;

  readonly me = signal<Me | null>(null);
  readonly user = computed(() => this.me()?.user ?? null);
  readonly establishment = computed(() => this.me()?.establishment ?? null);
  readonly isOwner = computed(() => this.user()?.role === 'OWNER');

  login(email: string, password: string) {
    return this.http.post<LoginResponse>(`${this.base}/auth/login`, { email, password }).pipe(
      tap((r) => session.set(r.token)),
      switchMap(() => this.load()),
    );
  }

  register(body: RegisterBody) {
    return this.http.post<RegisterResponse>(`${this.base}/auth/register`, body).pipe(
      tap((r) => {
        session.set(r.token);
        this.me.set({ user: r.user, establishment: r.establishment });
      }),
    );
  }

  /** Recupera la sesión guardada. Si ya está cargada no vuelve a pedirla. Responde si hay una sesión válida. */
  restore(): Observable<boolean> {
    if (this.me()) return of(true);
    if (session.get() === null) return of(false);
    return this.load().pipe(
      map(() => true),
      catchError(() => {
        session.clear();
        return of(false);
      }),
    );
  }

  /** Después de editar los datos del establecimiento, se actualiza lo que muestra la aplicación. */
  setEstablishment(establishment: Establishment) {
    this.me.update((m) => (m ? { ...m, establishment } : m));
  }

  logout() {
    session.clear();
    this.me.set(null);
    void this.router.navigate(['/ingresar']);
  }

  private load() {
    return this.http.get<Me>(`${this.base}/auth/me`).pipe(tap((m) => this.me.set(m)));
  }
}
