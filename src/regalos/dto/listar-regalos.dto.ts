import { IsOptional, IsString, MaxLength } from 'class-validator';
import { RangoFechasDto } from '../../common/paginacion.dto.js';
import { Recortar } from '../../common/transformaciones.js';

export class ListarRegalosDto extends RangoFechasDto {
  /** Busca por beneficiario o motivo. */
  @IsOptional()
  @Recortar()
  @IsString()
  @MaxLength(100)
  buscar?: string;
}
