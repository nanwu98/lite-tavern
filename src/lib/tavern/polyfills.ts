/**
 * Compatibility shims for the modern JS APIs character-card code (and MVU)
 * relies on. Android WebView can be much older than the phone's Android version
 * — this emulator for instance ships Chromium 83, which lacks `at`,
 * `replaceAll`, `findLast` and `structuredClone`.
 */
export const POLYFILL_SOURCE = `(function (g) {
  if (!g || !g.Object) return;
  var define = function (obj, name, fn) {
    if (!obj || obj[name]) return;
    try {
      Object.defineProperty(obj, name, { value: fn, writable: true, configurable: true });
    } catch (e) {
      try { obj[name] = fn; } catch (e2) {}
    }
  };

  define(Array.prototype, 'at', function (index) {
    var len = this.length >>> 0;
    var k = Math.trunc(index) || 0;
    if (k < 0) k += len;
    return k < 0 || k >= len ? undefined : this[k];
  });
  define(String.prototype, 'at', function (index) {
    var str = String(this);
    var len = str.length;
    var k = Math.trunc(index) || 0;
    if (k < 0) k += len;
    return k < 0 || k >= len ? undefined : str.charAt(k);
  });
  define(String.prototype, 'replaceAll', function (search, replacement) {
    var str = String(this);
    if (search instanceof RegExp) {
      if (!search.global) throw new TypeError('replaceAll must be called with a global RegExp');
      return str.replace(search, replacement);
    }
    var needle = String(search);
    if (needle === '') return Array.from(str).join(String(replacement)) + String(replacement);
    var out = '';
    var from = 0;
    for (;;) {
      var at = str.indexOf(needle, from);
      if (at < 0) break;
      out += str.slice(from, at) + String(typeof replacement === 'function' ? replacement(needle, at, str) : replacement);
      from = at + needle.length;
    }
    return out + str.slice(from);
  });
  define(Array.prototype, 'findLast', function (predicate, thisArg) {
    for (var i = this.length - 1; i >= 0; i--) {
      if (predicate.call(thisArg, this[i], i, this)) return this[i];
    }
    return undefined;
  });
  define(Array.prototype, 'findLastIndex', function (predicate, thisArg) {
    for (var i = this.length - 1; i >= 0; i--) {
      if (predicate.call(thisArg, this[i], i, this)) return i;
    }
    return -1;
  });
  if (!Object.hasOwn) {
    Object.hasOwn = function (obj, key) {
      return Object.prototype.hasOwnProperty.call(Object(obj), key);
    };
  }
  if (!g.structuredClone) {
    g.structuredClone = function (value) {
      if (value === undefined || value === null || typeof value !== 'object') return value;
      if (typeof value === 'function') return value;
      try {
        return JSON.parse(JSON.stringify(value));
      } catch (e) {
        return value;
      }
    };
  }
  if (!g.queueMicrotask) {
    g.queueMicrotask = function (fn) {
      Promise.resolve().then(fn);
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);`;

let installed = false;

export function installPolyfills(): void {
  if (installed) return;
  installed = true;
  try {
    // eslint-disable-next-line no-new-func
    new Function(POLYFILL_SOURCE)();
  } catch (error) {
    console.error('[轻语酒馆] 兼容性补丁安装失败', error);
  }
}
