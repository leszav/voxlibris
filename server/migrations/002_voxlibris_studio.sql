-- ============================================
-- MIGRATION 002: VoxLibris Studio Tables
-- ============================================
-- This migration adds tables for VoxLibris Studio:
-- - Club Reading Status (multiple readers)
-- - Session Reactions (positive/negative)
-- - Session Questions (via chat)
-- - Session Analytics
-- - Monetization (club settings, earnings, payments, subscriptions)
-- - Reading Schedule
-- - Session Recordings (for reader clubs)
-- - Reader Quality Ratings
-- ============================================

BEGIN;

-- ============================================
-- UPDATE CLUBS TABLE - Add type column
-- ============================================

-- Add type column to clubs table (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clubs' AND column_name = 'type'
    ) THEN
        ALTER TABLE clubs ADD COLUMN type VARCHAR(20) NOT NULL DEFAULT 'standard';
        CREATE TYPE club_type_enum AS ENUM ('general', 'reader');
        ALTER TABLE clubs ALTER COLUMN type TYPE club_type_enum USING type::club_type_enum;
        ALTER TABLE clubs ALTER COLUMN type SET DEFAULT 'general';
    END IF;
END $$;

-- ============================================
-- CLUB READING STATUS
-- ============================================

CREATE TABLE IF NOT EXISTS club_reading_status (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id VARCHAR NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id VARCHAR NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    session_id VARCHAR REFERENCES reading_sessions(id),
    
    -- Status
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    started_at TIMESTAMP,
    
    -- Current position
    current_chapter INTEGER NOT NULL DEFAULT 1,
    current_position TEXT, -- JSON: {scrollTop, paragraph, offset}
    
    -- For reader clubs
    is_open_for_listeners BOOLEAN NOT NULL DEFAULT TRUE,
    listener_count INTEGER NOT NULL DEFAULT 0,
    
    -- Session type
    session_type VARCHAR(20) NOT NULL DEFAULT 'general',
    
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    -- Unique constraint: only one active reader per club
    CONSTRAINT club_active_reader UNIQUE (club_id, is_active)
);

CREATE INDEX idx_club_reading_status_active ON club_reading_status(club_id, is_active) WHERE is_active = TRUE;
CREATE INDEX idx_club_reading_status_user ON club_reading_status(user_id);
CREATE INDEX idx_club_reading_status_session ON club_reading_status(session_id);

-- ============================================
-- SESSION REACTIONS
-- ============================================

CREATE TABLE IF NOT EXISTS session_reactions (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR NOT NULL REFERENCES reading_sessions(id) ON DELETE CASCADE,
    user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji VARCHAR(50) NOT NULL,
    type VARCHAR(20) NOT NULL DEFAULT 'positive', -- positive, negative
    position TEXT, -- Timestamp in seconds
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_session_reactions_session ON session_reactions(session_id);
CREATE INDEX idx_session_reactions_user ON session_reactions(user_id);
CREATE INDEX idx_session_reactions_type ON session_reactions(type);
CREATE INDEX idx_session_reactions_created ON session_reactions(created_at DESC);

-- ============================================
-- SESSION QUESTIONS
-- ============================================

CREATE TABLE IF NOT EXISTS session_questions (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR NOT NULL REFERENCES reading_sessions(id) ON DELETE CASCADE,
    user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    is_answered BOOLEAN NOT NULL DEFAULT FALSE,
    answer TEXT,
    answered_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_session_questions_session ON session_questions(session_id, is_answered);
CREATE INDEX idx_session_questions_user ON session_questions(user_id);
CREATE INDEX idx_session_questions_created ON session_questions(created_at DESC);

-- ============================================
-- SESSION ANALYTICS
-- ============================================

CREATE TABLE IF NOT EXISTS session_analytics (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR NOT NULL REFERENCES reading_sessions(id) ON DELETE CASCADE,
    
    -- Listener statistics
    peak_listener_count INTEGER DEFAULT 0,
    average_listener_count INTEGER DEFAULT 0,
    total_listeners INTEGER DEFAULT 0,
    
    -- Listening time
    total_listen_time INTEGER DEFAULT 0, -- In seconds
    average_session_duration INTEGER DEFAULT 0, -- In seconds
    
    -- Reactions and questions
    reaction_count INTEGER DEFAULT 0,
    positive_reaction_count INTEGER DEFAULT 0,
    negative_reaction_count INTEGER DEFAULT 0,
    question_count INTEGER DEFAULT 0,
    
    -- Quality
    audio_quality_score INTEGER, -- 0-100
    network_quality_score INTEGER, -- 0-100
    
    -- Geography (JSON)
    listener_regions TEXT, -- JSON: {RU: 10, US: 5, ...}
    listener_cities TEXT, -- JSON: {Moscow: 8, "New York": 3, ...}
    
    -- Devices (JSON)
    device_types TEXT, -- JSON: {desktop: 12, mobile: 8, tablet: 2}
    
    -- Retention (JSON)
    retention TEXT, -- JSON: {"1min": 20, "5min": 15, "10min": 10}
    
    -- Additional metadata
    metadata TEXT,
    
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_session_analytics_session ON session_analytics(session_id);
CREATE INDEX idx_session_analytics_created ON session_analytics(created_at DESC);

-- ============================================
-- CLUB MONETIZATION
-- ============================================

CREATE TABLE IF NOT EXISTS club_monetization (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id VARCHAR NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    
    -- Monetization type
    type VARCHAR(20) NOT NULL, -- one_time, subscription, donation
    
    -- For one-time payment
    one_time_amount INTEGER, -- In cents
    one_time_currency VARCHAR(3) DEFAULT 'USD',
    
    -- For subscription
    subscription_amount INTEGER, -- In cents per month
    subscription_currency VARCHAR(3) DEFAULT 'USD',
    subscription_interval VARCHAR(20) DEFAULT 'monthly', -- monthly, yearly
    
    -- For donations
    donation_min_amount INTEGER, -- Minimum amount
    donation_max_amount INTEGER, -- Maximum amount
    donation_suggested_amounts TEXT, -- JSON: [100, 500, 1000] in cents
    donation_currency VARCHAR(3) DEFAULT 'USD',
    
    -- Platform fee
    platform_fee_percent INTEGER NOT NULL DEFAULT 10, -- 10%
    
    -- Payout method
    payout_method VARCHAR(50), -- stripe, bank, crypto, etc
    payout_details TEXT, -- JSON: {accountNumber, routingNumber, ...}
    
    -- Status
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    -- Unique: only one active monetization setting per club
    CONSTRAINT club_active_monetization UNIQUE (club_id, is_active)
);

CREATE INDEX idx_club_monetization_club ON club_monetization(club_id);
CREATE INDEX idx_club_monetization_active ON club_monetization(is_active) WHERE is_active = TRUE;

-- ============================================
-- READER EARNINGS
-- ============================================

CREATE TABLE IF NOT EXISTS reader_earnings (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR NOT NULL REFERENCES reading_sessions(id) ON DELETE CASCADE,
    reader_id VARCHAR NOT NULL REFERENCES users(id),
    club_id VARCHAR NOT NULL REFERENCES clubs(id),
    
    -- Monetization type
    monetization_type VARCHAR(20) NOT NULL,
    
    -- Gross amount (before platform fee)
    gross_amount INTEGER NOT NULL, -- In cents
    currency VARCHAR(3) DEFAULT 'USD',
    
    -- Platform fee
    platform_fee_percent INTEGER NOT NULL,
    platform_fee_amount INTEGER NOT NULL, -- In cents
    
    -- Net amount
    net_amount INTEGER NOT NULL, -- In cents
    
    -- Statistics
    listener_count INTEGER DEFAULT 0,
    payment_count INTEGER DEFAULT 0,
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, processing, paid, failed
    
    -- Payout
    payout_id VARCHAR, -- ID from payment system
    payout_status VARCHAR(20), -- pending, completed, failed
    payout_at TIMESTAMP,
    
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reader_earnings_reader ON reader_earnings(reader_id);
CREATE INDEX idx_reader_earnings_club ON reader_earnings(club_id);
CREATE INDEX idx_reader_earnings_status ON reader_earnings(status);
CREATE INDEX idx_reader_earnings_created ON reader_earnings(created_at DESC);

-- ============================================
-- LISTENER PAYMENTS
-- ============================================

CREATE TABLE IF NOT EXISTS listener_payments (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR REFERENCES reading_sessions(id) ON DELETE CASCADE,
    user_id VARCHAR NOT NULL REFERENCES users(id),
    club_id VARCHAR NOT NULL REFERENCES clubs(id),
    
    -- Monetization type
    monetization_type VARCHAR(20) NOT NULL,
    
    -- Amount
    amount INTEGER NOT NULL, -- In cents
    currency VARCHAR(3) DEFAULT 'USD',
    
    -- Payment system
    payment_provider VARCHAR(50), -- stripe, paypal, etc
    payment_intent_id VARCHAR, -- ID from payment system
    payment_method_id VARCHAR, -- ID of payment method
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, completed, failed, refunded, cancelled
    
    -- Refund
    refund_id VARCHAR,
    refund_amount INTEGER,
    refund_reason TEXT,
    refunded_at TIMESTAMP,
    
    -- Additional metadata
    metadata TEXT, -- JSON: {receiptUrl, fraudScore, ...}
    
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_listener_payments_user ON listener_payments(user_id);
CREATE INDEX idx_listener_payments_club ON listener_payments(club_id);
CREATE INDEX idx_listener_payments_status ON listener_payments(status);
CREATE INDEX idx_listener_payments_created ON listener_payments(created_at DESC);

-- ============================================
-- CLUB SUBSCRIPTIONS
-- ============================================

CREATE TABLE IF NOT EXISTS club_subscriptions (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id VARCHAR NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Subscription details
    amount INTEGER NOT NULL, -- In cents
    currency VARCHAR(3) DEFAULT 'USD',
    interval VARCHAR(20) NOT NULL DEFAULT 'monthly', -- monthly, yearly
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'active', -- active, past_due, canceled, unpaid, trialing
    
    -- Dates
    current_period_start TIMESTAMP NOT NULL,
    current_period_end TIMESTAMP NOT NULL,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    canceled_at TIMESTAMP,
    
    -- Payment system
    payment_provider VARCHAR(50),
    subscription_id VARCHAR, -- ID from payment system
    
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    -- Unique: only one active subscription per user per club
    CONSTRAINT club_subscription_active UNIQUE (club_id, user_id, status)
);

CREATE INDEX idx_club_subscriptions_user ON club_subscriptions(user_id, status);
CREATE INDEX idx_club_subscriptions_club ON club_subscriptions(club_id);
CREATE INDEX idx_club_subscriptions_status ON club_subscriptions(status);

-- ============================================
-- READING SCHEDULE
-- ============================================

CREATE TABLE IF NOT EXISTS reading_schedule (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id VARCHAR NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    book_id VARCHAR NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL, -- "Reading chapter 1-3"
    description TEXT,
    
    -- Scheduled time
    scheduled_start TIMESTAMP NOT NULL,
    scheduled_end TIMESTAMP,
    estimated_duration INTEGER, -- In minutes
    
    -- Current position in book
    start_chapter INTEGER NOT NULL DEFAULT 1,
    start_position TEXT, -- JSON: {scrollTop, paragraph, offset}
    end_chapter INTEGER,
    end_position TEXT, -- JSON
    
    -- Schedule status
    status VARCHAR(20) NOT NULL DEFAULT 'scheduled', -- scheduled, in_progress, completed, cancelled
    
    -- Link to reading session
    session_id VARCHAR REFERENCES reading_sessions(id),
    
    -- Recurrence
    is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
    recurring_pattern TEXT, -- JSON: {frequency: 'weekly', days: [1,3,5], endDate: '2025-03-01'}
    
    -- Notifications
    reminder_minutes INTEGER DEFAULT 15, -- How many minutes before to remind
    reminders_sent BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Statistics
    actual_start TIMESTAMP,
    actual_end TIMESTAMP,
    attendees_count INTEGER DEFAULT 0,
    
    created_by VARCHAR NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reading_schedule_club ON reading_schedule(club_id, status);
CREATE INDEX idx_reading_schedule_start ON reading_schedule(scheduled_start);
CREATE INDEX idx_reading_schedule_created_by ON reading_schedule(created_by);

-- ============================================
-- SESSION RECORDINGS
-- ============================================

CREATE TABLE IF NOT EXISTS session_recordings (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR NOT NULL REFERENCES reading_sessions(id) ON DELETE CASCADE,
    club_id VARCHAR NOT NULL REFERENCES clubs(id),
    
    -- Recording file
    recording_url TEXT, -- URL to recording on S3/local storage
    storage_key TEXT, -- Key in storage
    duration INTEGER, -- Duration in seconds
    file_size INTEGER, -- Size in bytes
    format VARCHAR(20) DEFAULT 'webm', -- webm, mp3, etc
    
    -- Processing status
    status VARCHAR(20) NOT NULL DEFAULT 'processing', -- processing, ready, failed, deleted
    
    -- Recording type
    is_local BOOLEAN DEFAULT FALSE, -- Local recording on connection loss
    is_backup BOOLEAN DEFAULT FALSE, -- Backup copy
    
    -- Quality
    bitrate INTEGER, -- In kbps
    sample_rate INTEGER, -- In Hz
    channels INTEGER, -- 1 = mono, 2 = stereo
    
    -- Availability
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    available_until TIMESTAMP, -- Date when recording becomes unavailable
    
    -- Additional metadata
    metadata TEXT,
    
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_session_recordings_session ON session_recordings(session_id);
CREATE INDEX idx_session_recordings_club ON session_recordings(club_id, is_available);
CREATE INDEX idx_session_recordings_status ON session_recordings(status);

-- ============================================
-- READER QUALITY RATINGS
-- ============================================

CREATE TABLE IF NOT EXISTS reader_quality_ratings (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    rated_user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- Whose rating
    rater_user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- Who rated
    club_id VARCHAR REFERENCES clubs(id) ON DELETE CASCADE, -- In which club (can be null for global rating)
    
    -- Rating criteria
    voice_quality INTEGER, -- 1-5, voice quality
    reading_pace INTEGER, -- 1-5, reading pace
    articulation INTEGER, -- 1-5, articulation
    emotion INTEGER, -- 1-5, emotional delivery
    
    -- Overall rating
    overall_rating INTEGER NOT NULL, -- 1-5
    
    -- Comment
    feedback TEXT,
    
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    -- Unique: user can rate another user only once per club
    CONSTRAINT unique_rating_per_club UNIQUE (rated_user_id, rater_user_id, club_id)
);

CREATE INDEX idx_reader_quality_ratings_rated ON reader_quality_ratings(rated_user_id);
CREATE INDEX idx_reader_quality_ratings_rater ON reader_quality_ratings(rater_user_id);
CREATE INDEX idx_reader_quality_ratings_club ON reader_quality_ratings(club_id);
CREATE INDEX idx_reader_quality_ratings_created ON reader_quality_ratings(created_at DESC);

-- ============================================
-- UPDATE USER PROFILES - Add reader quality rating
-- ============================================

-- Add reader_quality_rating to user_profiles if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'user_profiles' AND column_name = 'reader_quality_rating'
    ) THEN
        ALTER TABLE user_profiles ADD COLUMN reader_quality_rating INTEGER DEFAULT 0; -- 0-500 (5.0 * 100)
    END IF;
END $$;

-- ============================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for tables with updated_at
CREATE TRIGGER update_club_reading_status_updated_at BEFORE UPDATE ON club_reading_status
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_session_analytics_updated_at BEFORE UPDATE ON session_analytics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_club_monetization_updated_at BEFORE UPDATE ON club_monetization
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reader_earnings_updated_at BEFORE UPDATE ON reader_earnings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_listener_payments_updated_at BEFORE UPDATE ON listener_payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_club_subscriptions_updated_at BEFORE UPDATE ON club_subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reading_schedule_updated_at BEFORE UPDATE ON reading_schedule
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_session_recordings_updated_at BEFORE UPDATE ON session_recordings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;

-- ============================================
-- END OF MIGRATION 002
-- ============================================
