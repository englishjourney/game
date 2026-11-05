// loader.js
// Public API used by the ES modules. The classic backend-loader.js installs the
// shared implementation before page scripts execute.
function getLoaderApi() {
    return typeof window !== 'undefined' ? window.EnglishJourneyLoader : null;
}

export function showLoader(gradeOverride = null) {
    getLoaderApi()?.show(gradeOverride);
}

export function hideLoader() {
    getLoaderApi()?.hide();
}

export async function runWithLoader(asyncFunction) {
    if (typeof asyncFunction !== 'function') {
        throw new TypeError('runWithLoader espera uma função assíncrona.');
    }

    const finish = getLoaderApi()?.beginOperation({ immediate: true });
    try {
        return await asyncFunction();
    } finally {
        if (typeof finish === 'function') finish();
        else hideLoader();
    }
}

export function installBackendLoader() {
    getLoaderApi()?.installFetchHook();
}
