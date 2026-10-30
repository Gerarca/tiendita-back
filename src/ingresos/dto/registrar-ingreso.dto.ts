import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Recortar } from '../../common/transformaciones.js';

export class DetalleIngresoDto {
  @IsInt()
  productoId!: number;

  @IsInt()
  @Min(1, { message: 'La cantidad debe ser al menos 1' })
  @Max(100_000)
  cantidad!: number;

  /** Opcional: costo por unidad, si quieren calcular ganancia. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  costoUnitUsd?: number;

  /**
   * Opcional: nuevo precio de venta (boceto "Existente" → editar precio).
   * Solo ADMIN. Queda en el historial de precios.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(1_000_000)
  nuevoPrecioUsd?: number;
}

export class RegistrarIngresoDto {
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

  @IsArray()
  @ArrayMinSize(1, { message: 'El ingreso debe tener al menos un producto' })
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => DetalleIngresoDto)
  detalles!: DetalleIngresoDto[];
}
