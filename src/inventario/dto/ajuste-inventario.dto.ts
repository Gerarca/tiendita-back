import { IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Recortar } from '../../common/transformaciones.js';

export class AjusteInventarioDto {
  @IsInt()
  productoId!: number;

  /** Cantidad que hay físicamente en la tienda. */
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  cantidadContada!: number;

  @Recortar()
  @IsString()
  @MinLength(5, { message: 'Explica el motivo del ajuste (mínimo 5 caracteres)' })
  @MaxLength(500)
  nota!: string;
}
