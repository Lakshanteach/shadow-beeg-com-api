// language: JavaScript, runtime: Cloudflare Workers, target: probe externulls endpoints & bundle payload structure

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

function snippets_around(text, token, limit = 10, before = 120, after = 220) {
  const out = [];
  let pos = 0;
  while (out.length < limit) {
    const idx = text.indexOf(token, pos);
    if (idx === -1) break;
    out.push(text.slice(Math.max(0, idx - before), Math.min(text.length, idx + token.length + after)));
    pos = idx + token.length;
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

    if (pathname === "/ws-probe") {
      const q = (url.searchParams.get("q") || "test").trim();

      const shell_r = await fetch(`${BASE_URL}/`, {
        headers: { "User-Agent": UA, Referer: BASE_URL },
      });
      const shell_html = await shell_r.text();
      const bundle_m = shell_html.match(/src=["']([^"']*\/dist\/main\.[^"']+\.js)["']/i);
      const bundle_url = new URL(bundle_m ? bundle_m[1] : "/dist/main.94e48973.js", BASE_URL).toString();

      const js_r = await fetch(bundle_url, {
        headers: { "User-Agent": UA, Referer: `${BASE_URL}/` },
      });
      const js_code = await js_r.text();

      const probe_urls = [
        `https://search.externulls.com/?q=${encodeURIComponent(q)}`,
        `https://thumbs.externulls.com/`,
        `https://vp.externulls.com/`,
      ];

      const http_probes = [];
      for (const pu of probe_urls) {
        try {
          const r = await fetch(pu, {
            headers: {
              "User-Agent": UA,
              Origin: BASE_URL,
              Referer: `${BASE_URL}/`,
              Accept: "*/*",
            },
          });
          const body = await r.text();
          http_probes.push({
            url: pu,
            status: r.status,
            headers: Object.fromEntries(r.headers.entries()),
            length: body.length,
            preview: body.slice(0, 400),
          });
        } catch (e) {
          http_probes.push({ url: pu, error: e.message });
        }
      }

      return json_res({
        ok: true,
        query: q,
        searchStringCode: snippets_around(js_code, "Search_string", 5, 160, 260),
        apiEndpointCode: snippets_around(js_code, "api_endpoint_", 12, 60, 140),
        vpCode: snippets_around(js_code, "vp.externulls.com", 5, 120, 200),
        thumbsCode: snippets_around(js_code, "thumbs.externulls.com", 5, 120, 200),
        httpProbes: http_probes,
      });
    }

    return json_res({ ok: false, error: "Use /ws-probe?q=test&apikey=shadow_movie-x_-9999999999" }, 404);
  },
};
