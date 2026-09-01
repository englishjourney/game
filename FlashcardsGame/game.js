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

        // Busca os cards baseados nos stacks
        const { data } = await this.supabase
            .from('flashcards')
            .select('*')
            .in('stack', this.room.stacks);
        
        // Embaralha as cartas
        this.cards = data.sort(() => Math.random() - 0.5);
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
            const { data: currentRoom } = await this.supabase
                .from('flashcardsGame')
                .select(this.myTeam)
                .eq('roomID', this.room.roomID)
                .single();
            
            const newScore = currentRoom[this.myTeam] + 1;
            
            await this.supabase
                .from('flashcardsGame')
                .update({ [this.myTeam]: newScore })
                .eq('roomID', this.room.roomID);
        }

        this.currentCardIndex++;
        return isCorrect;
    }
}
