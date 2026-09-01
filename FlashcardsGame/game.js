// game.js
export class GameEngine {
    constructor(supabase, roomData, currentUser) {
        this.supabase = supabase;
        this.room = roomData;
        this.user = currentUser;
        this.cards = [];
        this.currentCardIndex = 0;
        this.myTeam = null;
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

        // --- INDICADOR DO TIME (Adicionado no cabeçalho) ---
        const myTeamColor = this.myTeam === 'team1_score' ? 'Red' : 'Blue';
        let teamIndicator = document.getElementById('my-team-indicator');
        if (!teamIndicator) {
            teamIndicator = document.createElement('div');
            teamIndicator.id = 'my-team-indicator';
            teamIndicator.style.textAlign = 'center';
            teamIndicator.style.fontWeight = 'bold';
            teamIndicator.style.fontSize = '22px';
            teamIndicator.style.marginBottom = '15px';
            
            const scoreboard = document.querySelector('.scoreboard');
            if (scoreboard) {
                scoreboard.parentNode.insertBefore(teamIndicator, scoreboard.nextSibling);
            }
        }
        teamIndicator.innerText = `My Team: ${myTeamColor}`;
        teamIndicator.style.color = myTeamColor === 'Red' ? 'var(--accent-red)' : '#118AB2';
        // --------------------------------------------------

        // Garante que stacks seja um Array válido para a busca funcionar perfeitamente
        let stacksArray = [];
        if (Array.isArray(this.room.stacks)) {
            stacksArray = this.room.stacks;
        } else if (typeof this.room.stacks === 'string') {
            stacksArray = this.room.stacks.replace(/[\[\]{}"']/g, '').split(',').map(s => s.trim()).filter(s => s !== '');
        }

        // Busca os cards baseados nos stacks
        const { data, error } = await this.supabase
            .from('flashcards')
            .select('*')
            .in('stack', stacksArray);
            
        if (error) console.error("Erro ao buscar as cartas:", error);
        
        // Embaralha as cartas de todos os stacks combinados
        this.cards = (data || []).sort(() => Math.random() - 0.5);
    }

    getTeamsHeader() {
        return {
            team1: this.room.team1_score,
            team2: this.room.team2_score
        };
    }

    getCurrentCard() {
        if (this.currentCardIndex >= this.cards.length) return null; // Acabou
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

        let options = wrongOptions.map(o => o.translation);
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
