import {
  IsBoolean,
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
import { CODIGO_PRODUCTO_REGEX, MENSAJE_CODIGO } from './crear-producto.dto.js';

/** Todos los campos opcionales. null en descripcion/stockMinimo los borra. */
export class ActualizarProductoDto {
  @IsOptional()
  @Mayusculas()
  @Matches(CODIGO_PRODUCTO_REGEX, { message: MENSAJE_CODIGO })
  @MaxLength(20)
  codigo?: string;

  @IsOptional()
  @Recortar()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre?: string;

  @IsOptional()
  @Recortar()
  @IsString()
  @MaxLength(1000)
  descripcion?: string | null;

  @IsOptional()
  @IsInt()
  categoriaId?: number;

  /** Si cambia, queda registrado en historial_precios. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'precioUsd debe ser un número con máximo 2 decimales' })
  @IsPositive({ message: 'precioUsd debe ser mayor que cero' })
  @Max(1_000_000)
  precioUsd?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  stockMinimo?: number | null;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  /** null = usar la voz fiscal de la categoría. */
  @IsOptional()
  @IsInt()
  vozFiscalId?: number | null;
}
