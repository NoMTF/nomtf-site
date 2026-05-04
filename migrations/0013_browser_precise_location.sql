ALTER TABLE user_ip_events ADD COLUMN browser_latitude TEXT NOT NULL DEFAULT '';
ALTER TABLE user_ip_events ADD COLUMN browser_longitude TEXT NOT NULL DEFAULT '';
ALTER TABLE user_ip_events ADD COLUMN browser_accuracy TEXT NOT NULL DEFAULT '';
ALTER TABLE user_ip_events ADD COLUMN browser_altitude TEXT NOT NULL DEFAULT '';
ALTER TABLE user_ip_events ADD COLUMN browser_altitude_accuracy TEXT NOT NULL DEFAULT '';
ALTER TABLE user_ip_events ADD COLUMN browser_heading TEXT NOT NULL DEFAULT '';
ALTER TABLE user_ip_events ADD COLUMN browser_speed TEXT NOT NULL DEFAULT '';
ALTER TABLE user_ip_events ADD COLUMN browser_recorded_at TEXT NOT NULL DEFAULT '';
