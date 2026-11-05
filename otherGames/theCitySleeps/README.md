# The City Sleeps

Multiplayer social-deduction game for EnglishJourney. The interface and in-game language are English; key roles and categories expose Portuguese translations through hover tooltips.

## Structure

- \`index.html\` — lobby, player panels, phase containers, and dialogs.
- \`style.css\` — responsive night-city interface and translation tooltips.
- \`app.js\` — browser UI, polling, player actions, and mini-game iframe launcher.
- \`../../supabaseClient.js\` — existing EnglishJourney Supabase client.
- \`../../auth.js\` — existing student login session; The City Sleeps adds a short-lived game-specific session token.
- \`supabase/functions/the-city-sleeps/index.ts\` — server-authoritative room and round logic.
- \`supabase/migrations/20261104200739_create_the_city_sleeps.sql\` — database schema.

## Security model

Roles, categories, night actions, votes, and private messages are stored in tables with Row Level Security enabled and direct access revoked from \`anon\` and \`authenticated\`. The Edge Function uses the service-role key server-side and requires a random 256-bit game session token for player actions. Only the current player's own role and private messages are returned to that player's browser. Never put the service-role key in frontend code.

## Room rules

- Room codes are 4 unique characters: 2 letters and 2 digits, shuffled.
- Open rooms appear in the waiting-room list; private rooms require a code and password.
- Host is a player. Rooms support 6–30 players.
- Villain and Neutral slots: \`max(1, floor(playerCount / 6))\` each.
- Additional Citizen powers are unlocked as player count increases; remaining Citizen slots become Ordinary Citizens.
- Role reveal is private. Night actions have a 60-second deadline; missing actions become Skip. Discussion lasts 2 minutes. Voting resolves when all living players vote.

## Included mini-games

Ordinary Citizens are assigned one existing activity per night from Memory, Colors, Catching Foods, Simon Says, Who Is?, WH-Words, Cognates, and Connectors. The activity opens in an in-game modal.

## Notes

The game uses short polling rather than exposing private game tables through database subscriptions. Phase transitions are resolved by the Edge Function when connected players poll the room state. The current implementation should be tested with a full 6-player session before classroom use.


## Local computer test mode

- Click the **CS logo** in the top-left corner while signed in and on the game home screen to create a private local test lobby with five computer-controlled characters.
- The test lobby uses the game interface and phases, while bot profiles, roles, actions, votes, and results are held only in browser memory.
- No fake student accounts or game records are inserted into Supabase. Exiting the test clears the simulation.
- Night actions and votes are simulated locally. This mode is useful for trying the interface and game flow, but it does not test the Supabase Edge Function or database persistence.
