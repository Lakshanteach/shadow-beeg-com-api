// language: JavaScript, runtime: Cloudflare Workers, target: inspect SPA shell scripts

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

    if (pathname === "/shell") {
      const r = await fetch(`${BASE_URL}/`, {
        headers: { "User-Agent": UA, Referer: BASE_URL },
        redirect: "follow",
      });
      const html = await r.text();
      const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => {
        const src_m = m[0].match(/src=["']([^"']+)["']/i);
        const type_m = m[0].match(/type=["']([^"']+)["']/i);
        return {
          src: src_m ? src_m[1] : null,
          type: type_m ? type_m[1] : null,
          inlinePreview: src_m ? null : m[1].trim().slice(0, 400),
        };
      });
      const body_m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

      return json_res({
        ok: true,
        scriptCount: scripts.length,
        scripts,
        bodyPreview: body_m ? body_m[1].trim().slice(0, 800) : html.slice(0, 800),
      });
    }

    return json_res({ ok: false, error: "Use /shell?apikey=shadow_movie-x_-9999999999" }, 404);
  },
};
