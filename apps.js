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

    // Criando a grade de aplicativos (máximo 5 por linha, scrollview se necessário)
    let gridHtml = `
        <div class="apps-grid-container" style="
            display: grid; 
            grid-template-columns: repeat(5, 1fr); 
            gap: 20px; 
            max-height: 60vh; 
            overflow-y: auto; 
            padding: 10px; 
            justify-items: center; 
            align-items: start;
        ">
    `;
    
    apps.forEach(app => {
        gridHtml += `
            <div class="app-item" style="display: flex; flex-direction: column; align-items: center; text-align: center; width: 100%;">
                <a href="${app.url}" target="_blank" title="${app.description}" class="app-link" style="display: flex; flex-direction: column; align-items: center; text-decoration: none; color: inherit;">
                    <!-- Círculo invisível com tamanho fixo padronizado para o ícone -->
                    <div class="app-icon-circle" style="
                        width: 60px; 
                        height: 60px; 
                        border-radius: 50%; 
                        overflow: hidden; 
                        display: flex; 
                        align-items: center; 
                        justify-content: center; 
                        background: transparent;
                    ">
                        <img src="${app.image}" alt="Ícone do ${app.name}" class="app-image" style="width: 100%; height: 100%; object-fit: contain; border-radius: 50%;">
                    </div>
                    <span class="app-name" style="font-size: 0.85rem; margin-top: 8px; word-break: break-word; text-align: center;">${app.name}</span>
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
