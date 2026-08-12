// loader.js
import { getSession } from './auth.js';

export function showLoader() {
    const session = getSession();
    // Verifica se é Ensino Médio (1º, 2º ou 3º ano)
    const isHighSchool = session && ['1', '2', '3'].includes(session.serie);

    // Remove loader anterior se houver
    hideLoader();

    const loaderDiv = document.createElement('div');
    loaderDiv.id = 'global-loader';

    if (isHighSchool) {
        // Estética Solo Leveling (Painel de Sistema Azul Neon)
        loaderDiv.className = 'loader-overlay-hs';
        loaderDiv.innerHTML = `
            <div class="loader-system-box">
                <div class="tech-spinner"></div>
                <p>[ PROCESSANDO DADOS DO SISTEMA... ]</p>
            </div>
        `;
    } else {
        // Estética Brawl Stars (Arredondado, Colorido e Amigável)
        loaderDiv.className = 'loader-overlay-fund';
        loaderDiv.innerHTML = `
            <div class="loader-arcade-box">
                <div class="arcade-spinner">⭐</div>
                <p>CARREGANDO...</p>
            </div>
        `;
    }

    document.body.appendChild(loaderDiv);
}

export function hideLoader() {
    const loader = document.getElementById('global-loader');
    if (loader) {
        loader.remove();
    }
}

// A "Mágica": Executa qualquer função de banco de dados já com o loader embutido
export async function runWithLoader(asyncFunction) {
    showLoader();
    try {
        const result = await asyncFunction();
        return result;
    } catch (error) {
        throw error;
    } finally {
        hideLoader(); // Garante que o loader some mesmo se der erro
    }
}
