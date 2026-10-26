import os
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ApplicationBuilder, CommandHandler, CallbackQueryHandler, ContextTypes

TOKEN = os.getenv("BOT_TOKEN")

# Dizionario per memorizzare le partite attive nei vari gruppi/chat
partite_attive = {}

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

        await query.edit_message_text(
            f"✅ Partita avviata tra **{partita['giocatore1']['nome']}** e **{partita['giocatore2']['nome']}**!\n\n"
            f"Stiamo preparando le carte...",
            parse_mode="Markdown"
        )
