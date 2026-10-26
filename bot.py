
import os
import logging

from telegram import (
    Update,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    WebAppInfo,
)
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
)

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)

URL_GIOCO = "https://rosolinoedaniela-alt.github.io/Scopagame/"


async def apri_scopa(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
):
    chat = update.effective_chat
    if chat is None or update.effective_message is None:
        return

    if chat.type == "private":
        pulsante = InlineKeyboardButton(
            text="🎮 Gioca a Scopa",
            web_app=WebAppInfo(url=URL_GIOCO),
        )
    else:
        pulsante = InlineKeyboardButton(
            text="🎮 Apri la Scopa",
            url=URL_GIOCO,
        )

    tastiera = InlineKeyboardMarkup([[pulsante]])

    await update.effective_message.reply_text(
        "🃏 Benvenuto alla Scopa di Dany!\n\n"
        "Tocca il pulsante per aprire il tavolo da gioco.",
        reply_markup=tastiera,
    )


async def start(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
):
    await apri_scopa(update, context)


async def nuova_partita(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
):
    await apri_scopa(update, context)


def main():
    token = os.environ.get("BOT_TOKEN")

    if not token:
        logging.error(
            "Manca la variabile BOT_TOKEN nelle impostazioni del bot."
        )
        return

    app = Application.builder().token(token).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(
        CommandHandler("nuovapartita", nuova_partita)
    )
    app.add_handler(CommandHandler("scopa", apri_scopa))

    logging.info("Bot di Dany avviato.")
    app.run_polling()


if __name__ == "__main__":
    main()
