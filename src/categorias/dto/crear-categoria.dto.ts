import { IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { Mayusculas, Recortar } from '../../common/transformaciones.js';

export class CrearCategoriaDto {
  @Recortar()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  nombre!: string;

  /** Si se envía, es una subcategoría de esa categoría principal. */
  @IsOptional()
  @IsInt()
  padreId?: number;

  @IsOptional()
  @Mayusculas()
  @Matches(/^[A-Z0-9]{2,10}$/, { message: 'El prefijo debe tener 2 a 10 letras o números (ej. PST)' })
  prefijoCodigo?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  orden?: number;

  /** Voz de la máquina fiscal (null la quita). */
  @IsOptional()
  @IsInt()
  vozFiscalId?: number | null;
}
