import { z } from "zod";
import { prisma } from "../../config/prisma";
import type { Court } from "../../generated/prisma/client";
import { AppError } from "../../middlewares/errorHandler";
import { formatTime, parseTime } from "../../utils/time";
import { createCourtSchema, setPricesSchema, updateCourtSchema } from "./courts.schemas";

const isUnique = (err: unknown) =>
  typeof err === "object" && err !== null && "code" in err && err.code === "P2002";

function toDto(c: Court) {
  return {
    id: c.id,
    name: c.name,
    sport: c.sport,
    surface: c.surface,
    slotMinutes: c.slotMinutes,
    active: c.active,
    allowDeposit: c.allowDeposit,
    depositAmount: c.depositAmount,
    allowFullPayment: c.allowFullPayment,
    sortOrder: c.sortOrder,
  };
}

/** Busca la cancha solo dentro del establecimiento del usuario: la de otro da 404. */
async function getOwned(establishmentId: string, id: string) {
  const court = await prisma.court.findFirst({ where: { id, establishmentId } });
  if (!court) throw new AppError(404, "Cancha no encontrada");
  return court;
}

export async function list(establishmentId: string, includeInactive: boolean) {
  const courts = await prisma.court.findMany({
    where: { establishmentId, ...(includeInactive ? {} : { active: true }) },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return courts.map(toDto);
}

export async function get(establishmentId: string, id: string) {
  return toDto(await getOwned(establishmentId, id));
}

export async function create(establishmentId: string, input: z.infer<typeof createCourtSchema>) {
  try {
    const court = await prisma.court.create({
      data: {
        ...input,
        establishmentId,
        depositAmount: input.allowDeposit ? (input.depositAmount ?? null) : null,
      },
    });
    return toDto(court);
  } catch (err) {
    if (isUnique(err)) throw new AppError(409, "Ya tienes una cancha con ese nombre");
    throw err;
  }
}

export async function update(establishmentId: string, id: string, input: z.infer<typeof updateCourtSchema>) {
  const current = await getOwned(establishmentId, id);

  // Se valida el resultado final, no solo lo que llegó en esta petición.
  const allowDeposit = input.allowDeposit ?? current.allowDeposit;
  let depositAmount = input.depositAmount !== undefined ? input.depositAmount : current.depositAmount;
  if (!allowDeposit) depositAmount = null;
  else if (depositAmount == null) throw new AppError(400, "Indica el valor del abono");

  if (input.active === false && current.active) {
    const pending = await prisma.booking.count({
      where: { courtId: id, status: { in: ["PENDING", "CONFIRMED"] }, endsAt: { gt: new Date() } },
    });
    if (pending > 0) {
      throw new AppError(
        409,
        `No se puede desactivar: tiene ${pending} reserva(s) pendiente(s) o confirmada(s). Cancélalas primero.`,
      );
    }
  }

  try {
    const court = await prisma.court.update({ where: { id }, data: { ...input, depositAmount } });
    return toDto(court);
  } catch (err) {
    if (isUnique(err)) throw new AppError(409, "Ya tienes una cancha con ese nombre");
    throw err;
  }
}

export async function listPrices(establishmentId: string, courtId: string) {
  await getOwned(establishmentId, courtId);
  const rules = await prisma.priceRule.findMany({ where: { courtId }, orderBy: [{ startMin: "asc" }, { endMin: "asc" }] });
  return rules.map((r) => ({
    id: r.id,
    weekdays: r.weekdays,
    start: formatTime(r.startMin),
    end: formatTime(r.endMin),
    pricePerHour: r.pricePerHour,
  }));
}

/** Reemplaza todas las franjas de la cancha. */
export async function setPrices(establishmentId: string, courtId: string, input: z.infer<typeof setPricesSchema>) {
  await getOwned(establishmentId, courtId);
  await prisma.$transaction([
    prisma.priceRule.deleteMany({ where: { courtId } }),
    prisma.priceRule.createMany({
      data: input.rules.map((r) => ({
        courtId,
        weekdays: [...new Set(r.weekdays)].sort((a, b) => a - b),
        startMin: parseTime(r.start),
        endMin: parseTime(r.end),
        pricePerHour: r.pricePerHour,
      })),
    }),
  ]);
  return listPrices(establishmentId, courtId);
}