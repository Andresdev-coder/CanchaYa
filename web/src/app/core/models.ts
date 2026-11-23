export type Sport = 'FOOTBALL' | 'VOLLEYBALL' | 'TENNIS' | 'OTHER';
export type PaymentChoice = 'AT_COURT' | 'DEPOSIT' | 'FULL';
export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'NO_SHOW' | 'COMPLETED';
export type PaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID';

export interface Court {
  id: string;
  name: string;
  sport: Sport;
  surface: string | null;
  slotMinutes: number;
  allowDeposit: boolean;
  depositAmount: number | null;
  allowFullPayment: boolean;
}

export interface EstablishmentInfo {
  slug: string;
  name: string;
  city: string;
  phone: string | null;
}

export interface PublicPage {
  establishment: EstablishmentInfo;
  courts: Court[];
}

export interface Slot {
  start: string;
  end: string;
  startTime: string;
  endTime: string;
  price: number;
  available: boolean;
}

export interface Availability {
  date: string;
  court: { id: string; name: string; sport: Sport; slotMinutes: number };
  slots: Slot[];
}

export interface CreateBooking {
  courtId: string;
  start: string;
  name: string;
  phone: string;
  paymentChoice: PaymentChoice;
  note?: string;
}

export interface CreatedBooking {
  id: string;
  publicToken: string;
  status: BookingStatus;
  paymentChoice: PaymentChoice;
  price: number;
  amountDue: number;
  start: string;
  end: string;
}

export interface PlayerBooking {
  status: BookingStatus;
  paymentChoice: PaymentChoice;
  price: number;
  paid: number;
  balance: number;
  paymentStatus: PaymentStatus;
  amountDue: number;
  start: string;
  end: string;
  expiresAt: string | null;
  cancelReason: string | null;
  court: { name: string; sport: Sport };
  establishment: EstablishmentInfo;
  paymentInstructions: string | null;
  canCancel: boolean;
}

export interface ApiErrorBody {
  message: string;
  errors?: { field: string; message: string }[];
}

/** Resultado de cargar la página de un establecimiento: los datos, o la razón por la que no se pudo. */
export type PageResult = { page: PublicPage } | { error: 'not-found' | 'unavailable' };

// ---- Zona privada: dueño y empleados ----

export type Role = 'OWNER' | 'STAFF';
export type PaymentMethod = 'CASH' | 'TRANSFER';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  establishmentId: string;
}

export interface Establishment {
  id: string;
  slug: string;
  name: string;
  city: string;
  phone: string | null;
  timezone: string;
  paymentInstructions: string | null;
}

export interface Me {
  user: SessionUser;
  establishment: Establishment;
}

export interface LoginResponse {
  token: string;
  user: SessionUser;
}

export interface RegisterBody {
  establishmentName: string;
  name: string;
  email: string;
  password: string;
  phone?: string;
}

export interface RegisterResponse {
  token: string;
  user: SessionUser;
  establishment: Establishment;
}

export interface BookingPayment {
  id: string;
  amount: number;
  method: PaymentMethod;
  note: string | null;
  createdAt: string;
  voided: boolean;
  voidReason: string | null;
}

export interface OwnerBooking {
  id: string;
  status: BookingStatus;
  source: 'ONLINE' | 'MANUAL';
  paymentChoice: PaymentChoice;
  price: number;
  paid: number;
  balance: number;
  paymentStatus: PaymentStatus;
  payments: BookingPayment[];
  start: string;
  end: string;
  note: string | null;
  expiresAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  court: { id: string; name: string; sport: Sport };
  customer: { id: string; name: string; phone: string };
}

export interface OwnerCourt extends Court {
  active: boolean;
  sortOrder: number;
}

export interface OpeningHour {
  weekday: number;
  opens: string;
  closes: string;
}

export interface ManualBookingBody {
  courtId: string;
  start: string;
  name: string;
  phone: string;
  note?: string;
}

export interface PaymentBody {
  amount: number;
  method: PaymentMethod;
  note?: string;
}

// ---- Configuración del establecimiento ----

export interface PriceRule {
  id?: string;
  weekdays: number[];
  start: string;
  end: string;
  pricePerHour: number;
}

export interface CourtBody {
  name: string;
  sport: Sport;
  surface: string | null;
  slotMinutes: number;
  allowDeposit: boolean;
  depositAmount: number | null;
  allowFullPayment: boolean;
  active?: boolean;
}

export interface EstablishmentPatch {
  name?: string;
  phone?: string | null;
  paymentInstructions?: string | null;
}
