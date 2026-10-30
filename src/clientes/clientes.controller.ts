import { Body, Controller, Get, Param, ParseIntPipe, Patch, Query } from '@nestjs/common';
import { ClientesService } from './clientes.service.js';
import { ActualizarClienteDto } from './dto/actualizar-cliente.dto.js';
import { ListarClientesDto } from './dto/listar-clientes.dto.js';

@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientes: ClientesService) {}

  @Get()
  listar(@Query() query: ListarClientesDto) {
    return this.clientes.listar(query);
  }

  /** GET /api/clientes/documento/V/17572853 */
  @Get('documento/:tipo/:numero')
  porDocumento(@Param('tipo') tipo: string, @Param('numero') numero: string) {
    return this.clientes.porDocumento(tipo, numero);
  }

  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.clientes.obtener(id);
  }

  @Patch(':id')
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: ActualizarClienteDto) {
    return this.clientes.actualizar(id, dto);
  }
}
