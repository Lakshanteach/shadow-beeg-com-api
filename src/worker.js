// language: JavaScript, runtime: Cloudflare Workers, target: scan SPA bundle for API routes

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

    if (pathname === "/bundle") {
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

      const api_paths = [
        ...new Set(
          [...js_code.matchAll(/["'`](\/[a-zA-Z0-9_\-\/]*(?:api|search|video|media|stream|hls|mp4|thumb|poster|tag|channel|feed)[a-zA-Z0-9_\-\/\?\=\&]*?)["'`]/gi)].map(
            (m) => m[1]
          )
        ),
      ].slice(0, 80);

      const full_urls = [
        ...new Set(
          [...js_code.matchAll(/https?:\/\/[a-zA-Z0-9.\-_\/]+(?:api|cdn|thumb|stream|video|beeg)[a-zA-Z0-9.\-_\/?=&]*/gi)].map(
            (m) => m[0]
          )
        ),
      ].slice(0, 60);

      return json_res({
        ok: true,
        bundleUrl: bundle_url,
        status: js_r.status,
        bundleSize: js_code.length,
        apiPathCount: api_paths.length,
        apiPaths: api_paths,
        fullUrls: full_urls,
      });
    }

    return json_res({ ok: false, error: "Use /bundle?apikey=shadow_movie-x_-9999999999" }, 404);
  },
};
