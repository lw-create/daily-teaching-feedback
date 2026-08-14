// Service Worker — 缓存优先策略，确保已访问过的页面永远可加载
// 策略：导航请求用 cache-first（缓存优先），其他请求用 stale-while-revalidate
var CACHE_NAME = 'teaching-feedback-v15';
var CORE_URLS = [
  './',
  './index.html',
  './daily-teaching-feedback.html',
  './version.json',
  './manifest.json'
];

// 内联回退页面 — 当缓存中没有任何内容时显示（比浏览器原生错误页好得多）
var FALLBACK_HTML = '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0,user-scalable=no"><title>每日教学反馈生成器</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Noto Sans CJK SC",sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f0f4f8;color:#333;text-align:center}.box{padding:2rem 1.5rem;max-width:340px}.icon{width:56px;height:56px;border-radius:14px;background:linear-gradient(135deg,#2d9d78,#1a8b5f);display:flex;align-items:center;justify-content:center;font-size:28px;margin:0 auto 20px;box-shadow:0 4px 16px rgba(45,157,120,0.25)}.spinner{width:36px;height:36px;border:3px solid rgba(45,157,120,0.15);border-top-color:#2d9d78;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 16px}@keyframes spin{to{transform:rotate(360deg)}}.title{font-size:1.15rem;font-weight:700;color:#1a8b5f;margin-bottom:8px}.msg{font-size:0.85rem;color:#888;line-height:1.6;margin-bottom:16px}.hint{font-size:0.75rem;color:#aaa;margin-bottom:20px}.btn{display:inline-block;padding:10px 28px;background:#2d9d78;color:#fff;border:none;border-radius:8px;font-size:0.9rem;cursor:pointer;text-decoration:none;margin:4px}.btn-outline{background:#fff;color:#2d9d78;border:1.5px solid #2d9d78}.btn:active{opacity:0.8}</style></head><body><div class="box"><div class="icon">&#127793;</div><div class="spinner"></div><div class="title">每日教学反馈生成器</div><div class="msg">网络连接不稳定，正在尝试恢复...</div><div class="hint">这通常是暂时的，多试几次即可打开</div><button class="btn" onclick="location.reload()">&#128260; 重新加载</button><a class="btn btn-outline" href="daily-teaching-feedback.html">直接进入工具</a></div><script>setTimeout(function(){location.reload()},5000)</script></body></html>';

// 安装：预缓存核心文件，跳过等待立即激活
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return Promise.allSettled(
        CORE_URLS.map(function(url) {
          return cache.add(url).catch(function() {
            // 单个文件失败不阻塞安装
          });
        })
      );
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// 激活：清理旧缓存，立即接管所有客户端
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.map(function(name) {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// 判断是否为导航请求（HTML 页面）
function isNavigationRequest(request) {
  return request.mode === 'navigate' ||
    (request.headers.get('accept') && request.headers.get('accept').indexOf('text/html') !== -1);
}

// fetch 事件处理
self.addEventListener('fetch', function(event) {
  var request = event.request;

  // 只处理 GET 请求
  if (request.method !== 'GET') return;

  // 只处理同源请求
  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isNavigationRequest(request)) {
    // 导航请求：缓存优先（确保永远不显示浏览器错误页）
    event.respondWith(
      caches.match(request).then(function(cachedResponse) {
        // 有缓存：立即返回缓存，后台静默更新
        var fetchPromise = fetch(request, { cache: 'no-store' })
          .then(function(response) {
            if (response && response.status === 200) {
              var clone = response.clone();
              caches.open(CACHE_NAME).then(function(cache) {
                cache.put(request, clone);
              });
            }
            return response;
          })
          .catch(function() {
            // 网络失败，静默忽略（已经返回了缓存）
            return null;
          });

        if (cachedResponse) {
          return cachedResponse;
        }

        // 没有缓存：尝试网络
        return fetchPromise.then(function(response) {
          if (response) return response;
          // 网络也失败：返回回退页面
          return new Response(FALLBACK_HTML, {
            headers: { 'Content-Type': 'text/html; charset=UTF-8' }
          });
        });
      })
    );
  } else {
    // 非导航请求（JS、CSS、图片等）：stale-while-revalidate
    event.respondWith(
      caches.match(request).then(function(cachedResponse) {
        var fetchPromise = fetch(request, { cache: 'no-store' })
          .then(function(response) {
            if (response && response.status === 200) {
              var clone = response.clone();
              caches.open(CACHE_NAME).then(function(cache) {
                cache.put(request, clone);
              });
            }
            return response;
          })
          .catch(function() {
            return cachedResponse || null;
          });

        return cachedResponse || fetchPromise;
      })
    );
  }
});
