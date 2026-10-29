import { FuenteTasa } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsPositive, Matches, Max } from 'class-validator';
import { FECHA_REGEX } from '../../common/fecha.util.js';

export class RegistrarTasaDto {
  /** Opcional: si no se envía, se usa la fecha de hoy (zona del negocio). */
  @IsOptional()
  @Matches(FECHA_REGEX, { message: 'fecha debe tener formato AAAA-MM-DD' })
  fecha?: string;

  /** Bolívares por cada dólar. Ej.: 301.37 */
  @IsNumber({ maxDecimalPlaces: 4 }, { message: 'bsPorUsd debe ser un número con máximo 4 decimales' })
  @IsPositive({ message: 'bsPorUsd debe ser mayor que cero' })
  @Max(1_000_000_000)
  bsPorUsd!: number;

  @IsOptional()
  @IsEnum(FuenteTasa)
  fuente?: FuenteTasa;
}
