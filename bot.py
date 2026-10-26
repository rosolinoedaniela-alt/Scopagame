
import os
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes

TOKEN = os.getenv("BOT_TOKEN")

async def nuova_partita(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = [[InlineKeyboardButton("🎮 Avvia Partita (Scopa)", url="https://rosolinodaniela-alt.github.io/Scopagame/")]]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.message.reply_text("Ecco la nuova partita a Scopa! Clicca qui sotto per giocare:", reply_markup=reply_markup)

if __name__ == "__main__":
    app = ApplicationBuilder().token(TOKEN).build()
    app.add_handler(CommandHandler("nuovapartita", nuova_partita))
    print("Bot avviato!")
    app.run_polling()
