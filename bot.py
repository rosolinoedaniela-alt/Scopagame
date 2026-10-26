import os
from http.server import HTTPServer, BaseHTTPRequestHandler
import threading
import random

# Mini server web per soddisfare Render
class SimpleHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"Bot is alive!")

def run_web_server():
    port = int(os.environ.get("PORT", 10000))
    server = HTTPServer(("0.0.0.0", port), SimpleHandler)
    server.serve_forever()

# Avviamo il server web in background
threading.Thread(target=run_web_server, daemon=True).start()

# --- Importazioni Telegram e logica del bot ---
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes

TOKEN = os.getenv("BOT_TOKEN")

# Dizionario per memorizzare le partite attive nei vari gruppi/chat
partite_attive = {}

# Il tuo link di GitHub Pages per la Web App
URL_WEBAPP = "https://rosolinoedaniela-alt.github.io/Scopagame/"

async def nuova_partita(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    user = update.effective_user
    user_name = user.first_name

    # Pulsante per aprire la Web App con il panno verde e le carte napoletane
    keyboard = [
        [InlineKeyboardButton("🎴 Apri Tavolo da Gioco", web_app=WebAppInfo(url=URL_WEBAPP))]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)

    await update.message.reply_text(
        f"🃏 **{user_name}** ha aperto un tavolo di Scopa!\n"
        f"Clicca qui sotto per entrare nel tavolo verde con le carte napoletane insieme a Jennifer:",
        reply_markup=reply_markup,
        parse_mode="Markdown"
    )

if __name__ == "__main__":
    app = ApplicationBuilder().token(TOKEN).build()
    app.add_handler(CommandHandler("nuovapartita", nuova_partita))
    app.run_polling()
