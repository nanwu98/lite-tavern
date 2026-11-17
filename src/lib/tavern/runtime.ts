/* eslint-disable @typescript-eslint/no-explicit-any */
import { createApi, type IframeConfig } from './api';
import { eventBus, iframe_events } from './events';
import { POLYFILL_SOURCE } from './polyfills';

let vendorPromise: Promise<Vendor> | null = null;
let parentReady: Promise<void> | null = null;

interface Vendor {
  jquery: string;
  lodash: string;
  vue: string;
  vueRouter: string;
}

function loadVendor(): Promise<Vendor> {
  if (!vendorPromise) {
    vendorPromise = Promise.all([
      import('../../vendor/jquery.min.js?raw'),
      import('../../vendor/lodash.min.js?raw'),
      import('../../vendor/vue.global.prod.js?raw'),
      import('../../vendor/vue-router.global.prod.js?raw'),
    ]).then(([jquery, lodash, vue, vueRouter]) => ({
      jquery: jquery.default,
      lodash: lodash.default,
      vue: vue.default,
      vueRouter: vueRouter.default,
    }));
  }
  return vendorPromise;
}

/**
 * Loads the libraries Tavern Helper exposes as globals (`z`, `YAML`) into the
 * app window once. iframes then borrow them from the parent instead of each
 * parsing their own 450 KB copy.
 */
async function loadScriptGlobals(): Promise<{ zod: string; yaml: string }> {
  const [zodModule, yamlModule] = await Promise.all([
    import('../../vendor/zod.global.js?raw'),
    import('../../vendor/js-yaml.min.js?raw'),
  ]);
  return { zod: zodModule.default, yaml: yamlModule.default };
}

/** Evaluates the UMD builds in the app window so iframes can borrow `$` / `_`. */
async function prepareParentLibs(): Promise<void> {
  if (parentReady) return parentReady;
  parentReady = (async () => {
    const vendor = await loadVendor();
    const holder = window as unknown as Record<string, any>;
    if (!holder.jQuery) {
      try {
        // eslint-disable-next-line no-new-func
        new Function(vendor.jquery)();
      } catch (error) {
        console.error('[轻语酒馆] jQuery 初始化失败', error);
      }
    }
    if (!holder._) {
      try {
        // eslint-disable-next-line no-new-func
        new Function(vendor.lodash)();
      } catch (error) {
        console.error('[轻语酒馆] lodash 初始化失败', error);
      }
    }
    if (!holder.z || !holder.YAML) {
      const sources = await loadScriptGlobals().catch(() => ({ zod: '', yaml: '' }));
      if (!holder.z && sources.zod) {
        try {
          // eslint-disable-next-line no-new-func
          new Function(sources.zod)();
        } catch (error) {
          console.error('[轻语酒馆] zod 初始化失败', error);
        }
      }
      if (!holder.YAML && sources.yaml) {
        try {
          // eslint-disable-next-line no-new-func
          new Function(sources.yaml)();
          const yamlLib = holder.jsyaml;
          if (yamlLib) {
            // MVU uses the `yaml` package API (parseDocument().toJS()); js-yaml
            // provides the same behaviour through load/dump.
            holder.YAML = {
              ...yamlLib,
              parse: (text: string) => yamlLib.load(text),
              stringify: (value: unknown) => yamlLib.dump(value, { lineWidth: -1 }),
              parseDocument: (text: string) => ({ toJS: () => yamlLib.load(text) }),
            };
          }
        } catch (error) {
          console.error('[轻语酒馆] YAML 初始化失败', error);
        }
      }
    }
  })();
  return parentReady;
}

const VH_CSS_VAR = 'var(--TH-viewport-height)';

export function replaceViewportUnits(content: string): string {
  let out = content;
  out = out.replace(
    /(min-height\s*:\s*)([^;{}]*?\d+(?:\.\d+)?vh)(?=\s*[;}])/gi,
    (_m, prefix: string, value: string) =>
      prefix + value.replace(/(\d+(?:\.\d+)?)vh\b/gi, (_x, num: string) => calcVh(Number(num))),
  );
  out = out.replace(
    /(max-height\s*:\s*)([^;{}]*?\d+(?:\.\d+)?vh)(?=\s*[;}])/gi,
    (_m, prefix: string, value: string) =>
      prefix + value.replace(/(\d+(?:\.\d+)?)vh\b/gi, (_x, num: string) => calcVh(Number(num))),
  );
  return out;
}

function calcVh(value: number): string {
  if (!Number.isFinite(value)) return `${value}vh`;
  if (value === 100) return VH_CSS_VAR;
  return `calc(${VH_CSS_VAR} * ${value / 100})`;
}

function stripCodeFence(content: string): string {
  const m = /^\s*```[^\n]*\n([\s\S]*)\n```\s*$/.exec(content);
  return m ? m[1] : content;
}

function escapeScriptClose(code: string): string {
  return code.replace(/<\/script/gi, '<\\/script');
}

function bootstrapScript(cfg: IframeConfig): string {
  const config = JSON.stringify(cfg);
  return `<script>${POLYFILL_SOURCE}</script><script>(function(){
  var P = window.parent, B = P.__LITE_TAVERN__;
  var cfg = ${config};
  if (!B) { console.error('[轻语酒馆] 脚本运行时未就绪'); return; }
  var api = B.createApi(cfg, window);
  window.TavernHelper = api.TavernHelper;
  for (var k in api) {
    if (k === 'TavernHelper' || k === 'SillyTavern' || k === 'toastr') continue;
    try { window[k] = api[k]; } catch (e) {}
  }
  window.toastr = api.toastr;
  try {
    Object.defineProperty(window, 'SillyTavern', { get: function(){ return api.SillyTavern; }, configurable: true });
  } catch (e) { window.SillyTavern = api.SillyTavern; }
  try {
    Object.defineProperty(window, 'Mvu', {
      get: function(){ return P.Mvu; },
      set: function(v){ try { P.Mvu = v; } catch (e) {} },
      configurable: true
    });
  } catch (e) {}
  if (!window._ && P._) window._ = P._;
  if (!window.z && P.z) window.z = P.z;
  if (!window.YAML && P.YAML) window.YAML = P.YAML;
  if (!window.Vue && P.Vue) window.Vue = P.Vue;
  // Vue / bundler environment flags expected by card pages (酒馆助手 sets these too).
  try {
    if (typeof window.__VUE_OPTIONS_API__ === 'undefined') window.__VUE_OPTIONS_API__ = true;
    if (typeof window.__VUE_PROD_DEVTOOLS__ === 'undefined') window.__VUE_PROD_DEVTOOLS__ = true;
    if (typeof window.__VUE_PROD_HYDRATION_MISMATCH_DETAILS__ === 'undefined') window.__VUE_PROD_HYDRATION_MISMATCH_DETAILS__ = false;
    if (!window.process) window.process = { env: { NODE_ENV: 'production' } };
  } catch (e) {}
  if (cfg.kind === 'script') {
    if (!window.$ && P.jQuery) { window.$ = P.jQuery; window.jQuery = P.jQuery; }
  }
  window.addEventListener('error', function(event){
    console.error('[轻语酒馆] 未捕获错误:', event && event.message, event && event.filename, event && event.lineno, event && event.error && event.error.stack);
  });
  window.addEventListener('unhandledrejection', function(event){
    console.error('[轻语酒馆] Promise 异常:', event && event.reason);
  });
  if (cfg.kind === 'message') {
    var lastHeight = 0;
    var fit = function(){
      try {
        document.documentElement.style.setProperty('--TH-viewport-height', ((P.innerHeight || 800)) + 'px');
        var doc = document.documentElement, body = document.body;
        var height = Math.max(body ? body.scrollHeight : 0, doc ? doc.scrollHeight : 0, body ? body.offsetHeight : 0);
        if (!height || !isFinite(height)) return;
        if (Math.abs(height - lastHeight) < 2) return;
        lastHeight = height;
        if (window.frameElement) window.frameElement.style.height = height + 'px';
      } catch (e) {}
    };
    var schedule = function(){};
    if (window.requestAnimationFrame) {
      schedule = function(){ if (window.__ltFitPending) return; window.__ltFitPending = true; window.requestAnimationFrame(function(){ window.__ltFitPending = false; fit(); }); };
    } else { schedule = fit; }
    window.addEventListener('load', function(){ fit(); setTimeout(fit, 200); setTimeout(fit, 800); setTimeout(fit, 2000); });
    document.addEventListener('DOMContentLoaded', function(){ schedule(); });
    try {
      if (window.ResizeObserver) {
        new ResizeObserver(function(){ schedule(); }).observe(document.documentElement);
      }
    } catch (e) {}
    document.addEventListener('click', function(){ setTimeout(fit, 60); }, true);
    if (B.notifyIframeRendered) B.notifyIframeRendered(cfg.iframeId, true);
  }
})();</script>`;
}

let iframeSeq = 0;

export function nextIframeId(prefix: string): string {
  iframeSeq += 1;
  return `LT-${prefix}--${iframeSeq}`;
}

export interface BuildOptions {
  chatId: string;
  scriptId?: string;
  scriptName?: string;
  messageIndex?: number;
  iframeId?: string;
  /** Resolved app theme, so card pages can match light/dark. */
  theme?: 'dark' | 'light';
}

export async function buildScriptDocument(content: string, options: BuildOptions): Promise<string> {
  const vendor = await loadVendor();
  await prepareParentLibs();
  const cfg: IframeConfig = {
    kind: 'script',
    chatId: options.chatId,
    scriptId: options.scriptId,
    scriptName: options.scriptName,
    iframeId: options.iframeId ?? nextIframeId('script'),
  };
  const code = escapeScriptClose(stripCodeFence(content));
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>html,body{margin:0;padding:0;background:transparent;}</style>
<script>${escapeScriptClose(vendor.vue)}</script>
<script>${escapeScriptClose(vendor.vueRouter)}</script>
${bootstrapScript(cfg)}
</head>
<body>
<script type="module">
${code}
</script>
</body>
</html>`;
}

export async function buildMessageDocument(html: string, options: BuildOptions): Promise<string> {
  const vendor = await loadVendor();
  await prepareParentLibs();
  const cfg: IframeConfig = {
    kind: 'message',
    chatId: options.chatId,
    scriptId: options.scriptId,
    scriptName: options.scriptName,
    messageIndex: options.messageIndex,
    iframeId: options.iframeId ?? nextIframeId('message'),
  };
  const content = replaceViewportUnits(html);
  const theme = options.theme === 'light' ? 'light' : 'dark';
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<style>
*,*::before,*::after{box-sizing:border-box;}
html{--TH-viewport-height:600px;color-scheme:${theme};}
html,body{margin:0;padding:0;max-width:100%;color-scheme:${theme};}
body{background:transparent;overflow-x:hidden;}
</style>
<script>${escapeScriptClose(vendor.jquery)}</script>
<script>${escapeScriptClose(vendor.vue)}</script>
<script>${escapeScriptClose(vendor.vueRouter)}</script>
${bootstrapScript(cfg)}
</head>
<body>
${content}
</body>
</html>`;
}

function notifyIframeRendered(iframeId: string, ended: boolean) {
  void eventBus.emit(
    ended ? iframe_events.MESSAGE_IFRAME_RENDER_ENDED : iframe_events.MESSAGE_IFRAME_RENDER_STARTED,
    iframeId,
  );
}

/** Installs the parent-side bridge that iframe bootstraps call into. */
export function installRuntime() {
  const holder = window as unknown as Record<string, any>;
  if (holder.__LITE_TAVERN__) return;
  holder.__LITE_TAVERN__ = {
    createApi,
    notifyIframeRendered,
    version: '1.0.0',
  };
  void prepareParentLibs();
}

/** Clears cross-iframe state when the chat / character changes. */
export function resetRuntimeState() {
  const holder = window as unknown as Record<string, any>;
  eventBus.removeAllListeners();
  try {
    delete holder.Mvu;
  } catch {
    holder.Mvu = undefined;
  }
}

export function getParentJQuery(): any {
  return (window as unknown as Record<string, any>).jQuery;
}

export function getParentLodash(): any {
  return (window as unknown as Record<string, any>)._;
}
