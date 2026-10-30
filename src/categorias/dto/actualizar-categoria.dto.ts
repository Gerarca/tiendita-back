import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { Mayusculas, Recortar } from '../../common/transformaciones.js';

export class ActualizarCategoriaDto {
  @IsOptional()
  @Recortar()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  nombre?: string;

  /** null quita el prefijo */
  @IsOptional()
  @Mayusculas()
  @Matches(/^[A-Z0-9]{2,10}$/, { message: 'El prefijo debe tener 2 a 10 letras o números (ej. PST)' })
  prefijoCodigo?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  orden?: number;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
