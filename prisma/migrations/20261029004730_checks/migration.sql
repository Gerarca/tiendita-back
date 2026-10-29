-- This is an empty migration.-- =============================================================
-- Restricciones CHECK que Prisma no puede declarar.
--
-- Uso:
--   1) npx prisma migrate dev --name init
--   2) npx prisma migrate dev --create-only --name checks
--   3) Pegar este contenido en el migration.sql generado
--   4) npx prisma migrate dev
-- =============================================================

-- CATÁLOGO -----------------------------------------------------

ALTER TABLE categorias
  ADD CONSTRAINT chk_categorias_no_autopadre
    CHECK (padre_id IS NULL OR padre_id <> id);

ALTER TABLE productos
  ADD CONSTRAINT chk_productos_precio      CHECK (precio_usd >= 0),
  ADD CONSTRAINT chk_productos_stock_min   CHECK (stock_minimo IS NULL OR stock_minimo >= 0);

ALTER TABLE historial_precios
  ADD CONSTRAINT chk_historial_precios_pos CHECK (precio_anterior >= 0 AND precio_nuevo >= 0);

-- INVENTARIO ---------------------------------------------------

ALTER TABLE existencias
  ADD CONSTRAINT chk_existencias_no_negativa CHECK (cantidad >= 0);

ALTER TABLE movimientos_inventario
  ADD CONSTRAINT chk_mov_cantidad_no_cero CHECK (cantidad <> 0),
  ADD CONSTRAINT chk_mov_saldo_no_negativo CHECK (saldo_resultante >= 0),
  ADD CONSTRAINT chk_mov_un_origen
    CHECK (num_nonnulls(venta_id, ingreso_id, regalo_id) <= 1),
  ADD CONSTRAINT chk_mov_coherencia CHECK (
       (tipo = 'INGRESO'         AND ingreso_id IS NOT NULL AND cantidad > 0)
    OR (tipo = 'VENTA'           AND venta_id   IS NOT NULL AND cantidad < 0)
    OR (tipo = 'ANULACION_VENTA' AND venta_id   IS NOT NULL AND cantidad > 0)
    OR (tipo = 'REGALO'          AND regalo_id  IS NOT NULL AND cantidad < 0)
    OR (tipo = 'AJUSTE'          AND num_nonnulls(venta_id, ingreso_id, regalo_id) = 0
                                 AND nota IS NOT NULL AND length(trim(nota)) > 0)
  );

ALTER TABLE ingreso_detalle
  ADD CONSTRAINT chk_ingreso_det_cantidad CHECK (cantidad > 0),
  ADD CONSTRAINT chk_ingreso_det_costo    CHECK (costo_unit_usd IS NULL OR costo_unit_usd >= 0);

ALTER TABLE regalo_detalle
  ADD CONSTRAINT chk_regalo_det_cantidad CHECK (cantidad > 0),
  ADD CONSTRAINT chk_regalo_det_valor    CHECK (valor_ref_usd >= 0);

-- VENTAS -------------------------------------------------------

ALTER TABLE tasas_cambio
  ADD CONSTRAINT chk_tasa_positiva CHECK (bs_por_usd > 0);

ALTER TABLE clientes
  -- Ambos campos de documento van juntos (o ninguno: consumidor final)
  ADD CONSTRAINT chk_clientes_documento_completo
    CHECK ((tipo_documento IS NULL) = (numero_documento IS NULL)),
  ADD CONSTRAINT chk_clientes_documento_formato
    CHECK (numero_documento IS NULL OR numero_documento ~ '^\d{6,10}$');

ALTER TABLE ventas
  ADD CONSTRAINT chk_ventas_numero_control CHECK (numero_control ~ '^\d{8}$'),
  ADD CONSTRAINT chk_ventas_tasa           CHECK (tasa_aplicada > 0),
  ADD CONSTRAINT chk_ventas_montos
    CHECK (total_usd >= 0 AND total_bs >= 0 AND pagado_usd >= 0 AND pagado_bs >= 0),
  -- Si está anulada, debe tener quién, cuándo y por qué; si no, ninguno.
  ADD CONSTRAINT chk_ventas_anulacion CHECK (
       (estado = 'ACTIVA'  AND anulada_en IS NULL AND anulada_por_id IS NULL AND motivo_anulacion IS NULL)
    OR (estado = 'ANULADA' AND anulada_en IS NOT NULL AND anulada_por_id IS NOT NULL
                           AND motivo_anulacion IS NOT NULL)
  );

ALTER TABLE venta_detalle
  ADD CONSTRAINT chk_venta_det_cantidad CHECK (cantidad > 0),
  ADD CONSTRAINT chk_venta_det_precio   CHECK (precio_unit_usd >= 0),
  ADD CONSTRAINT chk_venta_det_subtotal CHECK (subtotal_usd = cantidad * precio_unit_usd);

ALTER TABLE pagos
  ADD CONSTRAINT chk_pagos_monto CHECK (monto > 0 AND monto_usd >= 0 AND monto_bs >= 0),
  -- Efectivo $ se cobra en USD; todo lo demás en Bs.
  ADD CONSTRAINT chk_pagos_moneda
    CHECK ((metodo = 'EFECTIVO_USD') = (moneda = 'USD')),
  -- Efectivo no lleva cuenta; tarjeta, pago móvil y transferencia sí.
  ADD CONSTRAINT chk_pagos_cuenta
    CHECK ((metodo IN ('EFECTIVO_BS', 'EFECTIVO_USD')) = (cuenta_id IS NULL));

-- CONTROL ------------------------------------------------------

ALTER TABLE correlativos
  ADD CONSTRAINT chk_correlativos_anio   CHECK (anio BETWEEN 2000 AND 2100),
  ADD CONSTRAINT chk_correlativos_numero CHECK (ultimo_numero BETWEEN 0 AND 9999);