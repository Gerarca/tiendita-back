import { Transform } from 'class-transformer';

/** Quita espacios al inicio y al final. */
export const Recortar = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/** Quita espacios y pasa a mayúsculas (códigos y prefijos). */
export const Mayusculas = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value));

/** Convierte "true"/"false" de la query string a booleano. */
export const ABooleano = () =>
  Transform(({ value }) => (value === 'true' || value === true ? true : value === 'false' || value === false ? false : value));
