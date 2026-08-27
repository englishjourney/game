// apps.js

// Função para buscar e converter o texto de apps.txt
async function fetchAppsData() {
    try {
        const response = await fetch('apps.txt');
        if (!response.ok) throw new Error("Não foi possível ler apps.txt");
        
        const text = await response.text();
        const apps = [];
        
        // Expressão regular para capturar os dados no formato exato solicitado:
        // "Nome":"Link"(Imagem): "Descrição";
        const regex = /"([^"]+)"\s*:\s*"([^"]+)"\s*\(([^)]+)\)\s*:\s*"([^"]+)";/g;
        
        let match;
        while ((match = regex.exec(text)) !== null) {
            apps.push({
                name: match[1],
                url: match[2],
                image: match[3],
                description: match[4]
            });
        }
        
        return apps;
    } catch (error) {
        console.error("Erro ao carregar os apps:", error);
        return [];
    }
}

// Função para abrir o Dialog e injetar os aplicativos
export async function openAppsDialog() {
    const modal = document.getElementById('content-modal');
    const modalContent = document.getElementById('modal-content');

    // Estado de carregamento
    modalContent.innerHTML = '<h2 style="text-align: center;">Carregando Apps...</h2>';
    modal.showModal();

    const apps = await fetchAppsData();

    if (apps.length === 0) {
        modalContent.innerHTML = '<h2 style="text-align: center;">Nenhum app encontrado.</h2>';
        return;
    }

    // Criando a grade de aplicativos
    let gridHtml = '<div class="apps-grid-container">';
    
    apps.forEach(app => {
        gridHtml += `
            <div class="app-item">
                <a href="${app.url}" target="_blank" title="${app.description}" class="app-link">
                    <!-- Tamanho fixo e bem menor definido no atributo style -->
                    <img src="${app.image}" alt="Ícone do ${app.name}" class="app-image" style="width: 50px; height: 50px; object-fit: cover; border-radius: 12px; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">
                    <span class="app-name" style="font-size: 0.9rem; margin-top: 5px;">${app.name}</span>
                </a>
            </div>
        `;
    });
    
    gridHtml += '</div>';

    // Atualiza o conteúdo do modal
    modalContent.innerHTML = `
        <h2 style="text-align: center; margin-bottom: 20px;">Aplicativos Recomendados</h2>
        ${gridHtml}
    `;
}
