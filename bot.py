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
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ApplicationBuilder, CommandHandler, CallbackQueryHandler, ContextTypes

TOKEN = os.getenv("BOT_TOKEN")

# Dizionario per memorizzare le partite attive nei vari gruppi/chat
partite_attive = {}

def crea_mazzo():
    semi = ['Denari', 'Coppe', 'Spade', 'Bastoni']
    mazzo = []
    for seme in semi:
        for valore in range(1, 11):
            mazzo.append({"valore": valore, "seme": seme})
    random.shuffle(mazzo)
    return mazzo

async def nuova_partita(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    user = update.effective_user
    user_name = user.first_name

    # Inizializziamo la partita per questa chat
    partite_attive[chat_id] = {
        "giocatore1": {"id": user.id, "nome": user_name, "carte": []},
        "giocatore2": None,
        "stato": "attesa_avversario",
        "tavolo": []
    }

    keyboard = [
        [InlineKeyboardButton("🎮 Unisciti alla Partita", callback_data="unisciti")]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)

    await update.message.reply_text(
        f"🃏 **{user_name}** ha aperto un tavolo di Scopa!\n"
        f"Chi vuole sfidarlo? Clicca qui sotto per unirti:",
        reply_markup=reply_markup,
        parse_mode="Markdown"
    )

async def button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    chat_id = update.effective_chat.id
    user = update.effective_user

    if chat_id not in partite_attive:
        await query.edit_message_text("❌ Questa partita è scaduta o non è più attiva. Avviane una nuova con /nuovapartita")
        return

    partita = partite_attive[chat_id]

    if query.data == "unisciti":
        if partita["stato"] != "attesa_avversario":
            await query.answer("C'è già un avversario in questa partita!", show_alert=True)
            return
        
        if user.id == partita["giocatore1"]["id"]:
            await query.answer("Non puoi giocare da solo contro te stesso!", show_alert=True)
            return

        partita["giocatore2"] = {"id": user.id, "nome": user.first_name, "carte": []}
        partita["stato"] = "in_gioco"

        # Creiamo il mazzo napoletano e distribuiamo le carte
        mazzo = crea_mazzo()
        partita["tavolo"] = [mazzo.pop() for _ in range(4)]
        partita["giocatore1"]["carte"] = [mazzo.pop() for _ in range(3)]
        partita["giocatore2"]["carte"] = [mazzo.pop() for _ in range(3)]
        partita["mazzo"] = mazzo

        tavolo_str = ", ".join([f"{c['valore']} di {c['seme']}" for c in partita['tavolo']])
        
        await query.edit_message_text(
            f"✅ Partita avviata tra **{partita['giocatore1']['nome']}** e **{partita['giocatore2']['nome']}**!\n\n"
            f"🎴 **Carte sul tavolo:**\n{tavolo_str}\n\n"
            f"Le carte sono state distribuite con successo!",
            parse_mode="Markdown"
        )

if __name__ == "__main__":
    app = ApplicationBuilder().token(TOKEN).build()
    app.add_handler(CommandHandler("nuovapartita", nuova_partita))
    app.add_handler(CallbackQueryHandler(button_handler))
    app.run_polling()
