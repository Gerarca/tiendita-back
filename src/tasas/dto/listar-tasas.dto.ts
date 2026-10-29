import { IsOptional, Matches } from 'class-validator';
import { FECHA_REGEX } from '../../common/fecha.util.js';

export class ListarTasasDto {
  @IsOptional()
  @Matches(FECHA_REGEX, { message: 'desde debe tener formato AAAA-MM-DD' })
  desde?: string;

  @IsOptional()
  @Matches(FECHA_REGEX, { message: 'hasta debe tener formato AAAA-MM-DD' })
  hasta?: string;
}
