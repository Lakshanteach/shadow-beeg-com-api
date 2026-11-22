

const CREATOR = "CREATOR BY 👨‍💻 SHADOW MOVIE X MAIN OWMER 👨‍💻";
const BASE_URL = "https://beeg.com";
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

function decode_html(str = "") {
  return String(str)
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\\u002F/gi, "/")
    .replace(/\\\//g, "/")
    .trim();
}

function strip_tags(html = "") {
  return decode_html(String(html).replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function absolutize_url(href = "", base = BASE_URL) {
  const clean = decode_html(href);
  if (!clean) return "";
  if (/^https?:\/\//i.test(clean)) return clean;
  if (clean.startsWith("//")) return `https:${clean}`;
  try {
    return new URL(clean, base).toString();
  } catch (_) {
    return "";
  }
}

function extract_img_from_html(chunk = "", base = BASE_URL) {
  const m =
    chunk.match(
      /<img[^>]+(?:data-src|data-lazy-src|data-original|data-poster|src)=["']([^"']+)["']/i
    ) ||
    chunk.match(/(?:data-src|data-lazy-src|data-original|poster)=["']([^"']+)["']/i);
  if (!m || !m[1]) return null;
  const abs = absolutize_url(m[1], base);
  if (!abs || /^data:image/i.test(abs)) return null;
  return abs;
}

async function fetch_page(target_url, referer = BASE_URL, timeout_ms = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout_ms);
  try {
    const res = await fetch(target_url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": UA,
        Referer: referer,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    const body = await res.text();
    return { ok: res.ok, status: res.status, url: res.url || target_url, body };
  } finally {
    clearTimeout(timer);
  }
}

function extract_json_blobs(html = "") {
  const blobs = [];
  for (const m of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)) {
    const raw = m[1].trim();
    if (!raw || raw.length > 2000000) continue;
    if (raw.startsWith("{") || raw.startsWith("[")) {
      try {
        blobs.push(JSON.parse(raw));
      } catch (_) {}
    }
    for (const assign of raw.matchAll(
      /(?:window\.[A-Za-z0-9_]+|__NEXT_DATA__|__NUXT__|initialState)\s*=\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*;/g
    )) {
      try {
        blobs.push(JSON.parse(assign[1]));
      } catch (_) {}
    }
  }
  return blobs;
}

function collect_media_entries(node, out = [], depth = 0) {
  if (!node || depth > 10 || out.length >= 80) return out;
  if (Array.isArray(node)) {
    for (const item of node) collect_media_entries(item, out, depth + 1);
    return out;
  }
  if (typeof node === "object") {
    const title = node.title || node.name || node.alt || "";
    const slug = node.slug || node.id || node.videoId || node.uid || "";
    const raw_img =
      node.image ||
      node.thumb ||
      node.thumbnail ||
      node.poster ||
      node.preview ||
      node.cover ||
      "";
    const duration = node.duration || node.length || null;
    const raw_url = node.url || node.link || node.href || (slug ? `${BASE_URL}/${slug}/` : "");

    if (title && (raw_url || slug)) {
      const abs_url = absolutize_url(raw_url || `${BASE_URL}/${slug}/`, BASE_URL);
      if (abs_url && abs_url.startsWith(BASE_URL)) {
        const image = raw_img ? absolutize_url(String(raw_img), BASE_URL) : null;
        out.push({
          id: String(slug || ""),
          title: decode_html(String(title)),
          duration,
          url: abs_url,
          image,
        });
      }
    }

    for (const k of Object.keys(node)) {
      collect_media_entries(node[k], out, depth + 1);
    }
  }
  return out;
}

function parse_search_html(html = "", query = "") {
  const items = [];
  const seen = new Set();
  const q_words = String(query || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  for (const blob of extract_json_blobs(html)) {
    const found = collect_media_entries(blob, []);
    for (const it of found) {
      if (seen.has(it.url)) continue;
      seen.add(it.url);
      items.push(it);
    }
  }

  const link_matches = [...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  for (const lm of link_matches) {
    const href = absolutize_url(lm[1], BASE_URL);
    if (!href || !href.startsWith(BASE_URL) || seen.has(href)) continue;
    if (/\/(?:search|tag|tags|category|categories|page|login|register|dmca|privacy|terms)\b/i.test(href)) {
      continue;
    }

    const title_attr = decode_html((lm[0].match(/title=["']([^"']+)["']/i) || [])[1] || "");
    const heading = strip_tags((lm[2].match(/<h[1-5][^>]*>([\s\S]*?)<\/h[1-5]>/i) || [])[1] || "");
    const inner_text = strip_tags(lm[2]);
    const title = title_attr || heading || inner_text;
    if (!title || title.length < 2) continue;

    const image = extract_img_from_html(lm[2], BASE_URL);
    const dur_m = inner_text.match(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/);

    seen.add(href);
    items.push({
      id: href.replace(/\/+$/, "").split("/").pop() || "",
      title,
      duration: dur_m ? dur_m[1] : null,
      url: href,
      image,
    });
  }

  if (q_words.length > 0 && items.length > 0) {
    const matched = items.filter((it) => {
      const hay = `${it.title} ${it.url}`.toLowerCase();
      return q_words.every((w) => hay.includes(w));
    });
    if (matched.length > 0) return matched;
  }

  return items;
}

function extract_main_image(html = "", page_url = BASE_URL) {
  const og_img =
    (html.match(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i) || [])[1] || "";
  if (og_img) {
    const abs = absolutize_url(og_img, page_url);
    if (abs) return abs;
  }

  const tw_img =
    (html.match(/<meta[^>]+name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i) || [])[1] || "";
  if (tw_img) {
    const abs = absolutize_url(tw_img, page_url);
    if (abs) return abs;
  }

  for (const blob of extract_json_blobs(html)) {
    const walk_img = (n, depth = 0) => {
      if (!n || depth > 8) return "";
      if (typeof n === "object" && !Array.isArray(n)) {
        const cand = n.image || n.thumbnailUrl || n.poster || n.thumb || n.thumbnail || "";
        if (typeof cand === "string" && /^https?:\/\//i.test(cand)) return cand;
        if (Array.isArray(cand) && typeof cand[0] === "string") return cand[0];
        for (const k of Object.keys(n)) {
          const r = walk_img(n[k], depth + 1);
          if (r) return r;
        }
      } else if (Array.isArray(n)) {
        for (const x of n) {
          const r = walk_img(x, depth + 1);
          if (r) return r;
        }
      }
      return "";
    };
    const found = walk_img(blob, 0);
    if (found) return absolutize_url(found, page_url);
  }

  const poster_m = html.match(/poster=["']([^"']+)["']/i);
  if (poster_m && poster_m[1]) {
    const abs = absolutize_url(poster_m[1], page_url);
    if (abs) return abs;
  }

  return extract_img_from_html(html, page_url);
}

function parse_video_info(html = "", page_url = BASE_URL) {
  const h1 = strip_tags((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || "");
  const og_title =
    (html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i) || [])[1] || "";
  const title = decode_html(h1 || og_title || "Video");

  const og_desc =
    (
      html.match(
        /<meta[^>]+(?:name=["']description["']|property=["']og:description["'])[^>]*content=["']([^"']+)["']/i
      ) || []
    )[1] || "";

  const image = extract_main_image(html, page_url);

  const duration_m =
    html.match(/itemprop=["']duration["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/"duration"\s*:\s*"?([^",}]+)"?/i) ||
    html.match(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/);

  const tags = [];
  const seen_tags = new Set();
  for (const tm of html.matchAll(/<a[^>]+href=["'][^"']*\/tag\/[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const name = strip_tags(tm[1]);
    if (name && !seen_tags.has(name.toLowerCase())) {
      seen_tags.add(name.toLowerCase());
      tags.push(name);
    }
  }

  const streams = extract_stream_candidates(html, page_url);

  return {
    title,
    description: decode_html(og_desc) || null,
    duration: duration_m ? duration_m[1] : null,
    image,
    tags: tags.slice(0, 20),
    streams,
  };
}

function extract_stream_candidates(html = "", page_url = BASE_URL) {
  const found = [];
  const seen = new Set();

  const add_stream = (raw_u, quality = "auto", format = "stream") => {
    const abs = absolutize_url(raw_u, page_url);
    if (!abs || !/^https?:\/\//i.test(abs) || seen.has(abs)) return;
    seen.add(abs);
    found.push({ quality, format, url: abs });
  };

  for (const m of html.matchAll(
    /<source[^>]+src=["']([^"']+)["'][^>]*(?:label=["']([^"']+)["']|res=["']([^"']+)["'])?/gi
  )) {
    const q = m[2] || m[3] || "source";
    const fmt = /\.m3u8(?:\?|$)/i.test(m[1]) ? "hls" : "mp4";
    add_stream(m[1], q, fmt);
  }

  for (const u_m of html.matchAll(
    /https?:\/\/[^\s"'<>()\\]+(?:\.m3u8|\.mp4|\.webm)(?:\?[^\s"'<>()\\]*)?/gi
  )) {
    const u = decode_html(u_m[0]);
    const fmt = /\.m3u8(?:\?|$)/i.test(u) ? "hls" : "mp4";
    const q_m = u.match(/(?:2160|1440|1080|720|480|360|240)p?/i);
    add_stream(u, q_m ? q_m[0] : "auto", fmt);
  }

  for (const blob of extract_json_blobs(html)) {
    const walk = (n, depth = 0) => {
      if (!n || depth > 10) return;
      if (typeof n === "string") {
        if (/^https?:\/\/[^\s"'<>\\]+(?:\.m3u8|\.mp4|\.webm)(?:\?[^\s"'<>\\]*)?$/i.test(n)) {
          add_stream(n, "json", n.includes(".m3u8") ? "hls" : "mp4");
        }
        return;
      }
      if (Array.isArray(n)) {
        for (const x of n) walk(x, depth + 1);
        return;
      }
      if (typeof n === "object") {
        for (const k of Object.keys(n)) walk(n[k], depth + 1);
      }
    };
    walk(blob, 0);
  }

  return found;
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return json_res({ ok: true }, 200);
    }

    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";

    if (pathname !== "/" && pathname !== "/health") {
      const auth_err = require_api_key(request, url);
      if (auth_err) return auth_err;
    }

    try {
      if (pathname === "/" || pathname === "/health") {
        return json_res({
          ok: true,
          source: BASE_URL,
          endpoints: [
            "/search?q=<query>&page=1&apikey=shadow_movie-x_-9999999999",
            "/info?url=<video_url>&apikey=shadow_movie-x_-9999999999",
            "/information?url=<video_url>&apikey=shadow_movie-x_-9999999999",
            "/dl?url=<video_url>&apikey=shadow_movie-x_-9999999999",
          ],
        });
      }

      if (pathname === "/search") {
        const q = (url.searchParams.get("q") || "").trim();
        const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
        if (!q) {
          return json_res({ ok: false, error: "Missing ?q= parameter" }, 400);
        }

        const candidates =
          page > 1
            ? [
                `${BASE_URL}/search?q=${encodeURIComponent(q)}&page=${page}`,
                `${BASE_URL}/?s=${encodeURIComponent(q)}&page=${page}`,
                `${BASE_URL}/page/${page}/?s=${encodeURIComponent(q)}`,
              ]
            : [
                `${BASE_URL}/search?q=${encodeURIComponent(q)}`,
                `${BASE_URL}/?s=${encodeURIComponent(q)}`,
              ];

        let items = [];
        let matched_url = candidates[0];
        for (const c_url of candidates) {
          const res = await fetch_page(c_url, BASE_URL);
          const parsed = parse_search_html(res.body, q);
          if (parsed.length > 0) {
            items = parsed;
            matched_url = res.url;
            break;
          }
        }

        return json_res({
          ok: true,
          query: q,
          page,
          sourceUrl: matched_url,
          total: items.length,
          items,
        });
      }

      if (pathname === "/info" || pathname === "/information") {
        const target = (url.searchParams.get("url") || "").trim();
        if (!target || !/^https?:\/\//i.test(target)) {
          return json_res({ ok: false, error: "Missing or invalid ?url= parameter" }, 400);
        }

        const res = await fetch_page(target, BASE_URL);
        const info = parse_video_info(res.body, res.url);

        return json_res({
          ok: true,
          url: res.url,
          ...info,
        });
      }

      if (pathname === "/dl") {
        const target = (url.searchParams.get("url") || "").trim();
        if (!target || !/^https?:\/\//i.test(target)) {
          return json_res({ ok: false, error: "Missing or invalid ?url= parameter" }, 400);
        }

        const res = await fetch_page(target, BASE_URL);
        const streams = extract_stream_candidates(res.body, res.url);
        const mp4 = streams.find((s) => s.format === "mp4");
        const best = mp4 || streams[0] || null;

        return json_res({
          ok: true,
          sourceUrl: res.url,
          downloadUrl: best ? best.url : null,
          format: best ? best.format : null,
          streams,
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
