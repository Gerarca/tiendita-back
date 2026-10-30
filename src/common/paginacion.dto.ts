import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { FECHA_REGEX } from './fecha.util.js';

export class PaginacionDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  porPagina: number = 50;
}

/** Paginación + rango de días (AAAA-MM-DD, ambos inclusivos). */
export class RangoFechasDto extends PaginacionDto {
  @IsOptional()
  @Matches(FECHA_REGEX, { message: 'desde debe tener formato AAAA-MM-DD' })
  desde?: string;

  @IsOptional()
  @Matches(FECHA_REGEX, { message: 'hasta debe tener formato AAAA-MM-DD' })
  hasta?: string;
}
