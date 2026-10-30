import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { UsuarioSesion } from '../auth/auth.types.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator.js';
import type { ArchivoSubido } from '../common/archivo-subido.js';
import { ActualizarProductoDto } from './dto/actualizar-producto.dto.js';
import { CrearProductoDto } from './dto/crear-producto.dto.js';
import { ListarProductosDto } from './dto/listar-productos.dto.js';
import { TAMANO_MAXIMO_IMAGEN } from './imagenes.util.js';
import { ProductosService } from './productos.service.js';

@Controller('productos')
export class ProductosController {
  constructor(private readonly productos: ProductosService) {}

  /** GET /api/productos?buscar=pasta&categoriaId=1&pagina=1&porPagina=50 */
  @Get()
  listar(@Query() query: ListarProductosDto) {
    return this.productos.listar(query);
  }

  /** GET /api/productos/codigo/PST-HUE — para la pantalla de ventas */
  @Get('codigo/:codigo')
  porCodigo(@Param('codigo') codigo: string) {
    return this.productos.porCodigo(codigo);
  }

  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.productos.obtener(id);
  }

  @Get(':id/historial-precios')
  historialPrecios(@Param('id', ParseIntPipe) id: number) {
    return this.productos.historialPrecios(id);
  }

  @Roles('ADMIN')
  @Post()
  crear(@Body() dto: CrearProductoDto) {
    return this.productos.crear(dto);
  }

  @Roles('ADMIN')
  @Patch(':id')
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarProductoDto,
    @UsuarioActual() usuario: UsuarioSesion,
  ) {
    return this.productos.actualizar(id, dto, usuario);
  }

  /** POST /api/productos/:id/imagen — multipart/form-data, campo "imagen" */
  @Roles('ADMIN')
  @Post(':id/imagen')
  @UseInterceptors(FileInterceptor('imagen', { limits: { fileSize: TAMANO_MAXIMO_IMAGEN, files: 1 } }))
  subirImagen(@Param('id', ParseIntPipe) id: number, @UploadedFile() archivo?: ArchivoSubido) {
    return this.productos.subirImagen(id, archivo);
  }

  @Roles('ADMIN')
  @Delete(':id/imagen')
  quitarImagen(@Param('id', ParseIntPipe) id: number) {
    return this.productos.quitarImagen(id);
  }
}
