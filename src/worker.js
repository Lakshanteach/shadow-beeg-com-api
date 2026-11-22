// language: JavaScript, runtime: Cloudflare Workers, target: inspect raw WS frames & vp-handler response

const CREATOR = "CREATOR BY 👨‍💻 SHADOW MOVIE X MAIN OWMER 👨‍💻";
const BASE_URL = "https://beeg.com";
const WS_SEARCH_URL = "https://search.externulls.com/";
const VP_HANDLER_BASE = "https://vp-handler.externulls.com";
const VALID_API_KEYS = new Set(["shadow_movie-x_-9999999999"]);
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function json_res(data, status = 200) {
  return new Response(JSON.stringify({ creator: CREATOR, ...data }, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
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

    if (pathname === "/raw-check") {
      const q = (url.searchParams.get("q") || "test").trim();
      const id = (url.searchParams.get("id") || "1234567").trim();

      const frames = [];
      let ws_error = null;

      try {
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
          ws_error = `No webSocket object (status ${res.status})`;
        } else {
          ws.accept();
          const send_search = () => {
            try {
              ws.send(
                JSON.stringify({
                  type: "search",
                  ignore_stats: true,
                  payload: { Search_string: q, offset: 0, limit: 10, category_id: null },
                })
              );
            } catch (e) {
              ws_error = e.message;
            }
          };

          await new Promise((resolve) => {
            const done = () => {
              clearTimeout(t);
              try {
                ws.close(1000, "done");
              } catch (_) {}
              resolve();
            };
            const t = setTimeout(done, 5000);
            ws.addEventListener("open", send_search);
            send_search();
            ws.addEventListener("message", (ev) => {
              frames.push(String(ev.data).slice(0, 1200));
              if (frames.length >= 6) done();
            });
            ws.addEventListener("error", (e) => {
              ws_error = e?.message || "ws error";
              done();
            });
          });
        }
      } catch (e) {
        ws_error = e.message;
      }

      const vp_probes = [];
      for (const u of [
        `${VP_HANDLER_BASE}/video/${encodeURIComponent(id)}`,
        `${VP_HANDLER_BASE}/v1/video/${encodeURIComponent(id)}`,
        `${VP_HANDLER_BASE}/${encodeURIComponent(id)}`,
      ]) {
        try {
          const r = await fetch(u, {
            headers: { "User-Agent": UA, Origin: BASE_URL, Referer: `${BASE_URL}/` },
          });
          const body = await r.text();
          vp_probes.push({ url: u, status: r.status, body: body.slice(0, 800) });
        } catch (e) {
          vp_probes.push({ url: u, error: e.message });
        }
      }

      return json_res({
        ok: true,
        wsError: ws_error,
        frameCount: frames.length,
        frames,
        vpProbes: vp_probes,
      });
    }

    return json_res({ ok: false, error: "Use /raw-check?q=test&id=1234567&apikey=shadow_movie-x_-9999999999" }, 404);
  },
};
