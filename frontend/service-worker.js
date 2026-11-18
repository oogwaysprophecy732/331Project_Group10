const CACHE_NAME = "greymatter-v99";
// Refresh cached frontend assets so updated styling is applied.
const MUSIC_CACHE_NAME = "greymatter-music-v2";
const LOCAL_MUSIC_CACHE_NAME = "greymatter-imported-music-v1";

const APP_FILES = [
    "/",
    "/index.html",
    "/css/style.css?v=95",
    "/js/app.js?v=71",
    "/assets/greymatter-logo.png?v=63",
    "/assets/w95f.woff2",
    "/manifest.webmanifest"
];


self.addEventListener("install", function(event) {

    event.waitUntil(

        caches.open(CACHE_NAME)
            .then(function(cache) {

                return cache.addAll(APP_FILES);

            })

    );

    self.skipWaiting();

});


self.addEventListener("activate", function(event) {

    event.waitUntil(

        caches.keys()
            .then(function(cacheNames) {

                return Promise.all(

                    cacheNames.map(function(name) {

                        if (
                            name !== CACHE_NAME &&
                            name !== MUSIC_CACHE_NAME &&
                            name !== LOCAL_MUSIC_CACHE_NAME
                        ) {

                            return caches.delete(name);

                        }

                    })

                );

            })

    );

    self.clients.claim();

});


self.addEventListener("fetch", function(event) {

    const request =
        event.request;

    const url =
        new URL(request.url);


    /*
     * API requests
     */

    if (
        request.method === "GET" &&
        url.pathname === "/api/health"
    ) {

        event.respondWith(
            fetch(request)
        );

        return;

    }

    if (
        request.method === "GET" &&
        url.pathname.startsWith("/api/")
    ) {

        event.respondWith(

            Promise.race([
                fetch(request),
                new Promise(function(_, reject) {
                    setTimeout(function() {
                        reject(new Error("Server is unavailable."));
                    }, 1200);
                })
            ])

                .then(function(response) {

                    if (response.ok) {

                        const responseCopy =
                            response.clone();

                        caches.open(CACHE_NAME)
                            .then(function(cache) {

                                cache.put(
                                    request,
                                    responseCopy
                                );

                            });

                    }

                    return response;

                })

                .catch(function() {

                    return caches.match(request);

                })

        );

        return;

    }

    /*
     * Music files
     */

    if (
        url.pathname.startsWith("/local-music/")
    ) {

        event.respondWith(

            caches.open(LOCAL_MUSIC_CACHE_NAME)

                .then(function(cache) {

                    return cache.match(request);

                })

                .then(function(response) {

                    return response || new Response(
                        "Imported file not found.",
                        { status: 404 }
                    );

                })

        );

        return;

    }

    if (
        url.pathname.startsWith("/music/")
    ) {

        // Safari requests audio in byte ranges. Cache only complete (200)
        // responses, then answer later range requests from that full file.
        // Partial (206) responses cannot be stored reliably in Cache Storage.
        const rangeHeader = request.headers.get("Range");
        const fullFileRequest = new Request(url.href, {
            method: "GET",
            credentials: request.credentials
        });

        event.respondWith(

            caches.open(MUSIC_CACHE_NAME)

                .then(function(cache) {

                    return cache.match(fullFileRequest)
                        .then(function(cachedResponse) {
                            if (cachedResponse && cachedResponse.status === 200) {
                                return rangeHeader
                                    ? makeRangeResponse(rangeHeader, cachedResponse)
                                    : cachedResponse;
                            }

                            return fetch(request).then(function(response) {
                                if (!rangeHeader && response.status === 200) {
                                    cache.put(fullFileRequest, response.clone());
                                }
                                return response;
                            });
                        });

                })

        );

        return;

    }


    /*
     * App files
     *
     * Cache first so the installed app opens immediately when its server is
     * unavailable, such as when the Mac is off.
     */

    if (
        url.pathname === "/" ||
        url.pathname === "/index.html" ||
        url.pathname === "/js/app.js" ||
        url.pathname === "/css/style.css"
    ) {

        event.respondWith(
            caches.match(request)
                .then(function(cachedResponse) {
                    if (cachedResponse) return cachedResponse;
                    return fetch(request)
                        .then(function(response) {
                            if (response.ok) {
                                caches.open(CACHE_NAME).then(function(cache) {
                                    cache.put(request, response.clone());
                                });
                            }
                            return response;
                        });
                })
        );

        return;

    }


    /*
     * Everything else
     */

    event.respondWith(

        fetch(request)

            .catch(function() {

                return caches.match(request);

            })

    );

});


async function makeRangeResponse(rangeHeader, fullResponse) {
    const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
    if (!match) return new Response(null, { status: 416 });

    const blob = await fullResponse.blob();
    const size = blob.size;
    let start;
    let end;

    if (match[1] === "") {
        const suffixLength = Number(match[2]);
        if (!suffixLength) return new Response(null, { status: 416 });
        start = Math.max(size - suffixLength, 0);
        end = size - 1;
    } else {
        start = Number(match[1]);
        end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
    }

    if (!Number.isSafeInteger(start) || start < 0 || start >= size || end < start) {
        return new Response(null, {
            status: 416,
            headers: { "Content-Range": `bytes */${size}` }
        });
    }

    const body = blob.slice(start, end + 1, blob.type);
    const headers = new Headers(fullResponse.headers);
    headers.set("Accept-Ranges", "bytes");
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    headers.set("Content-Length", String(body.size));
    headers.delete("Content-Encoding");
    return new Response(body, { status: 206, statusText: "Partial Content", headers });
}


/*
 * Download a song into the music cache
 */

self.addEventListener(
    "message",
    function(event) {

        if (!event.data) {

            return;

        }


        if (
            event.data.type ===
            "DOWNLOAD_SONG"
        ) {

            const songFile =
                event.data.url;


            caches.open(
                MUSIC_CACHE_NAME
            )

            .then(function(cache) {

                return fetch(songFile)

                    .then(function(response) {

                        if (!response.ok) {

                            throw new Error(
                                "HTTP " +
                                response.status
                            );

                        }


                        return cache.put(songFile, response.clone());

                    });

            })

            .then(function() {

                if (
                    event.source
                ) {

                    event.source.postMessage({

                        type:
                            "DOWNLOAD_COMPLETE",

                        url:
                            songFile

                    });

                }

            })

            .catch(function(error) {

                console.error(
                    "Service worker download failed:",
                    error
                );


                if (
                    event.source
                ) {

                    event.source.postMessage({

                        type:
                            "DOWNLOAD_FAILED",

                        url:
                            songFile

                    });

                }

            });

        }

    }
);
