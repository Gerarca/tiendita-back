import { IsBoolean, IsOptional } from 'class-validator';
import { ABooleano } from '../../common/transformaciones.js';

export class ListarCategoriasDto {
  @IsOptional()
  @ABooleano()
  @IsBoolean()
  incluirInactivas?: boolean;
}
