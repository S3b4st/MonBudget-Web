/* Manifest version: 2LWMOMeT */
// Offline shell for the published Blazor WebAssembly PWA.
self.importScripts('./service-worker-assets.js');

const cacheNamePrefix = 'monbudget-offline-';
const cacheName = `${cacheNamePrefix}${self.assetsManifest.version}`;
const offlineAssetsInclude = [
    /\.dll$/, /\.pdb$/, /\.wasm/, /\.html$/, /\.js$/, /\.json$/, /\.webmanifest$/,
    /\.css$/, /\.woff$/, /\.png$/, /\.jpe?g$/, /\.gif$/, /\.ico$/, /\.blat$/, /\.dat$/
];
const offlineAssetsExclude = [/^service-worker\.js$/];
const baseUrl = new URL('./', self.registration.scope);
const appShellUrl = new URL('index.html', baseUrl);
const manifestUrlList = self.assetsManifest.assets.map(asset => new URL(asset.url, baseUrl).href);

self.addEventListener('install', event => event.waitUntil(onInstall()));
self.addEventListener('activate', event => event.waitUntil(onActivate()));
self.addEventListener('fetch', event => event.respondWith(onFetch(event)));

async function onInstall() {
    const requests = self.assetsManifest.assets
        .filter(asset => offlineAssetsInclude.some(pattern => pattern.test(asset.url)))
        .filter(asset => !offlineAssetsExclude.some(pattern => pattern.test(asset.url)))
        .map(asset => new Request(new URL(asset.url, baseUrl), { integrity: asset.hash, cache: 'no-cache' }));

    const cache = await caches.open(cacheName);
    await cache.addAll(requests);
}

async function onActivate() {
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys
        .filter(key => key.startsWith(cacheNamePrefix) && key !== cacheName)
        .map(key => caches.delete(key)));
}

async function onFetch(event) {
    let cachedResponse = null;

    if (event.request.method === 'GET') {
        const isAppNavigation = event.request.mode === 'navigate'
            && !manifestUrlList.includes(event.request.url);
        const request = isAppNavigation ? appShellUrl : event.request;
        const cache = await caches.open(cacheName);
        cachedResponse = await cache.match(request);
    }

    return cachedResponse || fetch(event.request);
}
