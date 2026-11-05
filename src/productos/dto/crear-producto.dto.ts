import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Mayusculas, Recortar } from '../../common/transformaciones.js';

export const CODIGO_PRODUCTO_REGEX = /^[A-Z0-9]+(-[A-Z0-9]+)*$/;
export const MENSAJE_CODIGO = 'El código solo admite letras, números y guiones (ej. PST-HUE, CAF-01)';

/**
 * Crea el producto en el catálogo SIN existencias.
 * El stock entra siempre por un ingreso de material (siguiente módulo),
 * para que quede registrado en el kardex.
 */
export class CrearProductoDto {
  @Mayusculas()
  @Matches(CODIGO_PRODUCTO_REGEX, { message: MENSAJE_CODIGO })
  @MaxLength(20)
  codigo!: string;

  @Recortar()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre!: string;

  @IsOptional()
  @Recortar()
  @IsString()
  @MaxLength(1000)
  descripcion?: string | null;

  @IsInt()
  categoriaId!: number;

  /** Precio en dólares, máximo 2 decimales. */
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'precioUsd debe ser un número con máximo 2 decimales' })
  @IsPositive({ message: 'precioUsd debe ser mayor que cero' })
  @Max(1_000_000)
  precioUsd!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  stockMinimo?: number | null;

  /** Opcional: si no se indica, se usa la voz fiscal de la categoría. */
  @IsOptional()
  @IsInt()
  vozFiscalId?: number | null;
}
