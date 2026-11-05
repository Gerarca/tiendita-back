/**
 * Formato neutro de un reporte. El servicio arma los datos una vez y los
 * generadores los convierten a PDF o Excel (o se devuelven como JSON).
 */
export type TipoColumna = 'texto' | 'entero' | 'usd' | 'bs' | 'tasa' | 'fecha' | 'fechaHora';

export interface Columna {
  clave: string;
  titulo: string;
  tipo: TipoColumna;
  /** Ancho en Excel (caracteres). */
  ancho?: number;
  /** En el PDF ocupa el espacio sobrante (columnas de nombres). */
  expandir?: boolean;
  /** false = solo aparece en Excel (el PDF no tiene espacio para todo). */
  pdf?: boolean;
  /** Valores en negrita (columnas de totales). */
  negrita?: boolean;
}

/** Encabezado que agrupa varias columnas: "TOTAL FACTURADO" sobre J y K. */
export interface GrupoColumnas {
  titulo: string;
  /** Clave de la primera y la última columna del grupo */
  desde: string;
  hasta: string;
}

export type Celda = string | number | Date | null;

export interface Fila {
  [clave: string]: Celda | boolean | undefined;
  /** Filas del mismo documento (venta, regalo) comparten número: se sombrean alternadas. */
  __grupo?: number;
  /** Se muestra tachada / en gris (ventas anuladas). */
  __anulada?: boolean;
  // Color de fondo de una celda: clave "__fondo_<columna>" con el color en hex sin "#"
  // (p. ej. __fondo_formaPago: 'D9C8EE' para pintar la forma de pago "MIXTA").
}

export const fondoDe = (columna: string) => `__fondo_${columna}`;

export interface Hoja {
  nombre: string;
  titulo: string;
  columnas: Columna[];
  filas: Fila[];
  totales?: Record<string, Celda>;
  grupos?: GrupoColumnas[];
  /** Nota al pie de la tabla. */
  nota?: string;
}

export interface Reporte {
  titulo: string;
  periodo: string;
  generadoPor: string;
  generadoEn: Date;
  resumen: { etiqueta: string; valor: string }[];
  hojas: Hoja[];
  /** Nombre del archivo sin extensión. */
  archivo: string;
  orientacion: 'portrait' | 'landscape';
  /** Hojas con muchas columnas usan tamaño oficio en el PDF. */
  tamanoPagina?: 'LETTER' | 'LEGAL';
  /** Tamaño de letra del PDF (por defecto 7). */
  fuentePdf?: number;
}
