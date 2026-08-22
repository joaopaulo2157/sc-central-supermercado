-- ============================================================
-- SC CENTRAL - RPCs transacionais para o backend Node.js
-- Execute no SQL Editor do NOVO projeto Supabase depois do schema.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.sc_commit_order(p_order JSONB)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id TEXT := BTRIM(p_order->>'id');
  v_customer TEXT := BTRIM(p_order->>'customerName');
  v_phone TEXT := BTRIM(p_order->>'phone');
  v_method TEXT := COALESCE(NULLIF(BTRIM(p_order->>'method'),''),'Entrega');
  v_region_id BIGINT;
  v_region_name TEXT := COALESCE(p_order->>'regionName','');
  v_total NUMERIC(14,2) := COALESCE((p_order->>'total')::NUMERIC,0);
  v_item JSONB;
  v_product public.products%ROWTYPE;
  v_qty NUMERIC(14,3);
  v_expected_price NUMERIC(12,2);
BEGIN
  IF v_id = '' OR v_customer = '' OR v_phone = '' THEN
    RAISE EXCEPTION 'Pedido incompleto.';
  END IF;

  IF jsonb_array_length(COALESCE(p_order->'items','[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Carrinho vazio.';
  END IF;

  IF COALESCE(p_order->>'regionId','') ~ '^[0-9]+$' THEN
    v_region_id := (p_order->>'regionId')::BIGINT;
  ELSE
    v_region_id := NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM public.orders WHERE id = v_id) THEN
    RAISE EXCEPTION 'Pedido já existe.';
  END IF;

  -- Bloqueia os produtos antes da gravação e valida estoque/preço.
  FOR v_item IN
    SELECT value FROM jsonb_array_elements(p_order->'items')
  LOOP
    SELECT *
      INTO v_product
      FROM public.products
     WHERE id = (v_item->>'productId')::BIGINT
       AND active = TRUE
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto % indisponível.', v_item->>'productId';
    END IF;

    v_qty := (v_item->>'qty')::NUMERIC;
    v_expected_price := (v_item->>'price')::NUMERIC;

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantidade inválida para %.', v_product.name;
    END IF;

    IF v_product.stock < v_qty THEN
      RAISE EXCEPTION 'Estoque insuficiente para %.', v_product.name;
    END IF;

    IF ABS(v_product.price - v_expected_price) > 0.005 THEN
      RAISE EXCEPTION 'O preço de % foi alterado. Atualize o carrinho.', v_product.name;
    END IF;
  END LOOP;

  INSERT INTO public.orders(
    id, customer_name, phone, method, region_id, region_name,
    address, reference, delivery_time, payment, change_for, notes,
    coupon_code, subtotal, discount, delivery_fee, total, status,
    substitution_preference
  ) VALUES (
    v_id,
    v_customer,
    v_phone,
    v_method,
    v_region_id,
    v_region_name,
    COALESCE(p_order->>'address',''),
    COALESCE(p_order->>'reference',''),
    COALESCE(p_order->>'deliveryTime',''),
    COALESCE(p_order->>'payment',''),
    COALESCE(p_order->>'changeFor',''),
    COALESCE(p_order->>'notes',''),
    COALESCE(p_order->>'couponCode',''),
    COALESCE((p_order->>'subtotal')::NUMERIC,0),
    COALESCE((p_order->>'discount')::NUMERIC,0),
    COALESCE((p_order->>'deliveryFee')::NUMERIC,0),
    v_total,
    'novo',
    COALESCE(NULLIF(p_order->>'substitutionPreference',''),'contact')
  );

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(p_order->'items')
  LOOP
    SELECT *
      INTO v_product
      FROM public.products
     WHERE id = (v_item->>'productId')::BIGINT
     FOR UPDATE;

    v_qty := (v_item->>'qty')::NUMERIC;

    INSERT INTO public.order_items(
      order_id, product_id, name, unit, price, qty, substitution, item_note
    ) VALUES (
      v_id,
      v_product.id,
      v_product.name,
      v_product.unit,
      v_product.price,
      v_qty,
      COALESCE(v_item->>'substitution',''),
      COALESCE(v_item->>'itemNote','')
    );

    UPDATE public.products
       SET stock = stock - v_qty
     WHERE id = v_product.id;
  END LOOP;

  INSERT INTO public.order_events(order_id,status,note,user_id)
  VALUES (
    v_id,
    'novo',
    'Pedido criado pelo site e preparado para envio ao WhatsApp.',
    NULL
  );

  INSERT INTO public.customers(
    phone,name,last_address,last_region,order_count,total_spent
  ) VALUES (
    v_phone,
    v_customer,
    COALESCE(p_order->>'address',''),
    v_region_name,
    1,
    v_total
  )
  ON CONFLICT (phone)
  DO UPDATE SET
    name = EXCLUDED.name,
    last_address = EXCLUDED.last_address,
    last_region = EXCLUDED.last_region,
    order_count = public.customers.order_count + 1,
    total_spent = public.customers.total_spent + EXCLUDED.total_spent,
    updated_at = NOW();

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sc_update_order_status(
  p_order_id TEXT,
  p_status TEXT,
  p_note TEXT,
  p_user_id BIGINT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_status TEXT;
  v_item RECORD;
  v_product public.products%ROWTYPE;
BEGIN
  IF p_status NOT IN (
    'novo','confirmado','separando','pronto',
    'saiu_entrega','concluido','cancelado'
  ) THEN
    RAISE EXCEPTION 'Status inválido.';
  END IF;

  SELECT status
    INTO v_old_status
    FROM public.orders
   WHERE id = p_order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado.';
  END IF;

  IF v_old_status = p_status THEN
    RETURN p_order_id;
  END IF;

  IF p_status = 'cancelado' AND v_old_status <> 'cancelado' THEN
    FOR v_item IN
      SELECT product_id, qty
        FROM public.order_items
       WHERE order_id = p_order_id
         AND product_id IS NOT NULL
    LOOP
      UPDATE public.products
         SET stock = stock + v_item.qty
       WHERE id = v_item.product_id;
    END LOOP;
  END IF;

  IF v_old_status = 'cancelado' AND p_status <> 'cancelado' THEN
    FOR v_item IN
      SELECT product_id, qty
        FROM public.order_items
       WHERE order_id = p_order_id
         AND product_id IS NOT NULL
    LOOP
      SELECT *
        INTO v_product
        FROM public.products
       WHERE id = v_item.product_id
       FOR UPDATE;

      IF NOT FOUND OR v_product.stock < v_item.qty THEN
        RAISE EXCEPTION 'Não há estoque suficiente para reativar o pedido.';
      END IF;
    END LOOP;

    FOR v_item IN
      SELECT product_id, qty
        FROM public.order_items
       WHERE order_id = p_order_id
         AND product_id IS NOT NULL
    LOOP
      UPDATE public.products
         SET stock = stock - v_item.qty
       WHERE id = v_item.product_id;
    END LOOP;
  END IF;

  UPDATE public.orders
     SET status = p_status
   WHERE id = p_order_id;

  INSERT INTO public.order_events(order_id,status,note,user_id)
  VALUES (p_order_id,p_status,COALESCE(p_note,''),p_user_id);

  INSERT INTO public.audit_log(
    user_id,action,entity_type,entity_id,details
  ) VALUES (
    p_user_id,
    'status_update',
    'order',
    p_order_id,
    v_old_status || ' -> ' || p_status
  );

  RETURN p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.sc_commit_order(JSONB)
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.sc_update_order_status(TEXT,TEXT,TEXT,BIGINT)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.sc_commit_order(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.sc_update_order_status(TEXT,TEXT,TEXT,BIGINT) TO service_role;

COMMIT;
