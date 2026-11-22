// language: JavaScript, runtime: Cloudflare Workers, target: beeg.com debug probe

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

    if (pathname === "/debug") {
      const q = (url.searchParams.get("q") || "test").trim();
      const targets = [
        `${BASE_URL}/`,
        `${BASE_URL}/search?q=${encodeURIComponent(q)}`,
        `${BASE_URL}/api/v6/ch/search?query=${encodeURIComponent(q)}&limit=10&offset=0`,
      ];

      const results = [];
      for (const t of targets) {
        try {
          const r = await fetch(t, {
            headers: {
              "User-Agent": UA,
              Referer: BASE_URL,
              Accept: "*/*",
            },
            redirect: "follow",
          });
          const txt = await r.text();
          results.push({
            url: t,
            finalUrl: r.url,
            status: r.status,
            contentType: r.headers.get("content-type"),
            length: txt.length,
            preview: txt.slice(0, 600),
          });
        } catch (e) {
          results.push({ url: t, error: e.message });
        }
      }

      return json_res({ ok: true, results });
    }

    return json_res({ ok: false, error: "Use /debug?q=test&apikey=shadow_movie-x_-9999999999" }, 404);
  },
};
