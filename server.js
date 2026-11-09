const http = require("http");

const clients = new Map();

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  // SSE endpoint — the LWC connects here
  if (url.pathname === "/sse" && req.method === "GET") {
    const agentId = url.searchParams.get("agentId") || "default";

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    res.write(`data: ${JSON.stringify({ type: "connected", agentId })}\n\n`);

    if (!clients.has(agentId)) clients.set(agentId, new Set());
    clients.get(agentId).add(res);
    console.log(`Agent ${agentId} connected (${clients.get(agentId).size} connections)`);

    req.on("close", () => {
      clients.get(agentId).delete(res);
      console.log(`Agent ${agentId} disconnected`);
    });
    return;
  }

  // Push endpoint — simulate a screen pop event
  if (url.pathname === "/push" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const event = JSON.parse(body);
      const agentId = event.agentId || "default";
      const agentClients = clients.get(agentId);

      if (agentClients && agentClients.size > 0) {
        const payload = `event: screenpop\ndata: ${JSON.stringify(event)}\n\n`;
        agentClients.forEach((client) => client.write(payload));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ sent: true, recipients: agentClients.size }));
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ sent: false, reason: "no connected agent" }));
      }
    });
    return;
  }

  // Test UI
  if (url.pathname === "/" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`<!DOCTYPE html>
<html><head><title>SSE Test Server</title>
<style>
  body { font-family: system-ui; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
  .panel { border: 1px solid #ccc; border-radius: 8px; padding: 1rem; margin: 1rem 0; }
  input, button { padding: 0.5rem; margin: 0.25rem; font-size: 1rem; }
  #log { background: #111; color: #0f0; padding: 1rem; border-radius: 8px;
         font-family: monospace; height: 200px; overflow-y: auto; white-space: pre-wrap; }
  button { cursor: pointer; background: #0066ff; color: white; border: none; border-radius: 4px; }
</style></head>
<body>
  <h1>SSE Test Server</h1>

  <div class="panel">
    <h3>1. Listen (simulates LWC side)</h3>
    <input id="listenAgent" value="agent-001" placeholder="Agent ID">
    <button onclick="connect()">Connect SSE</button>
    <button onclick="disconnect()">Disconnect</button>
  </div>

  <div class="panel">
    <h3>2. Push (simulates CCaaS/middleware side)</h3>
    <input id="pushAgent" value="agent-001" placeholder="Agent ID">
    <input id="recordId" value="003XXXXXXXXXXXX" placeholder="SF Record ID">
    <button onclick="push()">Send Screen Pop</button>
  </div>

  <div id="log"></div>

<script>
let es;
function log(msg) {
  const el = document.getElementById('log');
  el.textContent += new Date().toISOString().substr(11,12) + ' ' + msg + '\\n';
  el.scrollTop = el.scrollHeight;
}
function connect() {
  if (es) es.close();
  const agentId = document.getElementById('listenAgent').value;
  es = new EventSource('/sse?agentId=' + agentId);
  es.onopen = () => log('Connected as ' + agentId);
  es.onerror = () => log('Connection error / reconnecting...');
  es.addEventListener('screenpop', (e) => {
    const data = JSON.parse(e.data);
    log('SCREEN POP: ' + JSON.stringify(data, null, 2));
  });
  es.onmessage = (e) => log('Message: ' + e.data);
}
function disconnect() { if (es) { es.close(); log('Disconnected'); } }
function push() {
  fetch('/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agentId: document.getElementById('pushAgent').value,
      recordId: document.getElementById('recordId').value,
      callerNumber: '+33612345678',
      callerName: 'Jean Dupont',
      type: 'inbound_call'
    })
  }).then(r => r.json()).then(r => log('Push result: ' + JSON.stringify(r)));
}
</script>
</body></html>`);
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`SSE server running on port ${PORT}`));