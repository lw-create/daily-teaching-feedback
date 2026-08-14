// Service Worker — 缓存主页面，防止 GitHub Pages 间歇性 403 时出现浏览器原生错误页
var CACHE_NAME = 'teaching-feedback-v13';
var CACHE_URLS = [
  './',
  './index.html',
  './daily-teaching-feedback.html',
  './version.json',
  './manifest.json'
];

// 安装：预缓存核心文件
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      // 逐个缓存，即使部分失败也不阻塞
      return Promise.allSettled(
        CACHE_URLS.map(function(url) {
          return cache.add(url);
        })
      );
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// 激活：清理旧缓存
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

// fetch：网络优先，失败时回退到缓存
self.addEventListener('fetch', function(event) {
  var request = event.request;

  // 只处理 GET 请求
  if (request.method !== 'GET') return;

  // 只处理同源请求
  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request, { cache: 'no-store' })
      .then(function(response) {
        // 网络成功：缓存响应并返回
        if (response && response.status === 200) {
          var responseClone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(function() {
        // 网络失败：从缓存中查找
        return caches.match(request).then(function(cachedResponse) {
          if (cachedResponse) {
            return cachedResponse;
          }
          // 如果请求的是 index.html 或根路径，回退到缓存的 index.html
          if (request.mode === 'navigate' || (request.headers.get('accept') && request.headers.get('accept').indexOf('text/html') !== -1)) {
            return caches.match('./index.html').then(function(resp) {
              if (resp) return resp;
              // 最后尝试缓存的 daily-teaching-feedback.html
              return caches.match('./daily-teaching-feedback.html').then(function(r) {
                return r || new Response(
                  '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>加载中</title><style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f0f4f8;color:#333;text-align:center;}.box{padding:2rem;}.icon{font-size:3rem;margin-bottom:1rem;}.msg{font-size:1rem;color:#666;margin-bottom:1rem;}.btn{padding:10px 28px;background:#2d9d78;color:#fff;border:none;border-radius:8px;font-size:0.9rem;cursor:pointer;}</style></head><body><div class="box"><div class="icon">🌱</div><div class="msg">正在从缓存恢复，请稍候...</div><button class="btn" onclick="location.reload()">重新加载</button></div></body></html>',
                  { headers: { 'Content-Type': 'text/html; charset=UTF-8' } }
                );
              });
            });
          }
          // 非导航请求（图片、JS等），尝试缓存
          return caches.match(request);
        });
      })
  );
});
