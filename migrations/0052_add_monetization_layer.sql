CREATE TABLE IF NOT EXISTS payment_providers (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(40) NOT NULL CHECK (code = 'yookassa'),
  name varchar(120) NOT NULL,
  encrypted_credentials text NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'inactive',
  priority integer NOT NULL DEFAULT 100,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_providers_one_active_idx
  ON payment_providers (status)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS commerce_products (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  type varchar(40) NOT NULL,
  scope_type varchar(30) NOT NULL,
  scope_id varchar,
  code varchar(100) NOT NULL UNIQUE,
  title varchar(180) NOT NULL,
  description text,
  status varchar(20) NOT NULL DEFAULT 'draft',
  visibility varchar(20) NOT NULL DEFAULT 'private',
  sort_order integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS commerce_products_lookup_idx
  ON commerce_products (type, scope_type, scope_id, status);

CREATE TABLE IF NOT EXISTS commerce_prices (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id varchar NOT NULL REFERENCES commerce_products(id) ON DELETE CASCADE,
  amount_rub integer NOT NULL,
  period varchar(20) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'active',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS commerce_prices_product_status_idx
  ON commerce_prices (product_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS commerce_prices_one_default_idx
  ON commerce_prices (product_id)
  WHERE is_default = true AND status = 'active';

CREATE TABLE IF NOT EXISTS commerce_product_features (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id varchar NOT NULL REFERENCES commerce_products(id) ON DELETE CASCADE,
  label text NOT NULL,
  feature_key varchar(120) NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_highlighted boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS commerce_product_features_product_sort_idx
  ON commerce_product_features (product_id, sort_order);

CREATE TABLE IF NOT EXISTS commerce_orders (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id varchar NOT NULL REFERENCES commerce_products(id),
  price_id varchar NOT NULL REFERENCES commerce_prices(id),
  status varchar(20) NOT NULL DEFAULT 'pending',
  amount_rub integer NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS commerce_orders_user_status_idx
  ON commerce_orders (user_id, status);

CREATE INDEX IF NOT EXISTS commerce_orders_created_at_idx
  ON commerce_orders (created_at);

CREATE TABLE IF NOT EXISTS commerce_payments (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id varchar NOT NULL REFERENCES commerce_orders(id) ON DELETE CASCADE,
  provider_id varchar REFERENCES payment_providers(id) ON DELETE SET NULL,
  provider_payment_id varchar(180),
  status varchar(30) NOT NULL DEFAULT 'pending',
  amount_rub integer NOT NULL,
  payment_method_token text,
  fiscal_receipt_id varchar(180),
  fiscal_receipt_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS commerce_payments_provider_payment_idx
  ON commerce_payments (provider_id, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS commerce_payments_order_status_idx
  ON commerce_payments (order_id, status);

CREATE TABLE IF NOT EXISTS commerce_payment_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_code varchar(40) NOT NULL,
  provider_event_id varchar(180) NOT NULL,
  provider_payment_id varchar(180),
  event_type varchar(100) NOT NULL,
  payload_hash varchar(64) NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'received',
  received_at timestamp NOT NULL DEFAULT now(),
  processed_at timestamp,
  error_message text
);

CREATE UNIQUE INDEX IF NOT EXISTS commerce_payment_events_provider_event_idx
  ON commerce_payment_events (provider_code, provider_event_id);

CREATE INDEX IF NOT EXISTS commerce_payment_events_payment_idx
  ON commerce_payment_events (provider_payment_id);

CREATE TABLE IF NOT EXISTS commerce_subscriptions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id varchar NOT NULL REFERENCES commerce_products(id),
  price_id varchar NOT NULL REFERENCES commerce_prices(id),
  provider_id varchar REFERENCES payment_providers(id) ON DELETE SET NULL,
  provider_subscription_id varchar(180),
  payment_method_token text,
  status varchar(20) NOT NULL DEFAULT 'pending',
  current_period_start timestamp,
  current_period_end timestamp,
  grace_until timestamp,
  retry_count integer NOT NULL DEFAULT 0,
  cancelled_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS commerce_subscriptions_user_status_idx
  ON commerce_subscriptions (user_id, status);

CREATE INDEX IF NOT EXISTS commerce_subscriptions_period_end_idx
  ON commerce_subscriptions (current_period_end);

CREATE TABLE IF NOT EXISTS commerce_entitlements (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope_type varchar(30) NOT NULL,
  scope_id varchar,
  feature_key varchar(120) NOT NULL,
  source_type varchar(30) NOT NULL,
  source_id varchar,
  status varchar(20) NOT NULL DEFAULT 'active',
  starts_at timestamp NOT NULL DEFAULT now(),
  ends_at timestamp,
  created_by varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS commerce_entitlements_access_idx
  ON commerce_entitlements (user_id, scope_type, scope_id, feature_key, status);

CREATE INDEX IF NOT EXISTS commerce_entitlements_expiry_idx
  ON commerce_entitlements (ends_at);
