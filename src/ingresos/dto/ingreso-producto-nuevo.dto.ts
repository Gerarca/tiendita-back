import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Recortar } from '../../common/transformaciones.js';
import { CrearProductoDto } from '../../productos/dto/crear-producto.dto.js';

/** Boceto "Nuevo": crea el producto y registra su primera entrada en una sola operación. */
export class IngresoProductoNuevoDto {
  @ValidateNested()
  @Type(() => CrearProductoDto)
  producto!: CrearProductoDto;

  @IsInt()
  @Min(1, { message: 'La cantidad debe ser al menos 1' })
  @Max(100_000)
  cantidad!: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  costoUnitUsd?: number;

  @IsOptional()
  @Recortar()
  @IsString()
  @MaxLength(150)
  proveedor?: string;

  @IsOptional()
  @Recortar()
  @IsString()
  @MaxLength(500)
  nota?: string;
}
