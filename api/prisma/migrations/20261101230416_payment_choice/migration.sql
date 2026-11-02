-- CreateEnum
CREATE TYPE "PaymentChoice" AS ENUM ('AT_COURT', 'DEPOSIT', 'FULL');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "paymentChoice" "PaymentChoice" NOT NULL DEFAULT 'AT_COURT';
