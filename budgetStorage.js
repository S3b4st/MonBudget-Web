(() => {
    const databaseName = "monbudget-budget-json";
    const objectStoreName = "documents";
    let databasePromise;

    function openDatabase() {
        if (!window.indexedDB)
            return Promise.reject(new Error("IndexedDB is not available in this browser."));

        if (!databasePromise) {
            databasePromise = new Promise((resolve, reject) => {
                const request = window.indexedDB.open(databaseName, 1);

                request.onupgradeneeded = () => {
                    const database = request.result;
                    if (!database.objectStoreNames.contains(objectStoreName))
                        database.createObjectStore(objectStoreName);
                };

                request.onsuccess = () => {
                    const database = request.result;
                    database.onversionchange = () => {
                        database.close();
                        databasePromise = undefined;
                    };
                    resolve(database);
                };

                request.onerror = () => {
                    databasePromise = undefined;
                    reject(request.error ?? new Error("Could not open the budget database."));
                };
            });
        }

        return databasePromise;
    }

    function get(key) {
        return openDatabase().then(database => new Promise((resolve, reject) => {
            const transaction = database.transaction(objectStoreName, "readonly");
            const request = transaction.objectStore(objectStoreName).get(key);
            let value = null;

            request.onsuccess = () => {
                value = request.result ?? null;
            };
            transaction.oncomplete = () => resolve(value);
            transaction.onerror = () => reject(transaction.error ?? request.error ?? new Error("Could not read the budget document."));
            transaction.onabort = () => reject(transaction.error ?? request.error ?? new Error("Reading the budget document was aborted."));
        }));
    }

    function set(key, value) {
        return openDatabase().then(database => new Promise((resolve, reject) => {
            const transaction = database.transaction(objectStoreName, "readwrite");
            transaction.objectStore(objectStoreName).put(value, key);
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error ?? new Error("Could not write the budget document."));
            transaction.onabort = () => reject(transaction.error ?? new Error("Writing the budget document was aborted."));
        }));
    }

    function remove(key) {
        return openDatabase().then(database => new Promise((resolve, reject) => {
            const transaction = database.transaction(objectStoreName, "readwrite");
            const store = transaction.objectStore(objectStoreName);
            const request = store.getKey(key);
            let existed = false;

            request.onsuccess = () => {
                existed = request.result !== undefined;
                if (existed)
                    store.delete(key);
            };
            transaction.oncomplete = () => resolve(existed);
            transaction.onerror = () => reject(transaction.error ?? request.error ?? new Error("Could not delete the budget document."));
            transaction.onabort = () => reject(transaction.error ?? request.error ?? new Error("Deleting the budget document was aborted."));
        }));
    }

    window.monBudgetBudgetStorage = Object.freeze({ get, set, delete: remove });
})();
