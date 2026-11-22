// language: JavaScript, runtime: Cloudflare Workers, target: externulls / beeg.com search, info & stream worker

const CREATOR = "CREATOR BY 👨‍💻 SHADOW MOVIE X MAIN OWMER 👨‍💻";
const BASE_URL = "https://beeg.com";
const WS_SEARCH_URL = "https://search.externulls.com/";
const THUMBS_BASE = "https://thumbs.externulls.com";
const VP_BASE = "https://vp.externulls.com";
const VP_HANDLER_BASE = "https://vp-handler.externulls.com";
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

function build_thumb_url(id_or_path) {
  if (!id_or_path) return null;
  const s = String(id_or_path).trim();
  if (/^https?:\/\//i.test(s) || s.startsWith("//")) {
    return absolutize_url(s, THUMBS_BASE);
  }
  const clean = s.replace(/^\/+/, "");
  if (clean.includes("/")) {
    return `${THUMBS_BASE}/${clean}`;
  }
  return `${THUMBS_BASE}/0x0/${clean}.jpg`;
}

function extract_video_id(input = "") {
  const str = String(input).trim();
  if (/^[a-zA-Z0-9_-]{5,24}$/.test(str)) return str;
  const m =
    str.match(/(?:video|v|embed|watch)[\/=_-]([a-zA-Z0-9_-]{5,24})/i) ||
    str.match(/([a-zA-Z0-9]{7,16})(?:\/|\?|#|$)/);
  return m ? m[1] : null;
}

async function ws_search({ query, offset = 0, limit = 24, category_id = null, timeout_ms = 9000 }) {
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
    const collected = [];
    let total_count = null;
    let settled = false;

    const finish = (err = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(idle_timer);
      try {
        ws.close(1000, "done");
      } catch (_) {}
      if (err) reject(err);
      else resolve({ items: collected, total: total_count ?? collected.length });
    };

    const reset_idle = () => {
      clearTimeout(idle_timer);
      idle_timer = setTimeout(() => finish(), 900);
    };

    const timer = setTimeout(() => finish(), timeout_ms);
    let idle_timer = setTimeout(() => finish(), 2500);

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify(payload));
    });

    // In Cloudflare Workers client sockets, open may already be active
    try {
      ws.send(JSON.stringify(payload));
    } catch (_) {}

    ws.addEventListener("message", (event) => {
      reset_idle();
      let data;
      try {
        data = typeof event.data === "string" ? JSON.parse(event.data) : null;
      } catch (_) {
        return;
      }
      if (!data) return;

      if (typeof data.total === "number") total_count = data.total;
      if (typeof data.count === "number") total_count = data.count;
      if (data.payload && typeof data.payload.total === "number") {
        total_count = data.payload.total;
      }

      const raw_list =
        data.items ||
        data.results ||
        data.videos ||
        data.data?.items ||
        data.data?.results ||
        data.payload?.items ||
        data.payload?.results ||
        (Array.isArray(data.payload) ? data.payload : null) ||
        [];

      if (Array.isArray(raw_list)) {
        for (const entry of raw_list) {
          if (!entry || typeof entry !== "object") continue;
          const id = String(entry.id ?? entry.video_id ?? entry.uid ?? entry.slug ?? "");
          const title = String(entry.title ?? entry.name ?? entry.alt ?? "").trim();
          const duration = entry.duration ?? entry.length ?? null;
          const thumb_raw = entry.thumb ?? entry.thumbnail ?? entry.poster ?? entry.image ?? id;
          const image = build_thumb_url(thumb_raw);
          const video_url = id ? `${BASE_URL}/video/${id}` : absolutize_url(entry.url, BASE_URL);

          if (id || title) {
            collected.push({
              id,
              title: title || id,
              duration,
              url: video_url,
              image,
            });
          }
        }
      }
    });

    ws.addEventListener("error", (e) => {
      finish(new Error(e?.message || "WebSocket error"));
    });
  });
}

async function fetch_json_safe(url) {
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Origin: BASE_URL,
        Referer: `${BASE_URL}/`,
        Accept: "application/json, text/plain, */*",
      },
      redirect: "follow",
    });
    if (!r.ok) return null;
    const text = await r.text();
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function collect_stream_urls(node, out = [], seen = new Set(), depth = 0) {
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
    for (const v of node) collect_stream_urls(v, out, seen, depth + 1);
    return out;
  }
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === "string" && /^https?:\/\//i.test(v.trim())) {
        const u = v.trim();
        if (
          /(\.m3u8|\.mp4|\.webm|playlist|manifest|stream|video)/i.test(u) &&
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
      collect_stream_urls(v, out, seen, depth + 1);
    }
  }
  return out;
}

async function resolve_video_data(input_url_or_id) {
  const id = extract_video_id(input_url_or_id);
  const page_url = /^https?:\/\//i.test(input_url_or_id)
    ? input_url_or_id
    : id
      ? `${BASE_URL}/video/${id}`
      : BASE_URL;

  const candidate_apis = id
    ? [
        `${VP_HANDLER_BASE}/video/${encodeURIComponent(id)}`,
        `${VP_HANDLER_BASE}/v1/video/${encodeURIComponent(id)}`,
        `${VP_BASE}/${encodeURIComponent(id)}`,
        `${VIDEO_BASE}/api/v1/video/${encodeURIComponent(id)}`,
      ]
    : [];

  let meta_json = null;
  for (const api_u of candidate_apis) {
    const j = await fetch_json_safe(api_u);
    if (j && typeof j === "object") {
      meta_json = j;
      break;
    }
  }

  let html = "";
  try {
    const pr = await fetch(page_url, {
      headers: {
        "User-Agent": UA,
        Referer: `${BASE_URL}/`,
        Accept: "text/html,application/xhtml+xml,*/*",
      },
      redirect: "follow",
    });
    html = await pr.text();
  } catch (_) {}

  const og_title = (html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i) || [])[1] || "";
  const og_desc =
    (
      html.match(
        /<meta[^>]+(?:name=["']description["']|property=["']og:description["'])[^>]*content=["']([^"']+)["']/i
      ) || []
    )[1] || "";
  const og_img = (html.match(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i) || [])[1] || "";

  const title =
    meta_json?.title ||
    meta_json?.name ||
    meta_json?.data?.title ||
    og_title ||
    (id ? `Video ${id}` : "Unknown");

  const description =
    meta_json?.description ||
    meta_json?.data?.description ||
    og_desc ||
    null;

  const duration =
    meta_json?.duration ||
    meta_json?.length ||
    meta_json?.data?.duration ||
    null;

  const image =
    absolutize_url(
      meta_json?.image ||
        meta_json?.thumbnail ||
        meta_json?.poster ||
        meta_json?.data?.image ||
        meta_json?.data?.thumbnail ||
        og_img,
      page_url
    ) || (id ? build_thumb_url(id) : null);

  const tags = Array.isArray(meta_json?.tags)
    ? meta_json.tags.map((t) => (typeof t === "string" ? t : t?.name || t?.title)).filter(Boolean)
    : [];

  const streams = [
    ...collect_stream_urls(meta_json),
    ...collect_stream_urls(html),
  ];

  const dedup_streams = [];
  const seen_u = new Set();
  for (const s of streams) {
    if (!seen_u.has(s.url)) {
      seen_u.add(s.url);
      dedup_streams.push(s);
    }
  }

  return {
    id,
    url: page_url,
    title,
    description,
    duration,
    image,
    tags,
    streams: dedup_streams,
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
          "/info?url=<video_url_or_id>&apikey=shadow_movie-x_-9999999999",
          "/information?url=<video_url_or_id>&apikey=shadow_movie-x_-9999999999",
          "/dl?url=<video_url_or_id>&apikey=shadow_movie-x_-9999999999",
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

        const result = await ws_search({ query: q, offset, limit, category_id });

        return json_res({
          ok: true,
          query: q,
          offset,
          limit,
          total: result.total,
          count: result.items.length,
          items: result.items,
        });
      }

      if (pathname === "/info" || pathname === "/information") {
        const target = (url.searchParams.get("url") || url.searchParams.get("id") || "").trim();
        if (!target) {
          return json_res({ ok: false, error: "Missing ?url= or ?id= parameter" }, 400);
        }

        const info = await resolve_video_data(target);
        return json_res({
          ok: true,
          ...info,
        });
      }

      if (pathname === "/dl") {
        const target = (url.searchParams.get("url") || url.searchParams.get("id") || "").trim();
        if (!target) {
          return json_res({ ok: false, error: "Missing ?url= or ?id= parameter" }, 400);
        }

        const info = await resolve_video_data(target);
        const mp4 = info.streams.find((s) => s.format === "mp4");
        const best = mp4 || info.streams[0] || null;

        return json_res({
          ok: true,
          id: info.id,
          title: info.title,
          image: info.image,
          downloadUrl: best ? best.url : null,
          format: best ? best.format : null,
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
