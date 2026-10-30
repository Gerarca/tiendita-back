import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Mayusculas, Recortar } from '../../common/transformaciones.js';

/** El documento no se edita: identifica al cliente. */
export class ActualizarClienteDto {
  @IsOptional() @Mayusculas() @IsString() @IsNotEmpty() @MaxLength(150) nombre?: string;
  @IsOptional() @Recortar() @IsString() @MaxLength(20) telefono?: string | null;
  @IsOptional() @Mayusculas() @IsString() @MaxLength(200) direccion?: string | null;
  @IsOptional() @Mayusculas() @IsString() @MaxLength(80) ciudad?: string | null;
  @IsOptional() @Mayusculas() @IsString() @MaxLength(50) estado?: string | null;
}
