const { log, err, createResponseDumper } = require("../logger");
const { IS_DEV } = require("../config");
const { fetchRouter, pipeSSE } = require("./base");

const NO_CREDENTIALS_MARKER = "No active credentials for provider";

/**
 * Intercept Antigravity request — forward Gemini body as-is to /v1/chat/completions.
 * Router auto-detects format via body.userAgent==="antigravity" + body.request.contents,
 * runs antigravity→openai→provider→openai→antigravity translators internally.
 *
 * Graceful fallback: if Router returns 404 because no provider credentials are
 * configured, passthrough to the real upstream so Antigravity works out-of-the-box
 * without requiring a login in the Router dashboard.
 */
async function intercept(req, res, bodyBuffer, mappedModel, passthrough) {
  const dumper = IS_DEV ? createResponseDumper(req, "intercept-antigravity") : null;
  const isStream = req.url.includes(":streamGenerateContent");
  try {
    const body = JSON.parse(bodyBuffer.toString());
    if (body.model) body.model = mappedModel;

    const routerRes = await fetchRouter(body, "/v1/chat/completions", req.headers);

    // Graceful fallback: no credentials in Router → passthrough to real upstream
    if (routerRes.status === 404) {
      const text = await routerRes.text();
      if (text.includes(NO_CREDENTIALS_MARKER)) {
        log(`⏩ passthrough | antigravity | no credentials for mapped model "${mappedModel || "unknown"}" — forwarding to real upstream`);
        if (dumper) {
          dumper.writeHeader(routerRes.status, Object.fromEntries(routerRes.headers));
          dumper.writeChunk(text);
          dumper.end();
        }
        return passthrough(req, res, bodyBuffer);
      }
      // Other 404 errors: propagate as-is
      if (!res.headersSent) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(text);
      }
      return;
    }

    await pipeSSE(routerRes, res, dumper);
  } catch (error) {
    err(`[antigravity] ${error.message}`);
    if (dumper) { dumper.writeChunk(`\n[ERROR] ${error.message}\n`); dumper.end(); }
    // For stream endpoint, send SSE error chunk so SDK doesn't hang waiting
    if (isStream) {
      if (!res.headersSent) res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.end(`data: ${JSON.stringify({ error: { message: error.message } })}\r\n\r\n`);
    } else {
      if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: error.message, type: "mitm_error" } }));
    }
  }
}

module.exports = { intercept };
