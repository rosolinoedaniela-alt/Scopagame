import os
import logging
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import Application, CommandHandler, ContextTypes

# Configurazione dei log
logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s", level=logging.INFO
)
logger = logging.getLogger(__name__)

# Funzione per gestire il comando /nuovapartita e aprire la Web App
async def nuovapartita(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    # Link ufficiale del tuo frontend su GitHub Pages
    web_app_url = "https://rosolinoedaniela-alt.github.io/Scopagame/"
    
    keyboard = [
        [InlineKeyboardButton("🎮 Gioca a Scopa", web_app=WebAppInfo(url=web_app_url))]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await update.message.reply_text(
        "Tavolo da Scopa pronto! Clicca sul pulsante qui sotto per iniziare la partita:",
        reply_markup=reply_markup
    )

# Gestore degli errori per evitare che il bot si spenga silenziosamente
async def error_handler(object, context: ContextTypes.DEFAULT_TYPE) -> None:
    logger.error(msg="Exception while handling an update:", exc_info=context.error)

def main() -> None:
    # Recupera il token dalle variabili d'ambiente di Render
    token = os.environ.get("BOT_TOKEN")
    
    if not token:
        logger.error("BOT_TOKEN non trovato nelle variabili d'ambiente!")
        return

    # Inizializzazione dell'applicazione Telegram
    application = Application.builder().token(token).build()

    # Registrazione dei comandi
    application.add_handler(CommandHandler("nuovapartita", nuovapartita))
    
    # Registrazione dell'error handler
    application.add_error_handler(error_handler)

    logger.info("Il bot è stato avviato correttamente ed è in ascolto...")
    
    # Avvio del polling per mantenere il bot attivo
    application.run_polling(allowed_updates=Update.ALL_TYPES)

if __name__ == "__main__":
    main()
