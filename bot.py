from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import ContextTypes

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
