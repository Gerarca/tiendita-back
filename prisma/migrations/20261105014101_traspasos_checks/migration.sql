-- =============================================================
-- Restricciones para los traspasos. Va en una SEGUNDA migración porque
-- PostgreSQL no permite usar el valor nuevo del enum (TRASPASO_SALIDA)
-- en la misma transacción en que se agrega.
--
--   1) npx prisma migrate dev --name traspasos
--   2) npx prisma migrate dev --create-only --name traspasos_checks
--   3) Pegar este contenido en el migration.sql generado en el paso 2
--   4) npx prisma migrate dev
-- =============================================================

ALTER TABLE movimientos_inventario
  DROP CONSTRAINT chk_mov_un_origen,
  DROP CONSTRAINT chk_mov_coherencia;

ALTER TABLE movimientos_inventario
  ADD CONSTRAINT chk_mov_un_origen
    CHECK (num_nonnulls(venta_id, ingreso_id, regalo_id, traspaso_id) <= 1),
  ADD CONSTRAINT chk_mov_coherencia CHECK (
       (tipo = 'INGRESO'         AND ingreso_id  IS NOT NULL AND cantidad > 0)
    OR (tipo = 'VENTA'           AND venta_id    IS NOT NULL AND cantidad < 0)
    OR (tipo = 'ANULACION_VENTA' AND venta_id    IS NOT NULL AND cantidad > 0)
    OR (tipo = 'REGALO'          AND regalo_id   IS NOT NULL AND cantidad < 0)
    OR (tipo = 'TRASPASO_SALIDA' AND traspaso_id IS NOT NULL AND cantidad < 0)
    OR (tipo = 'AJUSTE'          AND num_nonnulls(venta_id, ingreso_id, regalo_id, traspaso_id) = 0
                                 AND nota IS NOT NULL AND length(trim(nota)) > 0)
  );

ALTER TABLE traspaso_detalle
  ADD CONSTRAINT chk_traspaso_det_cantidad CHECK (cantidad > 0),
  ADD CONSTRAINT chk_traspaso_det_valor    CHECK (valor_ref_usd >= 0);
