const CACHE='sc-central-v6-final-1';
const CORE=['/','/index.html','/store-v6.css','/v4-boot.js','/v3-data.js','/script.js','/v3.js','/v4-store.js','/v6.js','/assets/logo-sc-central.png','/manifest.webmanifest'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.pathname.startsWith('/api/')||url.pathname.startsWith('/uploads/'))return;
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request).then(r=>{const c=r.clone();caches.open(CACHE).then(cache=>cache.put(event.request,c));return r;}).catch(()=>caches.match('/index.html')));
    return;
  }
  event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request).then(r=>{if(r.ok&&url.origin===location.origin){const c=r.clone();caches.open(CACHE).then(cache=>cache.put(event.request,c));}return r;})));
});
