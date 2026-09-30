-- Orders: the reference area. Tenant isolation lives in RLS, the rest in constraints.
CREATE SCHEMA IF NOT EXISTS app;

CREATE FUNCTION app.current_tenant() RETURNS uuid LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_tenant text := nullif(current_setting('app.tenant_id', true), '');
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant not set' USING ERRCODE = '42501';
  END IF;
  RETURN v_tenant::uuid;
END $$;

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  customer_name text NOT NULL CHECK (length(customer_name) BETWEEN 1 AND 200),
  total_cents integer NOT NULL CHECK (total_cents > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed')),
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  CONSTRAINT orders_confirmed_at_matches_status
    CHECK ((status = 'confirmed') = (confirmed_at IS NOT NULL)),
  CONSTRAINT orders_idempotency_key_per_tenant UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX orders_tenant_created_idx ON orders (tenant_id, created_at DESC, id DESC);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY orders_select ON orders FOR SELECT
  USING (tenant_id = app.current_tenant());
CREATE POLICY orders_insert ON orders FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant());
CREATE POLICY orders_update ON orders FOR UPDATE
  USING (tenant_id = app.current_tenant())
  WITH CHECK (tenant_id = app.current_tenant());
