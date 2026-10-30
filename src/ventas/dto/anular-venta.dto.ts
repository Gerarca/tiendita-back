import { IsString, MaxLength, MinLength } from 'class-validator';
import { Recortar } from '../../common/transformaciones.js';

export class AnularVentaDto {
  @Recortar()
  @IsString()
  @MinLength(5, { message: 'Explica el motivo de la anulación (mínimo 5 caracteres)' })
  @MaxLength(500)
  motivo!: string;
}
