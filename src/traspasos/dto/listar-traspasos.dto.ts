import { IsOptional, IsString, MaxLength } from 'class-validator';
import { RangoFechasDto } from '../../common/paginacion.dto.js';
import { Recortar } from '../../common/transformaciones.js';

export class ListarTraspasosDto extends RangoFechasDto {
  /** Busca por departamento o hermana encargada. */
  @IsOptional()
  @Recortar()
  @IsString()
  @MaxLength(100)
  buscar?: string;
}
