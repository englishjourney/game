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
        let playersArray = [];
        if (Array.isArray(this.room.players)) {
            playersArray = this.room.players;
        } else if (typeof this.room.players === 'string') {
            playersArray = this.room.players.replace(/[\[\]{}"']/g, '').split(',').map(p => p.trim()).filter(p => p !== '');
        }

        const players = [...playersArray].sort();
        
        let teamRed = [];
        let teamBlue = [];
        
        players.forEach((p, index) => {
            if (index % 2 === 0) teamRed.push(p);
            else teamBlue.push(p);
        });

        this.myTeam = teamRed.includes(this.user.username) ? 'team1_score' : 'team2_score';
        this.myTeamColor = teamRed.includes(this.user.username) ? 'Red' : 'Blue';

        // Cabeçalho da Cor do Time
        let teamIndicator = document.getElementById('my-team-indicator');
        if (!teamIndicator) {
            teamIndicator = document.createElement('h3');
            teamIndicator.id = 'my-team-indicator';
            teamIndicator.style.textAlign = 'center';
            teamIndicator.style.margin = '15px 0';
            
            const container = document.querySelector('header') || document.body;
            container.insertBefore(teamIndicator, container.firstChild);
        }
        teamIndicator.textContent = `My Team: ${this.myTeamColor}`;
        teamIndicator.style.color = this.myTeamColor;

        let stacksArray = [];
        if (Array.isArray(this.room.stacks)) {
            stacksArray = this.room.stacks;
        } else if (typeof this.room.stacks === 'string') {
            stacksArray = this.room.stacks
                .replace(/[\[\]{}"']/g, '')
                .split(',')
                .map(s => s.trim())
                .filter(s => s !== '');
        }

        // Pega TODAS as cartas de todos os Stacks configurados
        const { data } = await this.supabase
            .from('flashcards')
            .select('*')
            .in('stack', stacksArray);
        
        // Cada usuário embaralha as cartas no seu próprio navegador
        // Portanto, a ordem é diferente para cada um, mas a quantidade e palavras são as mesmas!
        this.cards = (data || []).sort(() => Math.random() - 0.5);
    }

    getCurrentCard() {
        if (this.currentCardIndex >= this.cards.length) return null; 
        return this.cards[this.currentCardIndex];
    }

    async getOptionsForCurrentCard() {
        const card = this.getCurrentCard();
        if (!card) return []; 

        const { data: wrongOptions } = await this.supabase
            .from('flashcards')
            .select('translation')
            .neq('translation', card.translation)
            .limit(3);

        let options = (wrongOptions || []).map(o => o.translation);
        options.push(card.translation);
        
        return options.sort(() => Math.random() - 0.5);
    }

    async handleAnswer(selectedTranslation) {
        const card = this.getCurrentCard();
        if (!card) return false;

        const isCorrect = selectedTranslation === card.translation;
        
        if (isCorrect) {
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

        // Passa para a próxima carta. Só vai retornar null na renderCard() quando o deck do usuario zerar.
        this.currentCardIndex++;
        return isCorrect;
    }
}
