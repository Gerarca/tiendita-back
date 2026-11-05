import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Recortar } from '../../common/transformaciones.js';

export class DetalleTraspasoDto {
  @IsInt()
  productoId!: number;

  @IsInt()
  @Min(1, { message: 'La cantidad debe ser al menos 1' })
  @Max(10_000)
  cantidad!: number;
}

export class RegistrarTraspasoDto {
  /** Departamento de venta que recibe la mercancía. */
  @Recortar()
  @IsString()
  @MinLength(2, { message: 'Indica el departamento de venta' })
  @MaxLength(150)
  departamento!: string;

  @Recortar()
  @IsString()
  @MinLength(2, { message: 'Indica la hermana encargada' })
  @MaxLength(150)
  hermanaEncargada!: string;

  @IsOptional()
  @Recortar()
  @IsString()
  @MaxLength(100)
  autorizadoPor?: string;

  /** Si un producto aparece dos veces, se suman las cantidades. */
  @IsArray()
  @ArrayMinSize(1, { message: 'El traspaso debe tener al menos un producto' })
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => DetalleTraspasoDto)
  detalles!: DetalleTraspasoDto[];
}
