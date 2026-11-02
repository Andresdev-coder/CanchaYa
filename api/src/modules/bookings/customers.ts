import { prisma } from "../../config/prisma";

const isUnique = (err: unknown) =>
  typeof err === "object" && err !== null && "code" in err && err.code === "P2002";

/** El cliente se identifica por su teléfono dentro de cada establecimiento. Si ya existe, se respeta su nombre. */
export async function findOrCreateCustomer(establishmentId: string, name: string, phone: string) {
  const where = { establishmentId_phone: { establishmentId, phone } };
  const existing = await prisma.customer.findUnique({ where });
  if (existing) return existing;
  try {
    return await prisma.customer.create({ data: { establishmentId, name, phone } });
  } catch (err) {
    if (isUnique(err)) return prisma.customer.findUniqueOrThrow({ where }); // otra petición lo creó a la vez
    throw err;
  }
}