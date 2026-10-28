/**
 * Local mid-load gate — laptop-friendly step before staging 500 VU.
 * Targets: fail rate <1%, p95 < 500ms @ 50 VUs / 60s.
 */
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  scenarios: {
    mid_50: {
      executor: "constant-vus",
      vus: Number(__ENV.VUS || 50),
      duration: __ENV.DURATION || "60s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"],
  },
};

const BASE = (__ENV.API_BASE_URL || "http://127.0.0.1:3011/api/v1").replace(
  /\/$/,
  "",
);

export default function () {
  const roll = Math.random();
  const path =
    roll < 0.4
      ? "/healthz"
      : roll < 0.7
        ? "/categories"
        : roll < 0.9
          ? "/readyz"
          : "/listings?limit=5";
  const res = http.get(`${BASE}${path}`);
  check(res, { "2xx": (r) => r.status >= 200 && r.status < 300 });
  sleep(0.5);
}
