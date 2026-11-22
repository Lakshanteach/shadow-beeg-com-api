// language: JavaScript, runtime: Cloudflare Workers, target: beeg / externulls API worker

const CREATOR = "CREATOR BY 👨‍💻 SHADOW MOVIE X MAIN OWMER 👨‍💻";
const BASE_URL = "https://beeg.com";
const WS_SEARCH_URL = "https://search.externulls.com/";
const THUMBS_BASE = "https://thumbs.externulls.com";
const PREVIEWS_BASE = "https://previews.externulls.com";
const VP_BASE = "https://vp.externulls.com";
const VP_HANDLER_BASE = "https://vp-handler.externulls.com";
const STORE_BASE = "https://store.externulls.com";
const VIDEO_BASE = "https://video.beeg.com";

const VALID_API_KEYS = new Set([
  "shadow_movie-x_-9999999999",
]);

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function json_res(data, status = 200) {
  return new Response(
    JSON.stringify(
      {
        creator: CREATOR,
        ...data,
      },
      null,
      2
    ),
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key, apikey",
      },
    }
  );
}

function extract_api_key(request, url) {
  const header_key =
    request.headers.get("x-api-key") ||
    request.headers.get("apikey") ||
    "";

  const auth_header = request.headers.get("authorization") || "";
  const bearer_key = auth_header.toLowerCase().startsWith("bearer ")
    ? auth_header.slice(7).trim()
    : "";

  const query_key =
    url.searchParams.get("apikey") ||
    url.searchParams.get("api_key") ||
    url.searchParams.get("key") ||
    "";

  return (header_key || bearer_key || query_key || "").trim();
}

function require_api_key(request, url) {
  const provided = extract_api_key(request, url);
  if (!provided || !VALID_API_KEYS.has(provided)) {
    return json_res(
      {
        ok: false,
        error: "Invalid or missing API key",
      },
      401
    );
  }
  return null;
}

function absolutize_url(raw, base = BASE_URL) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("//")) return `https:${s}`;
  try {
    return new URL(s, base).toString();
  } catch (_) {
    return null;
  }
}

function extract_entry_image(entry) {
  if (!entry || typeof entry !== "object") return null;

  if (Array.isArray(entry.thumbs) && entry.thumbs.length > 0) {
    const first_thumb = entry.thumbs[0];
    const crops = Array.isArray(first_thumb?.crops) ? first_thumb.crops : [];
    const avatar_crop = crops.find((c) => c?.pt_avatar) || crops[0];
    const photo_id = avatar_crop?.pt_photo ?? first_thumb?.id;
    if (photo_id) {
      return `${THUMBS_BASE}/0x0/${photo_id}.jpg`;
    }
  }

  const direct =
    entry.image ||
    entry.thumbnail ||
    entry.poster ||
    entry.thumb ||
    entry.profile?.image ||
    entry.profile?.thumb ||
    null;

  return direct ? absolutize_url(direct, THUMBS_BASE) : null;
}

function parse_ws_entries(raw_data, out = [], seen = new Set(), depth = 0) {
  if (!raw_data || depth > 6) return out;

  if (Array.isArray(raw_data)) {
    for (const item of raw_data) {
      parse_ws_entries(item, out, seen, depth + 1);
    }
    return out;
  }

  if (typeof raw_data === "object") {
    const has_tag_fields =
      raw_data.tg_name ||
      raw_data.tg_slug ||
      Array.isArray(raw_data.thumbs) ||
      typeof raw_data.tg_videos_count === "number";

    if (has_tag_fields) {
      const id = String(raw_data.id ?? raw_data.tg_slug ?? "");
      const slug = String(raw_data.tg_slug ?? raw_data.id ?? "");
      const title = String(raw_data.tg_name ?? raw_data.title ?? raw_data.name ?? slug).trim();
      const image = extract_entry_image(raw_data);
      const url = slug ? `${BASE_URL}/${encodeURIComponent(slug)}` : null;
      const key = `${id}|${slug}|${title}`;

      if (!seen.has(key) && (title || slug)) {
        seen.add(key);
        out.push({
          id,
          slug,
          title,
          type: raw_data.Tg_type || raw_data.type || null,
          videosCount: raw_data.tg_videos_count ?? null,
          followersCount: raw_data.tg_follower_count ?? null,
          url,
          image,
        });
      }
    }

    for (const k of Object.keys(raw_data)) {
      if (k !== "tg_similar") {
        parse_ws_entries(raw_data[k], out, seen, depth + 1);
      }
    }
  }

  return out;
}

async function ws_search({ query, offset = 0, limit = 24, category_id = null, timeout_ms = 8000 }) {
  const res = await fetch(WS_SEARCH_URL, {
    headers: {
      Upgrade: "websocket",
      Connection: "Upgrade",
      "User-Agent": UA,
      Origin: BASE_URL,
      Referer: `${BASE_URL}/`,
      "Sec-WebSocket-Version": "13",
    },
  });

  const ws = res.webSocket;
  if (!ws) {
    throw new Error(`WebSocket upgrade failed (status ${res.status})`);
  }

  ws.accept();

  const msg_type = category_id ? "search_category" : "search";
  const payload = {
    type: msg_type,
    ignore_stats: true,
    payload: {
      Search_string: query,
      offset,
      limit,
      category_id,
    },
  };

  return await new Promise((resolve, reject) => {
    const items = [];
    const seen = new Set();
    let settled = false;

    const finish = (err = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(hard_timer);
      clearTimeout(idle_timer);
      try {
        ws.close(1000, "done");
      } catch (_) {}
      if (err) reject(err);
      else resolve(items.slice(0, limit));
    };

    const reset_idle = () => {
      clearTimeout(idle_timer);
      idle_timer = setTimeout(() => finish(), 700);
    };

    const hard_timer = setTimeout(() => finish(), timeout_ms);
    let idle_timer = setTimeout(() => finish(), 2500);

    const send_query = () => {
      try {
        ws.send(JSON.stringify(payload));
      } catch (_) {}
    };

    ws.addEventListener("open", send_query);
    send_query();

    ws.addEventListener("message", (event) => {
      reset_idle();
      if (typeof event.data !== "string") return;
      let parsed;
      try {
        parsed = JSON.parse(event.data);
      } catch (_) {
        return;
      }
      parse_ws_entries(parsed, items, seen, 0);
    });

    ws.addEventListener("error", (e) => {
      finish(new Error(e?.message || "WebSocket error"));
    });
  });
}

async function fetch_json_safe(target_url) {
  try {
    const r = await fetch(target_url, {
      headers: {
        "User-Agent": UA,
        Origin: BASE_URL,
        Referer: `${BASE_URL}/`,
        Accept: "application/json, text/plain, */*",
      },
      redirect: "follow",
    });
    if (!r.ok) return null;
    const txt = await r.text();
    const trimmed = txt.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      return JSON.parse(trimmed);
    }
    return null;
  } catch (_) {
    return null;
  }
}

function collect_streams_recursive(node, out = [], seen = new Set(), depth = 0) {
  if (!node || depth > 10) return out;
  if (typeof node === "string") {
    const s = node.trim();
    if (/^https?:\/\/[^\s"'<>]+(?:\.m3u8|\.mp4|\.webm)(?:\?[^\s"'<>]*)?$/i.test(s) && !seen.has(s)) {
      seen.add(s);
      const q_m = s.match(/(?:2160|1440|1080|720|480|360|240)p?/i);
      out.push({
        quality: q_m ? q_m[0] : "auto",
        format: /\.m3u8(?:\?|$)/i.test(s) ? "hls" : "mp4",
        url: s,
      });
    }
    return out;
  }
  if (Array.isArray(node)) {
    for (const item of node) collect_streams_recursive(item, out, seen, depth + 1);
    return out;
  }
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === "string" && /^https?:\/\//i.test(v.trim())) {
        const u = v.trim();
        if (
          /(\.m3u8|\.mp4|\.webm|playlist|manifest|stream)/i.test(u) &&
          !/(\.jpg|\.jpeg|\.png|\.webp|\.gif|\.svg|\.js|\.css)/i.test(u) &&
          !seen.has(u)
        ) {
          seen.add(u);
          out.push({
            quality: String(k),
            format: /\.m3u8(?:\?|$)/i.test(u) ? "hls" : "mp4",
            url: u,
          });
        }
      }
      collect_streams_recursive(v, out, seen, depth + 1);
    }
  }
  return out;
}

async function resolve_info(target_input, explicit_image = null) {
  const raw = String(target_input).trim();
  const is_url = /^https?:\/\//i.test(raw);
  const page_url = is_url ? raw : `${BASE_URL}/${encodeURIComponent(raw)}`;
  const slug_or_id = is_url
    ? raw.replace(/^https?:\/\/[^/]+\/?/i, "").split(/[?#]/)[0].replace(/\/+$/, "")
    : raw.replace(/^\/+|\/+$/g, "");

  let html = "";
  try {
    const r = await fetch(page_url, {
      headers: {
        "User-Agent": UA,
        Referer: `${BASE_URL}/`,
        Accept: "text/html,application/xhtml+xml,*/*",
      },
      redirect: "follow",
    });
    html = await r.text();
  } catch (_) {}

  const og_title =
    (html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i) || [])[1] || "";
  const og_desc =
    (
      html.match(
        /<meta[^>]+(?:name=["']description["']|property=["']og:description["'])[^>]*content=["']([^"']+)["']/i
      ) || []
    )[1] || "";
  const og_img =
    (html.match(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i) || [])[1] || "";

  let api_json = null;
  if (slug_or_id) {
    const candidates = [
      `${STORE_BASE}/tag/${encodeURIComponent(slug_or_id)}/videos`,
      `${VIDEO_BASE}/${encodeURIComponent(slug_or_id)}`,
      `${VP_HANDLER_BASE}/video?id=${encodeURIComponent(slug_or_id)}`,
      `${VP_BASE}/${encodeURIComponent(slug_or_id)}`,
    ];

    for (const candidate of candidates) {
      const parsed = await fetch_json_safe(candidate);
      if (parsed && typeof parsed === "object") {
        api_json = parsed;
        break;
      }
    }
  }

  let matched_item = null;
  if (!explicit_image && slug_or_id) {
    try {
      const found = await ws_search({ query: slug_or_id, offset: 0, limit: 10, timeout_ms: 4500 });
      matched_item =
        found.find(
          (it) =>
            String(it.slug || "").toLowerCase() === slug_or_id.toLowerCase() ||
            String(it.id || "").toLowerCase() === slug_or_id.toLowerCase()
        ) || found[0] || null;
    } catch (_) {}
  }

  const title =
    api_json?.title ||
    api_json?.tg_name ||
    matched_item?.title ||
    og_title ||
    slug_or_id ||
    "Unknown";

  const description =
    api_json?.description ||
    api_json?.tg_caption ||
    og_desc ||
    null;

  const image =
    absolutize_url(explicit_image, THUMBS_BASE) ||
    extract_entry_image(api_json) ||
    matched_item?.image ||
    absolutize_url(og_img, page_url) ||
    null;

  const streams = [
    ...collect_streams_recursive(api_json),
    ...collect_streams_recursive(html),
  ];

  const preview_url =
    slug_or_id && /^\d+$/.test(slug_or_id)
      ? `${VP_BASE}/${slug_or_id}/0-0.mp4`
      : null;

  return {
    id: slug_or_id || null,
    url: page_url,
    title,
    description,
    image,
    videosCount: matched_item?.videosCount ?? null,
    previewUrl: preview_url,
    previewsHost: PREVIEWS_BASE,
    streams,
  };
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return json_res({ ok: true }, 200);
    }

    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";

    if (pathname === "/health") {
      return json_res({
        ok: true,
        status: "ready",
        endpoints: [
          "/search?q=<query>&offset=0&limit=24&apikey=shadow_movie-x_-9999999999",
          "/info?url=<url_or_slug>&image=<optional_img_url>&apikey=shadow_movie-x_-9999999999",
          "/information?url=<url_or_slug>&image=<optional_img_url>&apikey=shadow_movie-x_-9999999999",
          "/dl?url=<url_or_slug>&image=<optional_img_url>&apikey=shadow_movie-x_-9999999999",
        ],
      });
    }

    const auth_err = require_api_key(request, url);
    if (auth_err) return auth_err;

    try {
      if (pathname === "/search") {
        const q = (url.searchParams.get("q") || "").trim();
        if (!q) {
          return json_res({ ok: false, error: "Missing ?q= parameter" }, 400);
        }
        const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10) || 0);
        const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "24", 10) || 24));
        const category_id = url.searchParams.get("category_id") || null;

        const items = await ws_search({ query: q, offset, limit, category_id });

        return json_res({
          ok: true,
          query: q,
          offset,
          limit,
          total: items.length,
          items,
        });
      }

      if (pathname === "/info" || pathname === "/information") {
        const target = (url.searchParams.get("url") || url.searchParams.get("id") || "").trim();
        const explicit_image = (url.searchParams.get("image") || "").trim() || null;
        if (!target) {
          return json_res({ ok: false, error: "Missing ?url= or ?id= parameter" }, 400);
        }
        const info = await resolve_info(target, explicit_image);
        return json_res({
          ok: true,
          ...info,
        });
      }

      if (pathname === "/dl") {
        const target = (url.searchParams.get("url") || url.searchParams.get("id") || "").trim();
        const explicit_image = (url.searchParams.get("image") || "").trim() || null;
        if (!target) {
          return json_res({ ok: false, error: "Missing ?url= or ?id= parameter" }, 400);
        }
        const info = await resolve_info(target, explicit_image);
        const mp4 = info.streams.find((s) => s.format === "mp4");
        const best = mp4 || info.streams[0] || null;
        const fallback_url = best ? best.url : info.previewUrl || info.url;

        return json_res({
          ok: true,
          id: info.id,
          title: info.title,
          image: info.image,
          downloadUrl: fallback_url,
          format: best ? best.format : info.previewUrl ? "preview-mp4" : "page",
          streams: info.streams,
        });
      }

      return json_res({ ok: false, error: "Endpoint not found" }, 404);
    } catch (err) {
      return json_res(
        {
          ok: false,
          error: err?.message || "Worker error",
        },
        500
      );
    }
  },
};
