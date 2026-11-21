window.monBudgetGoogleDrive = (() => {
    const scope = "https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.file";
    let tokenClient;
    let accessToken;
    let expiresAt = 0;
    let configuredClientId;
    const interactiveAuthButtons = new WeakMap();
    let interactiveAuthInProgress = false;

    function loadLibrary() {
        if (window.google?.accounts?.oauth2) return Promise.resolve();
        if (window.googleDriveLibraryPromise) return window.googleDriveLibraryPromise;
        window.googleDriveLibraryPromise = new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "https://accounts.google.com/gsi/client";
            script.async = true;
            script.onload = resolve;
            script.onerror = () => {
                window.googleDriveLibraryPromise = undefined;
                reject(new Error("Impossible de charger le service d’authentification Google. Vérifiez votre connexion puis réessayez."));
            };
            document.head.appendChild(script);
        });
        return window.googleDriveLibraryPromise;
    }

    function requestAccessToken(clientId) {
        return new Promise((resolve, reject) => {
            try {
                tokenClient = window.google.accounts.oauth2.initTokenClient({
                    client_id: clientId,
                    scope,
                    callback: response => {
                        if (response.error) {
                            console.warn("Google OAuth returned an OAuth error.", response.error);
                            reject(new Error(response.error_description || `Erreur Google OAuth : ${response.error}`));
                            return;
                        }
                        console.info("Google OAuth callback succeeded.");
                        accessToken = response.access_token;
                        expiresAt = Date.now() + Math.max(0, Number(response.expires_in || 3600)) * 1000;
                        resolve(accessToken);
                    },
                    error_callback: error => {
                        if (error.type === "popup_failed_to_open") {
                            console.warn("Google OAuth popup failed to open.");
                            reject(new Error("La fenêtre de connexion Google a été bloquée. Autorisez les fenêtres pop-up pour ce site, puis réessayez."));
                        } else if (error.type === "popup_closed") {
                            console.info("Google OAuth popup was closed before completion.");
                            reject(new Error("La fenêtre de connexion Google a été fermée avant la fin de l’authentification."));
                        } else {
                            console.warn("Google OAuth popup failed.", error.type || "unknown");
                            reject(new Error(`La fenêtre de connexion Google a rencontré une erreur (${error.type || "inconnue"}).`));
                        }
                    }
                });
                tokenClient.requestAccessToken({ prompt: "select_account" });
            } catch (error) {
                reject(error);
            }
        });
    }

    function getAccessToken(clientId, allowInteraction = true) {
        configuredClientId = clientId;
        if (accessToken && Date.now() < expiresAt - 60000) return Promise.resolve(accessToken);

        if (!window.google?.accounts?.oauth2) {
            if (allowInteraction) {
                // Never wait for the GIS script before opening a popup: the await would
                // consume the user's activation and GIS would be blocked by the browser.
                loadLibrary().catch(() => {});
                return Promise.reject(new Error("Le service Google se prépare. Réessayez dans un instant."));
            }
            // GIS token requests use a popup, even when prompt is "none". Preload the
            // library for the next click, but never start OAuth during background restore.
            return loadLibrary().then(() => {
                throw new Error("GOOGLE_AUTH_REQUIRED");
            });
        }
        if (!allowInteraction) {
            return Promise.reject(new Error("GOOGLE_AUTH_REQUIRED"));
        }

        // Google retains the authorization grant; access tokens stay in memory only.
        // For interactive requests, call GIS synchronously while the click is active.
        return requestAccessToken(clientId);
    }

    function bindInteractiveAuthButton(element, dotNetRef) {
        if (!element?.addEventListener || !dotNetRef || interactiveAuthButtons.has(element)) return;

        const onClick = event => {
            event.preventDefault();
            if (element.disabled || interactiveAuthInProgress) return;

            interactiveAuthInProgress = true;
            element.disabled = true;
            let tokenRequest;
            try {
                // This listener runs on the native DOM click, so GIS opens its popup
                // before control crosses the asynchronous Blazor/.NET interop boundary.
                tokenRequest = getAccessToken(configuredClientId, true);
            } catch (error) {
                tokenRequest = Promise.reject(error);
            }

            dotNetRef.invokeMethodAsync("InteractiveGoogleAuthStartedAsync").catch(() => {});
            Promise.resolve(tokenRequest)
                .then(
                    () => dotNetRef.invokeMethodAsync("InteractiveGoogleAuthCompletedAsync"),
                    error => dotNetRef.invokeMethodAsync("InteractiveGoogleAuthFailedAsync", error?.message || String(error)))
                .catch(error => console.error("Google authentication callback failed.", error))
                .finally(() => {
                    interactiveAuthInProgress = false;
                    element.disabled = false;
                });
        };

        element.addEventListener("click", onClick);
        interactiveAuthButtons.set(element, onClick);
    }

    function invalidateAccessToken() {
        accessToken = undefined;
        expiresAt = 0;
    }

    function disconnect() {
        if (accessToken && window.google?.accounts?.oauth2)
            window.google.accounts.oauth2.revoke(accessToken, () => {});
        invalidateAccessToken();
    }

    return { getAccessToken, getCachedAccessToken: clientId => getAccessToken(clientId, false), bindInteractiveAuthButton, invalidateAccessToken, disconnect };
})();
