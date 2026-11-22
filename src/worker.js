// language: JavaScript, runtime: Cloudflare Workers, target: extract API endpoint patterns from main bundle

const CREATOR = "CREATOR BY 👨‍💻 SHADOW MOVIE X MAIN OWMER 👨‍💻";
const BASE_URL = "https://beeg.com";
const VALID_API_KEYS = new Set([
  "shadow_movie-x_-9999999999",
]);
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function json_res(data, status = 200) {
  return new Response(
    JSON.stringify({ creator: CREATOR, ...data }, null, 2),
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
}

function check_key(request, url) {
  const k =
    request.headers.get("x-api-key") ||
    request.headers.get("apikey") ||
    (request.headers.get("authorization") || "").replace(/^bearer\s+/i, "") ||
    url.searchParams.get("apikey") ||
    url.searchParams.get("api_key") ||
    url.searchParams.get("key") ||
    "";
  return VALID_API_KEYS.has(k.trim());
}

function collect_snippets(js_code, pattern, limit = 25, radius = 90) {
  const out = [];
  const flags = pattern.includes("g") ? pattern : `${pattern}g`;
  const rx = new RegExp(pattern, flags.replace(/[^gimsuy]/g, ""));
  for (const m of js_code.matchAll(rx)) {
    const idx = m.index ?? 0;
    const start = Math.max(0, idx - radius);
    const end = Math.min(js_code.length, idx + m[0].length + radius);
    out.push(js_code.slice(start, end));
    if (out.length >= limit) break;
  }
  return out;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";

    if (pathname === "/health") {
      return json_res({ ok: true, status: "ready" });
    }

    if (!check_key(request, url)) {
      return json_res({ ok: false, error: "Invalid or missing API key" }, 401);
    }

    if (pathname === "/api-hunt") {
      const shell_r = await fetch(`${BASE_URL}/`, {
        headers: { "User-Agent": UA, Referer: BASE_URL },
        redirect: "follow",
      });
      const shell_html = await shell_r.text();
      const bundle_m = shell_html.match(/src=["']([^"']*\/dist\/main\.[^"']+\.js)["']/i);
      const bundle_path = bundle_m ? bundle_m[1] : "/dist/main.94e48973.js";
      const bundle_url = new URL(bundle_path, BASE_URL).toString();

      const js_r = await fetch(bundle_url, {
        headers: { "User-Agent": UA, Referer: `${BASE_URL}/` },
        redirect: "follow",
      });
      const js_code = await js_r.text();

      const endpoint_tokens = [
        ...new Set(
          [
            ...js_code.matchAll(
              /["'`]((?:\/[a-zA-Z0-9_.\-]+){1,6}(?:\?[^\s"'`<>]*)?)["'`]/g
            ),
          ]
            .map((m) => m[1])
            .filter(
              (p) =>
                p.length > 2 &&
                !p.startsWith("/dist/") &&
                !p.startsWith("/assets/") &&
                !p.includes("svg") &&
                !p.includes("css")
            )
        ),
      ].slice(0, 120);

      const cdn_snippets = collect_snippets(js_code, "ahacdn\\.me", 15, 110);
      const video_host_snippets = collect_snippets(js_code, "video\\.beeg\\.com", 15, 110);
      const search_snippets = collect_snippets(js_code, "search", 15, 80);

      return json_res({
        ok: true,
        bundleUrl: bundle_url,
        endpointTokenCount: endpoint_tokens.length,
        endpointTokens: endpoint_tokens,
        cdnSnippets: cdn_snippets,
        videoHostSnippets: video_host_snippets,
        searchSnippets: search_snippets,
      });
    }

    return json_res({ ok: false, error: "Use /api-hunt?apikey=shadow_movie-x_-9999999999" }, 404);
  },
};
