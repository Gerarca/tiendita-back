import { Prisma } from '@prisma/client';

export type Decimal = Prisma.Decimal;

/** Crea un Decimal. Para números que vienen del cliente usar desdeNumero(). */
export const D = (valor: Prisma.Decimal.Value): Prisma.Decimal => new Prisma.Decimal(valor);

/** number con máx. 2 decimales (ya validado por el DTO) → Decimal exacto. */
export const desdeNumero = (n: number): Prisma.Decimal => new Prisma.Decimal(n.toFixed(2));

/** Redondeo comercial a 2 decimales (0,005 → 0,01). */
export const redondear2 = (d: Prisma.Decimal): Prisma.Decimal =>
  d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

export const sumar = (valores: Prisma.Decimal[]): Prisma.Decimal =>
  valores.reduce((s, v) => s.plus(v), new Prisma.Decimal(0));
