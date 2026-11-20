import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');

  // Imágenes de productos: /uploads/productos/xxx.jpg (fuera de /api y sin login,
  // porque una etiqueta <img> no puede enviar el token)
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/', index: false, maxAge: '7d' });

  // whitelist: descarta campos que no estén en el DTO
  // forbidNonWhitelisted: y además responde 400 si los envían
  // transform: convierte el body a la clase del DTO (necesario para @Transform)
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  // Producción: el frontend compilado (carpeta "out" de Next) se sirve desde aquí,
  // así la tienda funciona con UN solo proceso y un solo puerto.
  //   /api/...      → API de Nest
  //   /uploads/...  → imágenes de productos
  //   todo lo demás → pantallas del frontend (/inventario/, /ventas/...)
  const dirFrontend = config.get<string>('FRONTEND_DIR');
  if (dirFrontend) {
    const ruta = resolve(process.cwd(), dirFrontend);
    if (existsSync(join(ruta, 'index.html'))) {
      app.useStaticAssets(ruta, { index: 'index.html', extensions: ['html'] });
      console.log(`Frontend servido desde ${ruta}`);
    } else {
      console.warn(`FRONTEND_DIR no contiene un frontend compilado (falta index.html): ${ruta}`);
    }
  }

  // Solo para desarrollo con Next en otro puerto.
  // En producción Next se servirá desde Nest y CORS no hará falta.
  app.enableCors({
    origin: config.get<string>('CORS_ORIGIN', 'http://localhost:3000'),
    // Permite al frontend leer el nombre de los archivos descargados (reportes)
    exposedHeaders: ['Content-Disposition'],
  });

  const port = Number(config.get('PORT', 3001));
  await app.listen(port);
  console.log(`API escuchando en http://localhost:${port}/api`);
}
void bootstrap();
