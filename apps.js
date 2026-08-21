// Variável para guardar os apps carregados e não precisar ler o arquivo duas vezes
let listaDeAppsRecomendados = [];

// Função para buscar e processar o arquivo apps.txt
async function carregarAppsDoTeacher() {
  try {
    // Busca o arquivo txt (ajuste o caminho se necessário)
    const response = await fetch('apps.txt');
    const textoCompleto = await response.text();
    
    // Expressão regular para pegar: "Nome":"Link"(Imagem):"Descrição";
    const regex = /"([^"]+)"\s*:\s*"([^"]+)"\s*\(\s*([^)]+)\s*\)\s*:\s*"([^"]+)"\s*;/g;
    let match;
    
    listaDeAppsRecomendados = [];

    // Extrai os dados batendo com o regex
    while ((match = regex.exec(textoCompleto)) !== null) {
      listaDeAppsRecomendados.push({
        nome: match[1],
        link: match[2],
        imagem: match[3],
        descricao: match[4]
      });
    }

    renderizarGradeApps();
  } catch (erro) {
    console.error("Erro ao carregar o arquivo apps.txt:", erro);
    document.getElementById('grade-apps').innerHTML = "<p>Não foi possível carregar as recomendações no momento.</p>";
  }
}

// Função para desenhar a grade dentro da primeira Dialog
function renderizarGradeApps() {
  const containerGrade = document.getElementById('grade-apps');
  containerGrade.innerHTML = ""; // Limpa antes de popular

  if (listaDeAppsRecomendados.length === 0) {
    containerGrade.innerHTML = "<p>Nenhum app recomendado no momento.</p>";
    return;
  }

  listaDeAppsRecomendados.forEach((app, index) => {
    // Cria o card do app
    const divCard = document.createElement('div');
    divCard.className = 'app-card';
    divCard.onclick = () => abrirDetalhesApp(index);

    divCard.innerHTML = `
      <img src="${app.imagem}" alt="${app.nome}" class="app-imagem">
      <span class="app-nome">${app.nome}</span>
    `;

    containerGrade.appendChild(divCard);
  });
}

// Função para abrir a 2ª Dialog com detalhes do App
function abrirDetalhesApp(index) {
  const app = listaDeAppsRecomendados[index];
  
  // Preenche os dados
  document.getElementById('detalhe-nome-app').innerText = app.nome;
  document.getElementById('detalhe-desc-app').innerText = app.descricao;
  document.getElementById('detalhe-link-app').href = app.link;

  // Abre a segunda dialog (fica por cima da primeira)
  document.getElementById('dialog-app-detalhe').classList.remove('oculto');
}

// Função global para fechar qualquer dialog
function fecharDialog(idDialog) {
  document.getElementById(idDialog).classList.add('oculto');
}
