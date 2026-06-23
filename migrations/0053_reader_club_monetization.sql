-- Reader club monetization foundation

CREATE TABLE IF NOT EXISTS reader_club_tariff_templates (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  title varchar(180) NOT NULL,
  description text,
  amount_rub integer NOT NULL CHECK (amount_rub > 0),
  period varchar(20) NOT NULL CHECK (period IN ('week', 'month', 'quarter', 'year')),
  reader_share_bps integer NOT NULL CHECK (reader_share_bps >= 0 AND reader_share_bps <= 10000),
  acquiring_fee_bps integer NOT NULL DEFAULT 0 CHECK (acquiring_fee_bps >= 0 AND acquiring_fee_bps <= 10000),
  status varchar(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  visibility varchar(20) NOT NULL DEFAULT 'private' CHECK (visibility IN ('public', 'private')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reader_club_tariff_requests (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id varchar NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  requested_by varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title varchar(180) NOT NULL,
  description text,
  requested_amount_rub integer NOT NULL CHECK (requested_amount_rub > 0),
  requested_period varchar(20) NOT NULL CHECK (requested_period IN ('week', 'month', 'quarter', 'year')),
  message text,
  status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by varchar REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamp,
  review_comment text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reader_club_tariff_assignments (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id varchar NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  template_id varchar REFERENCES reader_club_tariff_templates(id) ON DELETE SET NULL,
  product_id varchar NOT NULL REFERENCES commerce_products(id) ON DELETE CASCADE,
  selected_by varchar REFERENCES users(id) ON DELETE SET NULL,
  reader_share_bps integer NOT NULL CHECK (reader_share_bps >= 0 AND reader_share_bps <= 10000),
  acquiring_fee_bps integer NOT NULL DEFAULT 0 CHECK (acquiring_fee_bps >= 0 AND acquiring_fee_bps <= 10000),
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS commerce_ledger_entries (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id varchar NOT NULL REFERENCES commerce_payments(id) ON DELETE CASCADE,
  order_id varchar NOT NULL REFERENCES commerce_orders(id) ON DELETE CASCADE,
  product_id varchar NOT NULL REFERENCES commerce_products(id) ON DELETE CASCADE,
  club_id varchar REFERENCES clubs(id) ON DELETE SET NULL,
  reader_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  entry_type varchar(30) NOT NULL CHECK (entry_type IN ('acquiring_fee', 'reader_earning', 'platform_fee')),
  amount_kopecks integer NOT NULL CHECK (amount_kopecks >= 0),
  share_bps integer CHECK (share_bps >= 0 AND share_bps <= 10000),
  status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'available', 'paid', 'void')),
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS commerce_renewal_reminders (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  entitlement_id varchar NOT NULL REFERENCES commerce_entitlements(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  days_before_end integer NOT NULL CHECK (days_before_end BETWEEN 1 AND 5),
  sent_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS reader_club_tariff_assignments_active_club_idx
  ON reader_club_tariff_assignments (club_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS reader_club_tariff_templates_status_idx
  ON reader_club_tariff_templates (status, visibility, sort_order);

CREATE INDEX IF NOT EXISTS reader_club_tariff_requests_club_status_idx
  ON reader_club_tariff_requests (club_id, status);

CREATE INDEX IF NOT EXISTS commerce_ledger_entries_payment_idx
  ON commerce_ledger_entries (payment_id);

CREATE INDEX IF NOT EXISTS commerce_ledger_entries_reader_status_idx
  ON commerce_ledger_entries (reader_user_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS commerce_renewal_reminders_entitlement_day_idx
  ON commerce_renewal_reminders (entitlement_id, days_before_end);

CREATE INDEX IF NOT EXISTS commerce_renewal_reminders_user_idx
  ON commerce_renewal_reminders (user_id, sent_at);
