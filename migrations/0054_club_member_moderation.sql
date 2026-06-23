ALTER TABLE club_members ADD COLUMN IF NOT EXISTS muted_until timestamp;
ALTER TABLE club_members ADD COLUMN IF NOT EXISTS deactivated_until timestamp;
ALTER TABLE club_members ADD COLUMN IF NOT EXISTS restriction_reason text;
ALTER TABLE club_members ADD COLUMN IF NOT EXISTS restricted_by varchar REFERENCES users(id);
ALTER TABLE club_members ADD COLUMN IF NOT EXISTS restricted_at timestamp;

CREATE INDEX IF NOT EXISTS idx_club_members_muted_until ON club_members(muted_until);
CREATE INDEX IF NOT EXISTS idx_club_members_deactivated_until ON club_members(deactivated_until);
