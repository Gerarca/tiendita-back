import { MetodoPago } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { FECHA_REGEX } from '../../common/fecha.util.js';

export const FORMATOS = ['json', 'pdf', 'xlsx'] as const;
export type FormatoReporte = (typeof FORMATOS)[number];

/**
 * Período: año, mes o trimestre (como en el boceto) o un rango libre.
 *   ?anio=2026&mes=1          → enero 2026
 *   ?anio=2026&trimestre=1    → enero a marzo 2026
 *   ?anio=2026                → todo 2026
 *   ?desde=2026-01-01&hasta=2026-01-15
 *   (nada)                    → mes en curso
 */
export class PeriodoReporteDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(2000) @Max(2100)
  anio?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(12)
  mes?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(4)
  trimestre?: number;

  @IsOptional() @Matches(FECHA_REGEX, { message: 'desde debe tener formato AAAA-MM-DD' })
  desde?: string;

  @IsOptional() @Matches(FECHA_REGEX, { message: 'hasta debe tener formato AAAA-MM-DD' })
  hasta?: string;

  @IsOptional() @IsIn(FORMATOS, { message: 'formato debe ser json, pdf o xlsx' })
  formato: FormatoReporte = 'json';
}

export class ReportePagosDto extends PeriodoReporteDto {
  /** Ej.: la cuenta "Provincial Jurídico" */
  @IsOptional() @Type(() => Number) @IsInt()
  cuentaId?: number;

  @IsOptional() @IsEnum(MetodoPago)
  metodo?: MetodoPago;
}
