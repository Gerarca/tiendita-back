import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CuentasService } from './cuentas.service.js';
import { ActualizarCuentaDto, CrearCuentaDto } from './dto/cuenta.dto.js';

@Controller('cuentas-bancarias')
export class CuentasController {
  constructor(private readonly cuentas: CuentasService) {}

  /** GET /api/cuentas-bancarias (?incluirInactivas=true) */
  @Get()
  listar(@Query('incluirInactivas') incluirInactivas?: string) {
    return this.cuentas.listar(incluirInactivas === 'true');
  }

  @Roles('ADMIN')
  @Post()
  crear(@Body() dto: CrearCuentaDto) {
    return this.cuentas.crear(dto);
  }

  @Roles('ADMIN')
  @Patch(':id')
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: ActualizarCuentaDto) {
    return this.cuentas.actualizar(id, dto);
  }
}
