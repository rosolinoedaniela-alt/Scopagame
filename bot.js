const { Telegraf, Markup } = require('telegraf');
8821144054:AAG0SourrPS
const bot = new Telegraf('8821144054:AAG0SourrPSxSSsw6F9AVgC6uVEd79j8i7Q');


let gameRoom = {
  players: [],
  maxPlayers: 2
};

bot.command('inizia', (ctx) => {
  updateGameMessage(ctx);
});

bot.action('join_game', (ctx) => {
  const user = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;

  if (!gameRoom.players.includes(user) && gameRoom.players.length < gameRoom.maxPlayers) {
    gameRoom.players.push(user);
    ctx.answerCbQuery('Ti sei seduto al tavolo!');
  } else if (gameRoom.players.includes(user)) {
    ctx.answerCbQuery('Sei già seduto in questa partita!');
  } else {
    ctx.answerCbQuery('La stanza è al completo!');
  }
  updateGameMessage(ctx, true);
});

bot.action('leave_game', (ctx) => {
  const user = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
  gameRoom.players = gameRoom.players.filter(p => p !== user);
  ctx.answerCbQuery('Hai abbandonato il tavolo.');
  updateGameMessage(ctx, true);
});

function updateGameMessage(ctx, edit = false) {
  let playerListText = gameRoom.players.length > 0 
    ? gameRoom.players.map((p, index) => `${index + 1}. ${p}`).join('\n')
    : 'Nessun giocatore seduto.';

  const messageText = `🂡 **PARTITA DI SCOPA IN CORSO** 🂡\n\n**Giocatori seduti:**\n${playerListText}`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🎮 Entra in partita', 'join_game')],
    [Markup.button.callback('🚪 Abbandona', 'leave_game')],
    [Markup.button.url('🎲 Apri Tavolo WebApp', 'https://rosolinoedaniana-alt.github.io')]
  ]);

  if (edit) {
    ctx.editMessageText(messageText, { parse_mode: 'Markdown', ...keyboard }).catch(() => {});
  } else {
    ctx.reply(messageText, { parse_mode: 'Markdown', ...keyboard });
  }
}

bot.launch();
