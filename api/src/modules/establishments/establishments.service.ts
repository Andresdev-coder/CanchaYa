import { z } from "zod";
import { prisma } from "../../config/prisma";
import type { Establishment } from "../../generated/prisma/client";
import { updateEstablishmentSchema } from "./establishments.schemas";

export function publicEstablishment(e: Establishment) {
  return {
    id: e.id,
    slug: e.slug,
    name: e.name,
    city: e.city,
    phone: e.phone,
    timezone: e.timezone,
    paymentInstructions: e.paymentInstructions,
  };
}

export async function get(establishmentId: string) {
  return publicEstablishment(await prisma.establishment.findUniqueOrThrow({ where: { id: establishmentId } }));
}

export async function update(establishmentId: string, input: z.infer<typeof updateEstablishmentSchema>) {
  const updated = await prisma.establishment.update({ where: { id: establishmentId }, data: input });
  return publicEstablishment(updated);
}