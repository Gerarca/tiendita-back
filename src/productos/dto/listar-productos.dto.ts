import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ABooleano, Recortar } from '../../common/transformaciones.js';

export class ListarProductosDto {
  /** Busca en código y nombre (sin distinguir mayúsculas). */
  @IsOptional()
  @Recortar()
  @IsString()
  @MaxLength(100)
  buscar?: string;

  /** Una categoría principal incluye los productos de sus subcategorías. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoriaId?: number;

  @IsOptional()
  @ABooleano()
  @IsBoolean()
  incluirInactivos?: boolean;

  /** Solo productos con stock en o por debajo del mínimo. */
  @IsOptional()
  @ABooleano()
  @IsBoolean()
  soloStockBajo?: boolean;

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
