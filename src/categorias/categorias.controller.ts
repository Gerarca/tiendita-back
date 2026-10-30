import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CategoriasService } from './categorias.service.js';
import { ActualizarCategoriaDto } from './dto/actualizar-categoria.dto.js';
import { CrearCategoriaDto } from './dto/crear-categoria.dto.js';
import { ListarCategoriasDto } from './dto/listar-categorias.dto.js';

@Controller('categorias')
export class CategoriasController {
  constructor(private readonly categorias: CategoriasService) {}

  /** GET /api/categorias — árbol para el menú lateral */
  @Get()
  arbol(@Query() query: ListarCategoriasDto) {
    return this.categorias.arbol(query.incluirInactivas);
  }

  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.categorias.obtener(id);
  }

  @Roles('ADMIN')
  @Post()
  crear(@Body() dto: CrearCategoriaDto) {
    return this.categorias.crear(dto);
  }

  @Roles('ADMIN')
  @Patch(':id')
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: ActualizarCategoriaDto) {
    return this.categorias.actualizar(id, dto);
  }
}
