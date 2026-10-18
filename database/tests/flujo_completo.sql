-- =====================================================================
-- Prueba de integración del esquema: flujo completo + reglas de integridad
-- + aislamiento entre agencias
--
-- * Todo corre dentro de una transacción que se revierte al final: no deja
--   datos. Funciona en psql y en el SQL Editor de Supabase.
-- * El flujo corre como paqueteria_api, el rol que usará la API, dentro de la
--   agencia de seed.sql (variable de sesión paqueteria.agencia_id), para
--   comprobar que tiene los permisos justos y que RLS aísla a las agencias.
-- * Cada operación inválida debe fallar con el SQLSTATE esperado y por la
--   razón esperada (nombre de restricción o texto del mensaje). Si falla por
--   otra razón, la prueba se detiene.
--
-- Requiere schema.sql y seed.sql cargados. Ejecutar como dueño del esquema.
-- =====================================================================

begin;
set local search_path = paqueteria, public;
select set_config('paqueteria.agencia_id', (select id::text from agencias where nombre = 'Agencia de ejemplo'), true);
set local role paqueteria_api;

-- Ejecuta p_sql, que DEBE fallar con SQLSTATE p_sqlstate. Si se indica
-- p_contiene, el nombre de la restricción o el mensaje deben contenerlo.
create function pg_temp.esperar_error(
  p_sql         text,
  p_sqlstate    text,
  p_descripcion text,
  p_contiene    text default null
) returns void
language plpgsql as $$
declare
  v_estado      text;
  v_mensaje     text;
  v_restriccion text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics
      v_estado      = returned_sqlstate,
      v_mensaje     = message_text,
      v_restriccion = constraint_name;

    if v_estado <> p_sqlstate then
      raise exception 'FALLO: % -> se esperaba SQLSTATE %, se obtuvo %: %',
        p_descripcion, p_sqlstate, v_estado, v_mensaje;
    end if;

    if p_contiene is not null
       and position(lower(p_contiene) in lower(coalesce(v_restriccion, '') || ' ' || v_mensaje)) = 0 then
      raise exception 'FALLO: % -> SQLSTATE correcto (%) pero razón inesperada: % [%]',
        p_descripcion, v_estado, v_mensaje, v_restriccion;
    end if;

    raise notice 'OK  rechazado [%] %', v_estado, p_descripcion;
    return;
  end;
  raise exception 'FALLO: se permitió -> %', p_descripcion;
end $$;

do $$
declare
  v_agencia_a  bigint;
  v_agencia_b  bigint;
  v_usuario_b  bigint;
  v_admin      bigint;
  v_bodega     bigint;
  v_repartidor bigint;
  v_cli1       bigint;
  v_cli2       bigint;
  v_cli3       bigint;
  v_aereo      smallint;
  v_maritimo   smallint;
  v_ruta       integer;
  v_tarifa     tarifas_envio;
  v_emb_air    bigint;
  v_emb_sea    bigint;
  v_pkg1       bigint;
  v_pkg2       bigint;
  v_pkg3       bigint;
  v_factura    bigint;
  v_factura2   bigint;
  v_pago       bigint;
  v_monto1     numeric(18,2);
  v_monto2     numeric(18,2);
  v_total      numeric(18,2);
  v_texto      text;
  v_num        numeric;
  v_saldo      record;
  v_tabla      text;
  v_tablas     text[] := array[
    'agencias', 'usuarios_plataforma', 'correlativos', 'usuarios', 'roles', 'metodos_envio', 'estados_paquete',
    'ubicaciones', 'rutas', 'tarifas_envio', 'tipos_cambio', 'clientes', 'embarques', 'paquetes',
    'historial_estados_paquete', 'facturas', 'detalles_factura', 'pagos', 'entregas', 'audit_logs'];
  v_tablas_agencia text[] := array[
    'correlativos', 'usuarios', 'usuario_roles', 'ubicaciones', 'rutas', 'tarifas_envio', 'tipos_cambio',
    'clientes', 'embarques', 'paquetes', 'historial_estados_paquete', 'facturas', 'detalles_factura',
    'pagos', 'entregas', 'v_facturas_saldo'];
begin
  if current_user <> 'paqueteria_api' then
    raise exception 'FALLO: la prueba debe correr como paqueteria_api, corre como %', current_user;
  end if;
  v_agencia_a := fn_agencia_actual();
  raise notice 'OK  el flujo corre como % en la agencia %', current_user, v_agencia_a;

  ------------------------------------------------------------------
  -- Preparación
  ------------------------------------------------------------------
  insert into usuarios (nombres, apellidos, correo) values ('Ana', 'Admin', 'ana@test.local') returning id into v_admin;
  insert into usuarios (nombres, apellidos, correo) values ('Bruno', 'Bodega', 'bruno@test.local') returning id into v_bodega;
  insert into usuarios (nombres, apellidos, correo) values ('Raúl', 'Reparto', 'raul@test.local') returning id into v_repartidor;
  insert into usuario_roles (usuario_id, rol_id) select v_admin, id from roles where codigo = 'ADMIN';
  insert into usuario_roles (usuario_id, rol_id) select v_bodega, id from roles where codigo = 'BODEGA';
  insert into usuario_roles (usuario_id, rol_id) select v_repartidor, id from roles where codigo = 'REPARTIDOR';

  -- Quitar un rol es la única eliminación permitida
  delete from usuario_roles where usuario_id = v_bodega;
  insert into usuario_roles (usuario_id, rol_id) select v_bodega, id from roles where codigo = 'BODEGA';
  raise notice 'OK  la API puede quitar y asignar roles';

  select id into v_aereo    from metodos_envio where codigo = 'AEREO';
  select id into v_maritimo from metodos_envio where codigo = 'MARITIMO';
  select id into v_ruta     from rutas limit 1;
  insert into tarifas_envio (metodo_envio_id, precio_por_unidad, fecha_inicio) values (v_maritimo, 1.75, date '2026-01-01');
  insert into tipos_cambio (fecha, nio_por_usd, creado_por_usuario_id) values (current_date, 36.6243, v_admin);
  -- Un dueño de la plataforma (así las pruebas de no borrado tienen filas en todas las tablas)
  insert into usuarios_plataforma (nombres, apellidos, correo) values ('Pía', 'Plataforma', 'pia@plataforma.test');

  ------------------------------------------------------------------
  -- 1. Cliente
  ------------------------------------------------------------------
  insert into clientes (nombres, apellidos, telefono) values ('María', 'López', '+505 8888 0001') returning id into v_cli1;
  insert into clientes (nombres, apellidos, telefono) values ('José',  'Pérez', '+505 8888 0002') returning id into v_cli2;
  insert into clientes (nombres, apellidos, telefono) values ('Luis',  'Ruiz',  '+505 8888 0003') returning id into v_cli3;
  select codigo_cliente into v_texto from clientes where id = v_cli1;
  if v_texto <> 'CLI-000001' then raise exception 'FALLO: código de cliente %', v_texto; end if;
  raise notice 'OK  cliente creado: %', v_texto;

  select count(*) into v_num from clientes where (nombres || ' ' || apellidos) ilike '%lópez%';
  if v_num <> 1 then raise exception 'FALLO: búsqueda por nombre'; end if;
  raise notice 'OK  búsqueda de cliente por nombre';

  ------------------------------------------------------------------
  -- 2. Paquete: nace en REGISTRADO con historial inicial automático
  ------------------------------------------------------------------
  perform pg_temp.esperar_error(
    format($q$insert into paquetes (cliente_id, descripcion, metodo_envio_id, estado_actual_id, registrado_por_usuario_id)
              values (%s, 'Salta estados', %s, 5, %s)$q$, v_cli1, v_aereo, v_admin),
    '23514', 'crear un paquete directamente en RECIBIDO_EN_NICARAGUA', 'REGISTRADO');

  perform pg_temp.esperar_error(
    format($q$insert into paquetes (cliente_id, descripcion, metodo_envio_id, fecha_recepcion_miami, registrado_por_usuario_id)
              values (%s, 'Con fecha', %s, now(), %s)$q$, v_cli1, v_aereo, v_admin),
    '23514', 'crear un paquete con fecha de recepción ya puesta', 'REGISTRADO');

  insert into paquetes (cliente_id, tracking_externo, tienda, descripcion, metodo_envio_id, registrado_por_usuario_id)
  values (v_cli1, 'TBA123456789', 'Amazon', 'Audífonos', v_aereo, v_admin) returning id into v_pkg1;
  insert into paquetes (cliente_id, tracking_externo, tienda, descripcion, metodo_envio_id, registrado_por_usuario_id)
  values (v_cli1, '1Z999AA10123456784', 'Amazon', 'Zapatos', v_aereo, v_admin) returning id into v_pkg2;
  insert into paquetes (cliente_id, tracking_externo, tienda, descripcion, metodo_envio_id, registrado_por_usuario_id)
  values (v_cli2, 'TBA000000001', 'Walmart', 'Licuadora', v_maritimo, v_admin) returning id into v_pkg3;

  select count(*) into v_num from historial_estados_paquete where paquete_id = v_pkg1 and estado_id = 1;
  if v_num <> 1 then raise exception 'FALLO: no se creó el historial inicial'; end if;
  select codigo_paquete into v_texto from paquetes where id = v_pkg1;
  raise notice 'OK  paquete % registrado en REGISTRADO con historial inicial', v_texto;

  perform pg_temp.esperar_error(
    format($q$insert into paquetes (cliente_id, tracking_externo, descripcion, metodo_envio_id, registrado_por_usuario_id)
              values (%s, 'tba123456789', 'Duplicado', %s, %s)$q$, v_cli2, v_aereo, v_admin),
    '23505', 'tracking externo duplicado (sin distinguir mayúsculas)', 'uq_paquetes_tracking_vigente');

  perform pg_temp.esperar_error(
    format('update paquetes set estado_actual_id = 5 where id = %s', v_pkg1),
    '23001', 'cambiar el estado con UPDATE directo, sin historial', 'historial_estados_paquete');

  perform pg_temp.esperar_error(
    format('update paquetes set fecha_recepcion_nicaragua = now() where id = %s', v_pkg1),
    '23001', 'poner la fecha de recepción con UPDATE directo', 'historial_estados_paquete');

  -- Antes de facturar, el cliente de un paquete sí puede corregirse
  update paquetes set cliente_id = v_cli2 where id = v_pkg2;
  update paquetes set cliente_id = v_cli1 where id = v_pkg2;
  raise notice 'OK  antes de facturar se puede corregir el cliente de un paquete';

  ------------------------------------------------------------------
  -- 3. Recepción en Miami (vía historial)
  ------------------------------------------------------------------
  insert into historial_estados_paquete (paquete_id, estado_id, usuario_id, observacion)
  select p, 2, v_bodega, 'Recibido en bodega' from unnest(array[v_pkg1, v_pkg2, v_pkg3]) p;

  select count(*) into v_num from paquetes
  where id in (v_pkg1, v_pkg2, v_pkg3) and estado_actual_id = 2 and fecha_recepcion_miami is not null;
  if v_num <> 3 then raise exception 'FALLO: el historial no actualizó estado/fecha de Miami'; end if;
  raise notice 'OK  recepción en Miami: estado y fecha actualizados por el historial';

  ------------------------------------------------------------------
  -- 4. Embarques
  ------------------------------------------------------------------
  insert into embarques (ruta_id, metodo_envio_id, fecha_llegada_estimada, creado_por_usuario_id)
  values (v_ruta, v_aereo, current_date + 3, v_bodega) returning id into v_emb_air;
  insert into embarques (ruta_id, metodo_envio_id, creado_por_usuario_id)
  values (v_ruta, v_maritimo, v_bodega) returning id into v_emb_sea;
  select codigo_embarque into v_texto from embarques where id = v_emb_air;
  if v_texto !~ '^AIR-\d{4}-0001$' then raise exception 'FALLO: código de embarque %', v_texto; end if;
  raise notice 'OK  embarques creados: % y %', v_texto, (select codigo_embarque from embarques where id = v_emb_sea);

  perform pg_temp.esperar_error(
    format('update paquetes set embarque_id = %s where id = %s', v_emb_sea, v_pkg1),
    '23503', 'paquete aéreo asignado a embarque marítimo', 'fk_paquetes_embarque_mismo_metodo');

  update paquetes set embarque_id = v_emb_air where id in (v_pkg1, v_pkg2);
  update paquetes set embarque_id = v_emb_sea where id = v_pkg3;
  insert into historial_estados_paquete (paquete_id, estado_id, usuario_id)
  select p, 3, v_bodega from unnest(array[v_pkg1, v_pkg2, v_pkg3]) p;

  perform pg_temp.esperar_error(
    format($q$update embarques set estado = 'EN_TRANSITO' where id = %s$q$, v_emb_air),
    '23514', 'embarque en tránsito sin fecha de salida', 'ck_embarques_estado_fechas');

  perform pg_temp.esperar_error(
    format($q$update embarques set fecha_salida = now(), fecha_llegada_real = now() - interval '1 day' where id = %s$q$, v_emb_sea),
    '23514', 'embarque con llegada anterior a la salida', 'ck_embarques_llegada');

  update embarques set estado = 'EN_TRANSITO', fecha_salida = now() - interval '2 days' where id = v_emb_air;
  insert into historial_estados_paquete (paquete_id, estado_id, usuario_id)
  select id, 4, v_bodega from paquetes where embarque_id = v_emb_air;

  update embarques set estado = 'RECIBIDO', fecha_llegada_real = now() where id = v_emb_air;
  insert into historial_estados_paquete (paquete_id, estado_id, usuario_id)
  select id, 5, v_bodega from paquetes where embarque_id = v_emb_air;
  select count(*) into v_num from paquetes where embarque_id = v_emb_air and fecha_recepcion_nicaragua is not null;
  if v_num <> 2 then raise exception 'FALLO: fecha_recepcion_nicaragua'; end if;
  raise notice 'OK  embarque aéreo salió y llegó; paquetes recibidos en Nicaragua';

  ------------------------------------------------------------------
  -- 5. Peso y cálculo del monto con la tarifa vigente
  ------------------------------------------------------------------
  perform pg_temp.esperar_error(
    format($q$insert into tarifas_envio (metodo_envio_id, precio_por_unidad, fecha_inicio, fecha_fin)
              values (%s, 4.00, date '2026-06-01', date '2026-12-31')$q$, v_aereo),
    '23P01', 'segunda tarifa aérea activa con vigencia traslapada', 'ex_tarifas_sin_traslape');

  v_tarifa := fn_tarifa_vigente(v_aereo, current_date);
  if v_tarifa.precio_por_unidad <> 3.50 then raise exception 'FALLO: tarifa vigente %', v_tarifa.precio_por_unidad; end if;

  perform pg_temp.esperar_error(
    format('update paquetes set peso_lb = 2, tarifa_id = %s, tarifa_aplicada = 1.75, monto_calculado = 3.50 where id = %s',
           (select id from tarifas_envio where metodo_envio_id = v_maritimo), v_pkg1),
    '23503', 'aplicar tarifa marítima a paquete aéreo', 'fk_paquetes_tarifa_mismo_metodo');

  perform pg_temp.esperar_error(
    format('update paquetes set tarifa_id = %s, tarifa_aplicada = 3.50 where id = %s', v_tarifa.id, v_pkg1),
    '23514', 'tarifa sin peso ni monto (cálculo incompleto)', 'ck_paquetes_calculo_completo');

  -- Ejemplo del documento: 4.5 lb × 3.50 = 15.75
  update paquetes set peso_lb = 4.5, tarifa_id = v_tarifa.id, tarifa_aplicada = v_tarifa.precio_por_unidad,
                      monto_calculado = round(4.5 * v_tarifa.precio_por_unidad, 2)
  where id = v_pkg1 returning monto_calculado into v_monto1;
  update paquetes set peso_lb = 2.25, tarifa_id = v_tarifa.id, tarifa_aplicada = v_tarifa.precio_por_unidad,
                      monto_calculado = round(2.25 * v_tarifa.precio_por_unidad, 2)
  where id = v_pkg2 returning monto_calculado into v_monto2;
  if v_monto1 <> 15.75 then raise exception 'FALLO: monto % distinto de 15.75', v_monto1; end if;
  insert into historial_estados_paquete (paquete_id, estado_id, usuario_id)
  values (v_pkg1, 6, v_bodega), (v_pkg2, 6, v_bodega);
  raise notice 'OK  peso 4.5 lb × 3.50 = % USD; segundo paquete = % USD', v_monto1, v_monto2;

  -- Antes de facturar, el peso sí puede corregirse
  update paquetes set peso_lb = 2.25 where id = v_pkg2;

  ------------------------------------------------------------------
  -- 6. Factura con dos paquetes
  ------------------------------------------------------------------
  v_total := v_monto1 + v_monto2;
  perform pg_temp.esperar_error(
    format('insert into facturas (cliente_id, subtotal, total, usuario_id) values (%s, %s, %s, %s)',
           v_cli1, v_total, v_total + 1, v_admin),
    '23514', 'factura con total que no cuadra', 'ck_facturas_total');

  insert into facturas (cliente_id, subtotal, total, usuario_id)
  values (v_cli1, v_total, v_total, v_admin) returning id into v_factura;
  insert into detalles_factura (factura_id, paquete_id, descripcion, cantidad, precio_unitario, subtotal)
  select v_factura, id, 'Envío aéreo ' || codigo_paquete, peso_lb, tarifa_aplicada, monto_calculado
  from paquetes where id in (v_pkg1, v_pkg2);
  select numero_factura into v_texto from facturas where id = v_factura;
  raise notice 'OK  factura % emitida por % USD', v_texto, v_total;

  perform pg_temp.esperar_error(
    format($q$insert into facturas (cliente_id, subtotal, total, usuario_id) values (%s, 1, 1, %s);
              insert into detalles_factura (factura_id, paquete_id, descripcion, cantidad, precio_unitario, subtotal)
              values (currval(pg_get_serial_sequence('paqueteria.facturas', 'id')), %s, 'x', 1, 1, 1)$q$,
           v_cli1, v_admin, v_pkg1),
    '23505', 'facturar dos veces el mismo paquete', 'factura vigente');

  perform pg_temp.esperar_error(
    format($q$insert into facturas (cliente_id, subtotal, total, usuario_id) values (%s, 1, 1, %s);
              insert into detalles_factura (factura_id, paquete_id, descripcion, cantidad, precio_unitario, subtotal)
              values (currval(pg_get_serial_sequence('paqueteria.facturas', 'id')), %s, 'x', 1, 1, 1)$q$,
           v_cli2, v_admin, v_pkg2),
    '23514', 'facturar a un cliente el paquete de otro', 'no pertenece al cliente');

  perform pg_temp.esperar_error(
    format($q$insert into detalles_factura (factura_id, paquete_id, descripcion, cantidad, precio_unitario, subtotal)
              values (%s, null, 'Cargo', 2, 3.50, 8.00)$q$, v_factura),
    '23514', 'línea con subtotal distinto de cantidad × precio', 'ck_detalles_subtotal');

  -- Invariantes Factura ↔ Cliente ↔ Paquete ante UPDATE
  perform pg_temp.esperar_error(
    format('update paquetes set cliente_id = %s where id = %s', v_cli2, v_pkg1),
    '23001', 'cambiar el cliente de un paquete ya facturado', 'factura vigente');

  perform pg_temp.esperar_error(
    format('update paquetes set peso_lb = 9, monto_calculado = 31.50 where id = %s', v_pkg1),
    '23001', 'cambiar peso y monto de un paquete ya facturado', 'factura vigente');

  perform pg_temp.esperar_error(
    format('update facturas set cliente_id = %s where id = %s', v_cli2, v_factura),
    '23001', 'cambiar el cliente de una factura emitida', 'inmutables');

  perform pg_temp.esperar_error(
    format('update detalles_factura set paquete_id = %s where factura_id = %s and paquete_id = %s', v_pkg3, v_factura, v_pkg2),
    '23001', 'cambiar el paquete de una línea de factura', 'no se modifican');

  -- Inmutabilidad financiera
  perform pg_temp.esperar_error(
    format('update facturas set subtotal = subtotal - 5, total = total - 5 where id = %s', v_factura),
    '23001', 'cambiar los montos de una factura emitida', 'inmutables');

  perform pg_temp.esperar_error(
    format('update detalles_factura set cantidad = 1, subtotal = 3.50 where factura_id = %s and paquete_id = %s', v_factura, v_pkg1),
    '23001', 'cambiar la cantidad de una línea de factura', 'no se modifican');

  ------------------------------------------------------------------
  -- 7. Pagos parciales, en córdobas y anulación de pagos
  ------------------------------------------------------------------
  perform pg_temp.esperar_error(
    format($q$insert into pagos (factura_id, cliente_id, monto, metodo_pago, usuario_id) values (%s, %s, 5, 'EFECTIVO', %s)$q$,
           v_factura, v_cli2, v_admin),
    '23503', 'pago de un cliente distinto al de la factura', 'fk_pagos_factura_cliente');

  -- Pago registrado por error y anulado
  insert into pagos (factura_id, cliente_id, monto, metodo_pago, usuario_id)
  values (v_factura, v_cli1, 10.00, 'EFECTIVO', v_admin) returning id into v_pago;
  update pagos set estado = 'ANULADO', motivo_anulacion = 'Registrado dos veces', anulado_en = now() where id = v_pago;
  if (select estado_pago from v_facturas_saldo where factura_id = v_factura) <> 'PENDIENTE' then
    raise exception 'FALLO: un pago anulado sigue contando en el saldo';
  end if;
  raise notice 'OK  pago anulado deja de contar en el saldo';

  perform pg_temp.esperar_error(
    format($q$update pagos set estado = 'APLICADO', motivo_anulacion = null, anulado_en = null where id = %s$q$, v_pago),
    '23001', 'reactivar un pago anulado', 'anulado');

  -- Pago en córdobas: monto (USD) = round(córdobas / tipo de cambio, 2)
  perform pg_temp.esperar_error(
    format($q$insert into pagos (factura_id, cliente_id, monto, moneda, monto_moneda, tipo_cambio_aplicado, metodo_pago, usuario_id)
              values (%s, %s, 9.00, 'NIO', 300, 36.6243, 'EFECTIVO', %s)$q$, v_factura, v_cli1, v_admin),
    '23514', 'pago en córdobas con monto en USD que no corresponde al tipo de cambio', 'ck_pagos_moneda');

  insert into pagos (factura_id, cliente_id, monto, moneda, monto_moneda, tipo_cambio_aplicado, metodo_pago, usuario_id)
  values (v_factura, v_cli1, 8.19, 'NIO', 300, 36.6243, 'EFECTIVO', v_admin) returning id into v_pago;
  select * into v_saldo from v_facturas_saldo where factura_id = v_factura;
  if v_saldo.estado_pago <> 'PARCIAL' then raise exception 'FALLO: estado de pago %', v_saldo.estado_pago; end if;
  raise notice 'OK  pago parcial en córdobas: pagado %, saldo %, estado %', v_saldo.pagado, v_saldo.saldo, v_saldo.estado_pago;

  perform pg_temp.esperar_error(
    format('update pagos set monto = 20.00 where id = %s', v_pago),
    '23001', 'cambiar el monto de un pago', 'inmutables');

  perform pg_temp.esperar_error(
    format('update pagos set monto_moneda = 301 where id = %s', v_pago),
    '23001', 'cambiar los córdobas recibidos de un pago', 'inmutables');

  perform pg_temp.esperar_error(
    format('update pagos set factura_id = -1 where id = %s', v_pago),
    '23001', 'mover un pago a otra factura', 'inmutables');

  perform pg_temp.esperar_error(
    format($q$update facturas set estado = 'ANULADA', motivo_anulacion = 'x', anulada_en = now() where id = %s$q$, v_factura),
    '23514', 'anular una factura con pagos aplicados', 'pagos aplicados');

  perform pg_temp.esperar_error(
    format($q$insert into pagos (factura_id, cliente_id, monto, metodo_pago, usuario_id) values (%s, %s, %s, 'TRANSFERENCIA', %s)$q$,
           v_factura, v_cli1, v_saldo.saldo + 0.01, v_admin),
    '23514', 'pago mayor que el saldo', 'excede el saldo');

  insert into pagos (factura_id, cliente_id, monto, metodo_pago, referencia, usuario_id)
  values (v_factura, v_cli1, v_saldo.saldo, 'TRANSFERENCIA', 'BAC-778899', v_admin);
  select * into v_saldo from v_facturas_saldo where factura_id = v_factura;
  if v_saldo.estado_pago <> 'PAGADA' or v_saldo.saldo <> 0 then raise exception 'FALLO: factura no quedó pagada'; end if;
  raise notice 'OK  factura pagada: saldo %, estado %', v_saldo.saldo, v_saldo.estado_pago;

  insert into historial_estados_paquete (paquete_id, estado_id, usuario_id)
  select id, s, v_admin from paquetes, unnest(array[7, 8]) s where id in (v_pkg1, v_pkg2) order by s;

  ------------------------------------------------------------------
  -- 8. Segunda factura: numeración sin huecos y anulación
  ------------------------------------------------------------------
  insert into facturas (cliente_id, subtotal, total, usuario_id)
  values (v_cli2, 5.00, 5.00, v_admin) returning id into v_factura2;
  insert into detalles_factura (factura_id, descripcion, cantidad, precio_unitario, subtotal)
  values (v_factura2, 'Cargo de almacenaje', 1, 5.00, 5.00);
  select numero_factura into v_texto from facturas where id = v_factura2;
  if v_texto <> 'FAC-000002' then raise exception 'FALLO: hueco en numeración, se obtuvo %', v_texto; end if;
  raise notice 'OK  numeración sin huecos tras intentos fallidos: %', v_texto;

  perform pg_temp.esperar_error(
    format($q$update facturas set estado = 'ANULADA' where id = %s$q$, v_factura2),
    '23514', 'anular factura sin motivo ni fecha', 'ck_facturas_anulacion');

  update facturas set estado = 'ANULADA', motivo_anulacion = 'Cargo mal aplicado', anulada_en = now() where id = v_factura2;
  if (select estado_pago from v_facturas_saldo where factura_id = v_factura2) <> 'ANULADA' then
    raise exception 'FALLO: estado_pago de factura anulada';
  end if;
  raise notice 'OK  factura sin pagos anulada';

  perform pg_temp.esperar_error(
    format($q$update facturas set estado = 'EMITIDA', motivo_anulacion = null, anulada_en = null where id = %s$q$, v_factura2),
    '23001', 'reactivar una factura anulada', 'anulada');

  perform pg_temp.esperar_error(
    format($q$insert into pagos (factura_id, cliente_id, monto, metodo_pago, usuario_id) values (%s, %s, 1, 'EFECTIVO', %s)$q$,
           v_factura2, v_cli2, v_admin),
    '23514', 'pagar una factura anulada', 'factura anulada');

  perform pg_temp.esperar_error(
    format($q$insert into detalles_factura (factura_id, descripcion, cantidad, precio_unitario, subtotal)
              values (%s, 'Extra', 1, 1, 1)$q$, v_factura2),
    '23514', 'agregar una línea a una factura anulada', 'anulada');

  ------------------------------------------------------------------
  -- 9. Entregas
  ------------------------------------------------------------------
  perform pg_temp.esperar_error(
    format($q$insert into entregas (paquete_id, tipo_entrega, creado_por_usuario_id) values (%s, 'DELIVERY', %s)$q$,
           v_pkg1, v_admin),
    '23514', 'delivery sin dirección', 'ck_entregas_direccion');

  -- Paquete 1: delivery fallido y luego exitoso
  insert into entregas (paquete_id, tipo_entrega, direccion, estado, responsable_usuario_id, creado_por_usuario_id)
  values (v_pkg1, 'DELIVERY', 'Managua, Bolonia', 'EN_RUTA', v_repartidor, v_admin);
  insert into historial_estados_paquete (paquete_id, estado_id, usuario_id) values (v_pkg1, 9, v_repartidor);

  perform pg_temp.esperar_error(
    format($q$insert into entregas (paquete_id, tipo_entrega, creado_por_usuario_id) values (%s, 'RETIRO_EN_AGENCIA', %s)$q$,
           v_pkg1, v_admin),
    '23505', 'segunda entrega vigente para el mismo paquete', 'uq_entregas_paquete_vigente');

  update entregas set estado = 'FALLIDA', observaciones = 'Nadie en casa' where paquete_id = v_pkg1;
  insert into historial_estados_paquete (paquete_id, estado_id, usuario_id, observacion) values (v_pkg1, 8, v_repartidor, 'Entrega fallida');

  insert into entregas (paquete_id, tipo_entrega, direccion, estado, responsable_usuario_id, creado_por_usuario_id)
  values (v_pkg1, 'DELIVERY', 'Managua, Bolonia', 'EN_RUTA', v_repartidor, v_admin);
  perform pg_temp.esperar_error(
    format($q$update entregas set estado = 'ENTREGADA' where paquete_id = %s and estado = 'EN_RUTA'$q$, v_pkg1),
    '23514', 'entrega confirmada sin fecha ni persona que recibe', 'ck_entregas_entregada');
  update entregas set estado = 'ENTREGADA', fecha_entrega = now(), persona_recibe = 'María López'
  where paquete_id = v_pkg1 and estado = 'EN_RUTA';
  insert into historial_estados_paquete (paquete_id, estado_id, usuario_id) values (v_pkg1, 10, v_repartidor);

  -- Paquete 2: retiro en agencia
  insert into entregas (paquete_id, tipo_entrega, estado, fecha_entrega, persona_recibe, creado_por_usuario_id)
  values (v_pkg2, 'RETIRO_EN_AGENCIA', 'ENTREGADA', now(), 'María López', v_admin);
  insert into historial_estados_paquete (paquete_id, estado_id, usuario_id) values (v_pkg2, 10, v_admin);
  raise notice 'OK  entregas: paquete 1 por delivery (1 intento fallido), paquete 2 retirado en agencia';

  perform pg_temp.esperar_error(
    format('insert into historial_estados_paquete (paquete_id, estado_id, usuario_id) values (%s, 9, %s)', v_pkg1, v_admin),
    '23514', 'cambiar de estado un paquete ya ENTREGADO', 'estado final');

  perform pg_temp.esperar_error(
    format($q$update historial_estados_paquete set observacion = 'editado' where paquete_id = %s$q$, v_pkg1),
    '23001', 'modificar el historial', 'inmutable');

  select string_agg(e.codigo, ' → ' order by h.id) into v_texto
  from historial_estados_paquete h join estados_paquete e on e.id = h.estado_id
  where h.paquete_id = v_pkg1;
  raise notice 'OK  recorrido del paquete 1: %', v_texto;

  -- Cancelar libera el tracking para volver a registrarlo
  insert into historial_estados_paquete (paquete_id, estado_id, usuario_id) values (v_pkg3, 11, v_admin);
  insert into paquetes (cliente_id, tracking_externo, descripcion, metodo_envio_id, registrado_por_usuario_id)
  values (v_cli2, 'TBA000000001', 'Licuadora (re-registro)', v_maritimo, v_admin);
  raise notice 'OK  paquete cancelado libera su tracking';

  -- La auditoría registró los cambios (los triggers corren como la API)
  select count(*) into v_num from audit_logs where tabla = 'pagos' and accion = 'UPDATE';
  if v_num < 1 then raise exception 'FALLO: la anulación de un pago no quedó en la auditoría'; end if;
  perform pg_temp.esperar_error('update audit_logs set tabla = ''x''', '42501', 'la API modifica la auditoría');
  raise notice 'OK  auditoría registrada e inmutable para la API';

  ------------------------------------------------------------------
  -- 10. Aislamiento entre agencias (RLS + FK compuestas)
  ------------------------------------------------------------------
  insert into agencias (nombre) values ('Agencia B de prueba') returning id into v_agencia_b;
  perform set_config('paqueteria.agencia_id', v_agencia_b::text, true);

  -- La agencia B no ve nada de la A, tampoco a través de la vista de saldos
  foreach v_tabla in array v_tablas_agencia loop
    execute format('select count(*) from %I', v_tabla) into v_num;
    if v_num <> 0 then raise exception 'FALLO: la agencia B ve % filas de %', v_num, v_tabla; end if;
  end loop;
  select count(*) into v_num from audit_logs where agencia_id = v_agencia_a;
  if v_num <> 0 then raise exception 'FALLO: la agencia B ve la auditoría de la A'; end if;
  raise notice 'OK  la agencia B no ve datos de la A (% tablas, la vista de saldos y la auditoría)', array_length(v_tablas_agencia, 1);

  -- B no puede modificar filas de A: no las encuentra
  update clientes set telefono = 'robado' where id = v_cli1;
  get diagnostics v_num = row_count;
  if v_num <> 0 then raise exception 'FALLO: la agencia B modificó un cliente de la A'; end if;

  -- B no puede escribir a nombre de A (RLS WITH CHECK)
  perform pg_temp.esperar_error(
    format($q$insert into clientes (agencia_id, nombres, apellidos, telefono) values (%s, 'Intruso', 'B', '1')$q$, v_agencia_a),
    '42501', 'la agencia B inserta un cliente en la agencia A', 'row-level security');

  -- B no puede referenciar datos de A (FK compuestas: las FK no pasan por RLS)
  insert into usuarios (nombres, apellidos, correo) values ('Bea', 'B', 'bea@agencia-b.test') returning id into v_usuario_b;
  perform pg_temp.esperar_error(
    format($q$insert into paquetes (cliente_id, descripcion, metodo_envio_id, registrado_por_usuario_id)
              values (%s, 'Paquete con cliente ajeno', %s, %s)$q$, v_cli1, v_aereo, v_usuario_b),
    '23503', 'paquete de la agencia B con un cliente de la A', 'fk_paquetes_cliente');

  -- Numeración propia de cada agencia
  insert into clientes (nombres, apellidos, telefono) values ('Beatriz', 'B', '+505 1111 0000') returning codigo_cliente into v_texto;
  if v_texto <> 'CLI-000001' then raise exception 'FALLO: la agencia B no empieza su numeración en 1: %', v_texto; end if;
  raise notice 'OK  la agencia B no modifica, no escribe ni referencia datos de la A, y numera desde %', v_texto;

  -- Sin agencia en la sesión no se lee ni se escribe nada
  perform set_config('paqueteria.agencia_id', '', true);
  perform pg_temp.esperar_error('select count(*) from clientes', '42501', 'consultar sin agencia en la sesión', 'No hay una agencia');
  perform pg_temp.esperar_error(
    $q$insert into clientes (nombres, apellidos, telefono) values ('Sin', 'Agencia', '1')$q$,
    '42501', 'insertar sin agencia en la sesión', 'No hay una agencia');
  perform set_config('paqueteria.agencia_id', v_agencia_a::text, true);

  ------------------------------------------------------------------
  -- 11. Cuadre de facturas al confirmar la transacción
  ------------------------------------------------------------------
  -- Adelanta la verificación diferida: las facturas legítimas deben cuadrar.
  set constraints all immediate;
  raise notice 'OK  las facturas emitidas cuadran (al menos una línea y suma = subtotal)';

  perform pg_temp.esperar_error(
    format($q$insert into detalles_factura (factura_id, descripcion, cantidad, precio_unitario, subtotal)
              values (%s, 'Cargo agregado después', 1, 2.00, 2.00)$q$, v_factura),
    '23514', 'agregar una línea a una factura ya emitida', 'no coincide');

  perform pg_temp.esperar_error(
    format('insert into facturas (cliente_id, subtotal, total, usuario_id) values (%s, 5, 5, %s)', v_cli3, v_admin),
    '23514', 'factura sin líneas', 'no tiene líneas');

  -- Aquí sí se difiere la verificación para que la factura reciba su línea
  -- antes de comprobar el cuadre, como en una transacción normal.
  perform pg_temp.esperar_error(
    format($q$set constraints all deferred;
              insert into facturas (cliente_id, subtotal, total, usuario_id) values (%s, 5, 5, %s);
              insert into detalles_factura (factura_id, descripcion, cantidad, precio_unitario, subtotal)
              values (currval(pg_get_serial_sequence('paqueteria.facturas', 'id')), 'Cargo', 1, 4.00, 4.00);
              set constraints all immediate$q$,
           v_cli3, v_admin),
    '23514', 'factura cuyas líneas no suman el subtotal', 'no coincide');
  set constraints all immediate;

  ------------------------------------------------------------------
  -- 12. Política de no borrado
  ------------------------------------------------------------------
  -- Capa 1: el rol de la API no tiene DELETE ni TRUNCATE.
  foreach v_tabla in array v_tablas loop
    perform pg_temp.esperar_error(format('delete from %I', v_tabla), '42501', 'la API borra de ' || v_tabla);
    perform pg_temp.esperar_error(format('truncate %I', v_tabla), '42501', 'la API vacía ' || v_tabla);
  end loop;

  -- Capa 2: ni siquiera el dueño del esquema puede borrar sin deshabilitar
  -- los triggers a propósito. (El cliente 3 no tiene dependencias: sin el
  -- trigger su borrado se habría permitido.)
  perform pg_temp.esperar_error(
    format('reset role; delete from clientes where id = %s', v_cli3),
    '23001', 'el dueño borra un cliente sin dependencias', 'eliminar');

  foreach v_tabla in array v_tablas loop
    perform pg_temp.esperar_error(format('reset role; delete from %I', v_tabla), '23001', 'el dueño borra de ' || v_tabla, 'eliminar');
    perform pg_temp.esperar_error(format('reset role; set local client_min_messages = warning; truncate %I cascade', v_tabla),
                                  '23001', 'el dueño vacía ' || v_tabla, 'eliminar');
  end loop;

  if current_user <> 'paqueteria_api' then
    raise exception 'FALLO: el rol no volvió a paqueteria_api tras las pruebas del dueño';
  end if;

  if fn_formatear_codigo('CLI-', 1234567, 6) <> 'CLI-1234567' then raise exception 'FALLO: truncamiento de códigos'; end if;
  raise notice 'OK  códigos no se truncan al pasar de 999999';

  raise notice '=== TODAS LAS PRUEBAS PASARON ===';
end $$;

rollback;
