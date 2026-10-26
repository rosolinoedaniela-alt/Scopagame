import os
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes

async def nuovapartita(update: Update, context: ContextTypes.DEFAULT_TYPE):
    # L'indirizzo esatto della tua Web App su GitHub Pages
    web_app_url = "https://rosolinoedaniela-alt.github.io/Scopagame/"
    
    keyboard = [
        [InlineKeyboardButton("🎴 Apri Tavolo da Gioco", web_app=WebAppInfo(url=web_app_url))]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await update.message.reply_text(
        "MONOPOLYGOITA PRESENTA\n♠️ SCOPA ♣️\nTavolo pronto! Clicca qui sotto per iniziare la partita:",
        reply_markup=reply_markup
    )

if __name__ == '__main__':
    # Legge il token dalle variabili d'ambiente di Render
    token = os.environ.get("BOT_TOKEN")
    
    if not token:
        raise ValueError("ATTENZIONE: La variabile d'ambiente BOT_TOKEN non è configurata su Render!")

    app = ApplicationBuilder().token(token).build()
    app.add_handler(CommandHandler("nuovapartita", nuovapartita))
    
    print("Bot avviato e in ascolto!")
    app.run_polling()
