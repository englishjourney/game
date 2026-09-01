// game.js
export class GameEngine {
    constructor(supabase, roomData, currentUser) {
        this.supabase = supabase;
        this.room = roomData;
        this.user = currentUser;
        this.cards = [];
        this.currentCardIndex = 0;
        this.myTeam = null;
        this.myTeamColor = null;
    }

    async init() {
        // Sortear times baseados nos players ordenados (para garantir consistência em todos os clientes)
        const players = [...this.room.players].sort();
        const colors = ['Red', 'Blue'];
        
        let teamRed = [];
        let teamBlue = [];
        
        players.forEach((p, index) => {
            if (index % 2 === 0) teamRed.push(p);
            else teamBlue.push(p);
        });

        this.myTeam = teamRed.includes(this.user.username) ? 'team1_score' : 'team2_score';
        this.myTeamColor = teamRed.includes(this.user.username) ? 'Red' : 'Blue';

        // --- INÍCIO DO CÓDIGO DO CABEÇALHO ---
        // Cria ou atualiza o texto "My Team: Cor" no centro do topo da tela
        let teamIndicator = document.getElementById('my-team-indicator');
        if (!teamIndicator) {
            teamIndicator = document.createElement('h3');
            teamIndicator.id = 'my-team-indicator';
            teamIndicator.style.textAlign = 'center';
            teamIndicator.style.margin = '15px 0';
            
            // Tenta colocar no header da sua página. Se não achar o header, coloca no topo.
            const container = document.querySelector('header') || document.body;
            container.insertBefore(teamIndicator, container.firstChild);
        }
        teamIndicator.textContent = `My Team: ${this.myTeamColor}`;
        teamIndicator.style.color = this.myTeamColor;
        // --- FIM DO CÓDIGO DO CABEÇALHO ---


        // --- INÍCIO DA CORREÇÃO DOS STACKS (SUA TEORIA) ---
        // Limpa a string vinda do Supabase e transforma num Array de palavras que o .in() consegue ler
        let stacksArray = [];
        if (Array.isArray(this.room.stacks)) {
            stacksArray = this.room.stacks;
        } else if (typeof this.room.stacks === 'string') {
            stacksArray = this.room.stacks
                .replace(/[\[\]{}"']/g, '') // Tira as chaves, aspas e colchetes
                .split(',')                  // Separa as palavras pela vírgula
                .map(s => s.trim())          // Tira os espaços em branco
                .filter(s => s !== '');      // Remove itens vazios
        }

        // Busca todas as rows (cartas) no banco onde a coluna 'stack' tenha o nome de um dos stacks
        const { data } = await this.supabase
            .from('flashcards')
            .select('*')
            .in('stack', stacksArray);
        // --- FIM DA CORREÇÃO ---

        // Embaralha as cartas. O (data || []) protege para não dar erro se vier vazio.
        this.cards = (data || []).sort(() => Math.random() - 0.5);
    }

    getTeamsHeader() {
        return {
            team1: this.room.team1_score,
            team2: this.room.team2_score
        };
    }

    getCurrentCard() {
        // Agora, isso aqui só vai ser Null depois que você passar por todas as cartas pesquisadas
        if (this.currentCardIndex >= this.cards.length) return null; 
        return this.cards[this.currentCardIndex];
    }

    async getOptionsForCurrentCard() {
        const card = this.getCurrentCard();
        // Pega 3 traduções erradas aleatórias
        const { data: wrongOptions } = await this.supabase
            .from('flashcards')
            .select('translation')
            .neq('translation', card.translation)
            .limit(3);

        let options = (wrongOptions || []).map(o => o.translation);
        options.push(card.translation);
        
        // Embaralha opções
        return options.sort(() => Math.random() - 0.5);
    }

    async handleAnswer(selectedTranslation) {
        const card = this.getCurrentCard();
        const isCorrect = selectedTranslation === card.translation;
        
        if (isCorrect) {
            // Atualiza pontuação do time no banco (simulação de corrida)
            const { data: currentRoom, error } = await this.supabase
                .from('flashcardsGame')
                .select(this.myTeam)
                .eq('roomID', this.room.roomID)
                .single();
            
            // Mantive a proteção de erro da última mensagem para evitar travamentos
            if (!error && currentRoom) {
                const newScore = currentRoom[this.myTeam] + 1;
                
                await this.supabase
                    .from('flashcardsGame')
                    .update({ [this.myTeam]: newScore })
                    .eq('roomID', this.room.roomID);
            }
        }

        this.currentCardIndex++;
        return isCorrect;
    }
}
