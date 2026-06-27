CREATE TABLE IF NOT EXISTS commerce_entitlement_actions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  entitlement_id varchar NOT NULL REFERENCES commerce_entitlements(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  admin_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  action_type varchar(40) NOT NULL,
  reason text NOT NULL,
  previous_status varchar(20) NOT NULL,
  new_status varchar(20) NOT NULL,
  previous_ends_at timestamp,
  new_ends_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS commerce_entitlement_actions_entitlement_idx
  ON commerce_entitlement_actions(entitlement_id, created_at);

CREATE INDEX IF NOT EXISTS commerce_entitlement_actions_user_idx
  ON commerce_entitlement_actions(user_id, created_at);

ALTER TABLE commerce_entitlements
  ADD COLUMN IF NOT EXISTS renewal_status varchar(30) NOT NULL DEFAULT 'active';

ALTER TABLE commerce_entitlements
  ADD COLUMN IF NOT EXISTS renewal_cancelled_at timestamp;

CREATE INDEX IF NOT EXISTS commerce_entitlements_renewal_status_idx
  ON commerce_entitlements(renewal_status, status);

ALTER TABLE commerce_product_features
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS commerce_product_features_active_idx
  ON commerce_product_features(product_id, is_active, sort_order);
