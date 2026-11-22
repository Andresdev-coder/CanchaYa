import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../environments/environment';
import { AuthService } from './auth';
import { authInterceptor } from './auth.interceptor';
import { session } from './session';

function setup() {
  TestBed.configureTestingModule({
    providers: [provideRouter([{ path: 'ingresar', children: [] }]), provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
  });
  return { client: TestBed.inject(HttpClient), http: TestBed.inject(HttpTestingController) };
}

const api = environment.apiUrl;

describe('interceptor de la sesión', () => {
  beforeEach(() => session.clear());

  it('agrega el token a las peticiones de la zona privada', () => {
    session.set('abc');
    const { client, http } = setup();
    client.get(`${api}/bookings`).subscribe();
    expect(http.expectOne(`${api}/bookings`).request.headers.get('Authorization')).toBe('Bearer abc');
  });

  it('no manda el token a las rutas públicas ni al ingreso', () => {
    session.set('abc');
    const { client, http } = setup();
    client.get(`${api}/public/los-llanos`).subscribe();
    client.post(`${api}/auth/login`, {}).subscribe();
    expect(http.expectOne(`${api}/public/los-llanos`).request.headers.has('Authorization')).toBe(false);
    expect(http.expectOne(`${api}/auth/login`).request.headers.has('Authorization')).toBe(false);
  });

  it('no manda el token a otros sitios', () => {
    session.set('abc');
    const { client, http } = setup();
    client.get('https://otro-sitio.example.com/datos').subscribe();
    expect(http.expectOne('https://otro-sitio.example.com/datos').request.headers.has('Authorization')).toBe(false);
  });

  it('si la API responde 401 con una sesión, la cierra', () => {
    session.set('abc');
    const { client, http } = setup();
    const auth = TestBed.inject(AuthService);
    client.get(`${api}/bookings`).subscribe({ error: () => undefined });
    http.expectOne(`${api}/bookings`).flush({ message: 'Tu sesión ya no es válida' }, { status: 401, statusText: 'Unauthorized' });
    expect(session.get()).toBeNull();
    expect(auth.user()).toBeNull();
  });

  it('un 401 al ingresar (contraseña incorrecta) no cierra nada', () => {
    session.set('otra');
    const { client, http } = setup();
    client.post(`${api}/auth/login`, {}).subscribe({ error: () => undefined });
    http.expectOne(`${api}/auth/login`).flush({ message: 'Correo o contraseña incorrectos' }, { status: 401, statusText: 'Unauthorized' });
    expect(session.get()).toBe('otra');
  });

  it('un error distinto de 401 no cierra la sesión', () => {
    session.set('abc');
    const { client, http } = setup();
    client.get(`${api}/bookings`).subscribe({ error: () => undefined });
    http.expectOne(`${api}/bookings`).flush({ message: 'Error' }, { status: 500, statusText: 'Server Error' });
    expect(session.get()).toBe('abc');
  });
});
