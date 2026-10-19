const base = process.env.API_BASE_URL || "http://127.0.0.1:3001/api/v1";
let pass = 0;
let fail = 0;
const rows = [];

async function req(method, path, body, token) {
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data, text };
}

function list(body) {
  if (!body) return [];
  if (Array.isArray(body)) return body;
  if (Array.isArray(body.items)) return body.items;
  if (Array.isArray(body.hits)) return body.hits;
  return [body];
}

async function check(name, fn) {
  try {
    const detail = await fn();
    pass += 1;
    rows.push(["PASS", name, detail]);
  } catch (e) {
    fail += 1;
    rows.push(["FAIL", name, e.message || String(e)]);
  }
}

(async () => {
  let listingId;
  let access;
  let debugCode;
  let draftId;

  await check("healthz", async () => {
    const r = await req("GET", "/healthz");
    if (r.status !== 200 || r.data.status !== "ok") throw new Error(JSON.stringify(r.data));
    return "ok";
  });

  await check("readyz", async () => {
    const r = await req("GET", "/readyz");
    if (r.status !== 200 || r.data.status !== "ok") throw new Error(JSON.stringify(r.data));
    return `db=${r.data.checks.database} redis=${r.data.checks.redis}`;
  });

  await check("regions", async () => {
    const r = await req("GET", "/regions");
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
    return `bytes=${r.text.length}`;
  });

  await check("categories", async () => {
    const r = await req("GET", "/categories");
    const n = list(r.data).length;
    if (n < 1) throw new Error("empty");
    return `count=${n}`;
  });

  await check("home", async () => {
    const r = await req("GET", "/home");
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
    return `bytes=${r.text.length}`;
  });

  await check("listings browse", async () => {
    const r = await req("GET", "/listings?limit=5");
    const items = list(r.data);
    if (!items.length) throw new Error("empty");
    listingId = items[0].id;
    return `n=${items.length} first='${items[0].title}' status=${items[0].status}`;
  });

  await check("listings status=LIVE (public = LIVE|RESERVED)", async () => {
    const r = await req("GET", "/listings?limit=20&status=LIVE");
    const items = list(r.data);
    const allowed = new Set(["LIVE", "RESERVED"]);
    const bad = items.filter((i) => i.status && !allowed.has(i.status));
    if (bad.length) {
      const uniq = [...new Set(bad.map((i) => i.status))];
      throw new Error(
        `unexpected status: ${uniq.join(",")} bad=${bad.length}/${items.length}`,
      );
    }
    const reserved = items.filter((i) => i.status === "RESERVED").length;
    const live = items.filter((i) => i.status === "LIVE").length;
    // browse treats status=LIVE as public catalog (LIVE + RESERVED) — see listings.service
    return `public catalog live=${live} reserved=${reserved} total=${items.length}`;
  });

  await check("listing PDP", async () => {
    const r = await req("GET", `/listings/${listingId}`);
    if (r.status !== 200 || !r.data?.id) throw new Error(`HTTP ${r.status}`);
    return `id=${r.data.id} title='${r.data.title}' status=${r.data.status} priceKobo=${r.data.priceKobo}`;
  });

  await check("search keyword", async () => {
    const r = await req("GET", "/search?q=chair&limit=5");
    if (r.status !== 200) throw new Error(`HTTP ${r.status} ${r.text.slice(0, 120)}`);
    return `hits=${list(r.data).length}`;
  });

  await check("search NL", async () => {
    const r = await req("POST", "/search/nl", { query: "sofa under 100k Lekki" });
    if (r.status !== 200 && r.status !== 201) {
      throw new Error(`HTTP ${r.status} ${r.text.slice(0, 120)}`);
    }
    const chips = (r.data.interpreted?.chips || []).join(" | ");
    return `chips=[${chips}] hits=${list(r.data).length}`;
  });

  await check("OTP dual-channel request", async () => {
    const r = await req("POST", "/auth/otp/request", { phone: "+2348010000001" });
    if (r.status !== 200 && r.status !== 201) throw new Error(`HTTP ${r.status} ${r.text}`);
    debugCode = r.data.debugCode;
    const ch = JSON.stringify(r.data.channels);
    if (!debugCode) throw new Error("no debugCode");
    if (!ch.includes("sms") || !ch.includes("whatsapp")) throw new Error(`channels=${ch}`);
    return `channels=${ch} debug=${debugCode}`;
  });

  await check("OTP verify", async () => {
    const r = await req("POST", "/auth/otp/verify", {
      phone: "+2348010000001",
      code: debugCode,
    });
    if (r.status !== 200 && r.status !== 201) throw new Error(`HTTP ${r.status} ${r.text}`);
    access = r.data.accessToken;
    if (!access) throw new Error(`no accessToken keys=${Object.keys(r.data)}`);
    return `userId=${r.data.user?.id || r.data.userId} tokenLen=${access.length}`;
  });

  await check("GET /me", async () => {
    const r = await req("GET", "/me", undefined, access);
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
    return `id=${r.data.id} phone=${r.data.phone}`;
  });

  await check("conversations", async () => {
    const r = await req("GET", "/conversations", undefined, access);
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
    return `n=${list(r.data).length}`;
  });

  await check("orders", async () => {
    const r = await req("GET", "/orders", undefined, access);
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
    return `n=${list(r.data).length}`;
  });

  await check("notifications", async () => {
    const r = await req("GET", "/notifications", undefined, access);
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
    return `n=${list(r.data).length}`;
  });

  await check("favourites", async () => {
    const r = await req("GET", "/me/favourites", undefined, access);
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
    return `bytes=${r.text.length}`;
  });

  await check("create DRAFT listing", async () => {
    const cats = list((await req("GET", "/categories")).data);
    const body = {
      title: `API self-test ${Date.now()}`,
      description: "Product API self-test draft",
      priceKobo: 2500000,
      condition: "GOOD",
      categoryId: cats[0].id,
      community: "LEKKI",
      sellingMode: "SELL",
    };
    const r = await req("POST", "/listings", body, access);
    if (r.status !== 200 && r.status !== 201) {
      throw new Error(`HTTP ${r.status} ${r.text.slice(0, 240)}`);
    }
    draftId = r.data.id;
    return `draft=${draftId} status=${r.data.status}`;
  });

  await check("price intelligence", async () => {
    const r = await req(
      "GET",
      `/listings/${draftId}/price-intelligence`,
      undefined,
      access,
    );
    if (r.status !== 200) throw new Error(`HTTP ${r.status} ${r.text.slice(0, 160)}`);
    return `recommendedNaira=${r.data.recommendedNaira} samples=${r.data.sampleCount}`;
  });

  await check("assistant session", async () => {
    const r = await req("POST", "/assistant/sessions", {}, access);
    if (r.status !== 200 && r.status !== 201) {
      throw new Error(`HTTP ${r.status} ${r.text.slice(0, 160)}`);
    }
    return `session=${r.data.id}`;
  });

  console.log("\n=== PRODUCT API SELF-TEST (live :3001) ===");
  for (const [s, n, d] of rows) {
    console.log(`${s.padEnd(4)} ${n.padEnd(30)} ${d}`);
  }
  console.log(`\nTOTAL pass=${pass} fail=${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
