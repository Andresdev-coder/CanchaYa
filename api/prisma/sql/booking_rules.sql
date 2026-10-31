-- Reglas que Prisma no puede expresar en el esquema.
-- Se agregan al final de la migración inicial (ver el README).

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Una cancha no puede tener dos reservas activas que se crucen en el tiempo.
-- Los rangos son [inicio, fin): una reserva de 7 a 8 y otra de 8 a 9 NO se cruzan.
ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_no_overlap"
  EXCLUDE USING gist ("courtId" WITH =, tstzrange("startsAt", "endsAt") WITH &&)
  WHERE ("status" IN ('PENDING', 'CONFIRMED'));

ALTER TABLE "Booking" ADD CONSTRAINT "Booking_ends_after_start" CHECK ("endsAt" > "startsAt");
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_price_not_negative" CHECK ("price" >= 0);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "Court" ADD CONSTRAINT "Court_slot_positive" CHECK ("slotMinutes" > 0);
ALTER TABLE "Court" ADD CONSTRAINT "Court_deposit_not_negative" CHECK ("depositAmount" IS NULL OR "depositAmount" >= 0);
ALTER TABLE "PriceRule" ADD CONSTRAINT "PriceRule_valid" CHECK ("startMin" >= 0 AND "endMin" <= 1440 AND "startMin" < "endMin" AND "pricePerHour" >= 0);
ALTER TABLE "OpeningHour" ADD CONSTRAINT "OpeningHour_valid" CHECK ("weekday" BETWEEN 0 AND 6 AND "opensMin" >= 0 AND "closesMin" <= 1440 AND "opensMin" < "closesMin");
