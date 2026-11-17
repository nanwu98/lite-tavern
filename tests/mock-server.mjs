import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = 8787;
const ROOT = process.cwd();
const LOG = path.join(ROOT, 'tests', '.mock-requests.jsonl');
const LAST = path.join(ROOT, 'tests', '.mock-last-request.json');

fs.mkdirSync(path.dirname(LOG), { recursive: true });
fs.writeFileSync(LOG, '');

/** Armed by GET /arm-context-error: the next chat request is rejected. */
let contextErrorArmed = false;

const SUMMARY_MARKER = '记忆压缩器';
const SUMMARY_TEXT = [
  '【已发生的事件】主角在雨夜抵达钟楼，与阿绫会合；两人沿石阶下到档案室门口。',
  '【人物与关系】阿绫是钟楼的守夜人，称呼主角为「你」，态度克制但信任。',
  '【物品・地点・状态】黄铜钥匙由阿绫保管；档案室仍然锁着；外面在下雨。',
  '【约定与伏笔】两人约好天亮前打开档案室，钟声比往常慢了一拍。',
].join('\n');

function isSummaryRequest(body) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  return messages.some(
    (message) => message.role === 'system' && String(message.content).includes(SUMMARY_MARKER),
  );
}

function longReply() {
  const unit =
    '钟声从海雾深处一层层推上来，石阶被雨水浸得发亮。阿绫抬手挡住风，低声数着台阶，' +
    '灯影在她袖口晃了一下，又落回墙上。她没有回头，只把钥匙往掌心收得更紧，' +
    '像是怕那点温度被雾带走。';
  return Array.from({ length: 12 }, (_, i) => `**第 ${i + 1} 段** ${unit}`).join('\n\n');
}

function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'authorization,content-type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 5_000_000) reject(new Error('body too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url?.startsWith('/v1/models')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        object: 'list',
        data: [
          { id: 'deepseek-flash', object: 'model' },
          { id: 'deepseek-v4-pro', object: 'model' },
        ],
      }),
    );
    return;
  }

  if (req.method === 'GET' && req.url === '/arm-context-error') {
    contextErrorArmed = true;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === 'POST' && req.url?.startsWith('/v1/chat/completions')) {
    const raw = await readBody(req);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'bad json' } }));
      return;
    }
    fs.writeFileSync(LAST, JSON.stringify(body, null, 2));
    fs.appendFileSync(LOG, `${JSON.stringify({ at: Date.now(), body })}\n`);

    // Summarizer round of the context compaction feature.
    if (isSummaryRequest(body)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'mock-summary',
          object: 'chat.completion',
          model: body.model ?? 'deepseek-flash',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: SUMMARY_TEXT },
              finish_reason: 'stop',
            },
          ],
        }),
      );
      return;
    }

    if (contextErrorArmed) {
      contextErrorArmed = false;
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: {
            message:
              "This model's maximum context length is 65536 tokens. However, you requested 70000 tokens.",
            type: 'invalid_request_error',
            code: 'context_length_exceeded',
          },
        }),
      );
      return;
    }

    const messages = Array.isArray(body.messages) ? body.messages : [];
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    const reply = /\[long\]/.test(lastUser)
      ? longReply()
      : `**钟声**从海雾里传来。*他侧过身，让出半级台阶，灯影在雾里晃了一下。*「跟紧我，别踩湿的那几级。」`;
    const chunks = reply.match(/[\s\S]{1,12}/g) ?? [reply];

    if (body.stream === false) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'mock-1',
          object: 'chat.completion',
          model: body.model ?? 'deepseek-flash',
          choices: [
            { index: 0, message: { role: 'assistant', content: reply }, finish_reason: 'stop' },
          ],
        }),
      );
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(': mock stream\n\n');
    let closed = false;
    req.on('close', () => {
      closed = true;
    });
    for (const chunk of chunks) {
      if (closed) break;
      const payload = {
        id: 'mock-1',
        choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }],
      };
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
      await new Promise((r) => setTimeout(r, 18));
    }
    if (!closed) {
      res.write(
        `data: ${JSON.stringify({ id: 'mock-1', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`,
      );
      res.write('data: [DONE]\n\n');
      res.end();
    }
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: { message: `not found: ${req.method} ${req.url}` } }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Mock LLM API listening on http://127.0.0.1:${PORT}/v1`);
});
