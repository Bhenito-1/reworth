# ReWorth mobile Maestro stubs
#
# Install: https://maestro.mobile.dev
# Run against a device/sim with package/bundle `com.reworth.app`
# (see apps/mobile/app.json). Expo Go needs appId override to the host Expo app.
#
# Env:
#   OTP_CODE   — from mock `debugCode` or Termii SMS/WhatsApp
#
# Flows:
#   00_demo_60s.yaml         — ≤60s Home → PDP → Chats (record for PO)
#   01_register_list.yaml    — phone OTP + Sell mock photos + Analyze
#   02_search_chat_offer.yaml
#   03_buy_flow.yaml
#   04_dispute.yaml
#   05_boost_listing.yaml
#
# Stable testIDs (prefer over text):
#   tab-home | tab-discover | tab-sell | tab-chats | tab-profile
#   listing-card-0 | chats-title | btn-locate-me | chat-meetup-pin
#   pdp-share | pdp-close | pdp-chat | pdp-save | pdp-offer | pdp-buy
#   phone-input | send-otp | otp-input | verify-otp
#   sell-take-photo | sell-gallery | sell-mock-photos | sell-analyze
#
# Example:
#   maestro test -e OTP_CODE=123456 e2e/mobile/01_register_list.yaml
#   maestro test e2e/mobile/00_demo_60s.yaml
#
# ## Recording (PO ≤60s acceptance)
#
# 1. Start API + seed + mobile on a **physical device** (or sim).
# 2. Sign in once so Home shows listings (`listing-card-0`).
# 3. Start screen recording, then run:
#
#        maestro test e2e/mobile/00_demo_60s.yaml
#
# 4. Stop recording when Chats is visible. Target wall-clock ≤ 60s.
#
# ### Android (adb)
#   adb shell screenrecord /sdcard/reworth_demo_60s.mp4 --time-limit 60
#   adb pull /sdcard/reworth_demo_60s.mp4 ./reworth_demo_60s.mp4
#
# ### iOS (QuickTime / Xcode)
#   QuickTime → File → New Movie Recording → select iPhone → record while Maestro runs.
#
# ### Windows PowerShell helper
#   pwsh -File scripts/record-maestro-demo.ps1
#
# Store the file under `docs/demo/` or share with PO; path is not committed (videos are large).
#
# Real-device ≤60s screen recording remains the open PO checkbox until a file is archived.
