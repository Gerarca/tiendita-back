/** Archivo recibido por FileInterceptor (almacenamiento en memoria). */
export interface ArchivoSubido {
  buffer: Buffer;
  size: number;
  originalname: string;
  mimetype: string;
}
