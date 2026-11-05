-- Remove legacy Expo / native device push tokens (PWA uses web_push_subscriptions).
DROP TABLE IF EXISTS "device_push_tokens";
