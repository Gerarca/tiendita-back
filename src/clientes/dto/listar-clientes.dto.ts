import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginacionDto } from '../../common/paginacion.dto.js';
import { Recortar } from '../../common/transformaciones.js';

export class ListarClientesDto extends PaginacionDto {
  /** Busca en nombre y número de documento. */
  @IsOptional()
  @Recortar()
  @IsString()
  @MaxLength(100)
  buscar?: string;
}
