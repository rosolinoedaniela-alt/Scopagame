import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const WEBHOOK_SECRET = (Deno.env.get("SCOPA_STAGING_WEBHOOK_SECRET") ?? "").trim();
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const APP_URL = "https://scopa-multiplayer-staging.onrender.com/";
const BOT_USERNAME = "Danymyscopa_bot";
const OWNER_ID = "5239598613";
const JENNIFER_ID = "8439978259";
const isGroupManagerId = (id:unknown) => String(id)===OWNER_ID || String(id)===JENNIFER_ID;
const BOT_TOKEN_CANDIDATES = [
  { name: "SCOPA_STAGING_BOT_TOKEN", value: (Deno.env.get("SCOPA_STAGING_BOT_TOKEN") ?? "").trim() },
  { name: "TELEGRAM_BOT_TOKEN", value: (Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "").trim() },
  { name: "BOT_TOKEN", value: (Deno.env.get("BOT_TOKEN") ?? "").trim() },
  { name: "SCOPA_BOT_TOKEN", value: (Deno.env.get("SCOPA_BOT_TOKEN") ?? "").trim() },
  { name: "SCOPA_TELEGRAM_BOT_TOKEN", value: (Deno.env.get("SCOPA_TELEGRAM_BOT_TOKEN") ?? "").trim() }
].filter((candidate, index, all) => candidate.value && all.findIndex(other => other.value === candidate.value) === index);
let BOT_TOKEN = (Deno.env.get("BOT_TOKEN") ?? "").trim();
let BOT_TOKEN_SOURCE = BOT_TOKEN ? "BOT_TOKEN" : "";
let tokenResolution: Promise<{ok:boolean;source:string|null;checks:any[]}> | null = null;
async function ensureBotToken(): Promise<{ok:boolean;source:string|null;checks:any[]}> {
  if (BOT_TOKEN) return { ok: true, source: BOT_TOKEN_SOURCE, checks: [] };
  if (tokenResolution) return await tokenResolution;
  tokenResolution = (async () => {
    const results = await Promise.all(BOT_TOKEN_CANDIDATES.map(async (candidate) => {
      const started = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      try {
        const response = await fetch(`https://api.telegram.org/bot${candidate.value}/getMe`, {
          method: "GET",
          headers: { "accept": "application/json" },
          cache: "no-store",
          signal: controller.signal
        });
        const data:any = await response.json().catch(() => ({}));
        const username = typeof data.result?.username === "string" ? data.result.username : null;
        const accepted = response.ok && data.ok === true && username?.toLowerCase() === BOT_USERNAME.toLowerCase();
        return {
          secretName: candidate.name,
          configured: true,
          accepted,
          botUsername: username,
          httpStatus: response.status,
          errorCode: data.error_code ?? null,
          elapsedMs: Date.now() - started
        };
      } catch (error) {
        return {
          secretName: candidate.name,
          configured: true,
          accepted: false,
          networkError: controller.signal.aborted ? "Timeout dopo 20 secondi verso api.telegram.org" : (error instanceof Error ? error.message : "network error"),
          elapsedMs: Date.now() - started
        };
      } finally {
        clearTimeout(timer);
      }
    }));
    const accepted = results.find(check => check.accepted);
    if (accepted) {
      const chosen = BOT_TOKEN_CANDIDATES.find(candidate => candidate.name === accepted.secretName);
      if (chosen) {
        BOT_TOKEN = chosen.value;
        BOT_TOKEN_SOURCE = chosen.name;
      }
    }
    return { ok: !!BOT_TOKEN, source: BOT_TOKEN_SOURCE || null, checks: results };
  })();
  try {
    return await tokenResolution;
  } finally {
    tokenResolution = null;
  }
}
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, authorization", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };

type Card = { id: number; rank: number; suit: string; file: string };
type Game = { deck: Card[]; board: Card[]; hands: {player1:Card[];player2:Card[]}; captured:{player1:Card[];player2:Card[]}; scopes:{player1:number;player2:number}; scopeTotals?:{player1:number;player2:number}; scores:{player1:number;player2:number}; turn:'player1'|'player2'; lastCapturer:'player1'|'player2'|null; lastMove?:{card:Card;player:'player1'|'player2';at:number}|null; history:string[]; scopaEvent:number; scopaBy:'player1'|'player2'|null };
const suits = ["denari", "coppe", "spade", "bastoni"];
const ranks = ["Asso","Due","Tre","Quattro","Cinque","Sei","Sette","Otto","Nove","Dieci"];
function deckOfCards(): Card[] { const d:Card[]=[]; for(let s=0;s<4;s++)for(let r=0;r<10;r++){const n=s*10+r+1;d.push({id:n,rank:r+1,suit:suits[s],file:String(n).padStart(2,'0')+' '+ranks[r]+' di '+(s===3&&r===9?'Bastoni':suits[s])+'.jpg'});} for(let i=d.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[d[i],d[j]]=[d[j],d[i]];}return d; }
function newGame():Game { const deck=deckOfCards(); return {deck,board:[deck.pop()!,deck.pop()!,deck.pop()!,deck.pop()!],hands:{player1:[deck.pop()!,deck.pop()!,deck.pop()!],player2:[deck.pop()!,deck.pop()!,deck.pop()!]},captured:{player1:[],player2:[]},scopes:{player1:0,player2:0},scopeTotals:{player1:0,player2:0},scores:{player1:0,player2:0},turn:'player1',lastCapturer:null,lastMove:null,history:[],scopaEvent:0,scopaBy:null}; }
function combinations(board:Card[], rank:number):number[][] { const out:number[][]=[]; function walk(i:number,sum:number,ids:number[]){if(sum===rank&&ids.length){out.push([...ids]);return;}if(sum>=rank)return;for(let j=i;j<board.length;j++)walk(j+1,sum+board[j].rank,[...ids,board[j].id]);}walk(0,0,[]);return out; }
function primiera(cards:Card[]):number { const vals:Record<number,number>={1:16,2:12,3:13,4:14,5:15,6:18,7:21,8:10,9:10,10:10};const best:Record<string,number>={denari:0,coppe:0,spade:0,bastoni:0};for(const c of cards)best[c.suit]=Math.max(best[c.suit],vals[c.rank]||0);if(Object.values(best).some(v=>v===0))return 0;return Object.values(best).reduce((a,b)=>a+b,0); }
function tally(g:Game):{scores:{player1:number;player2:number};detail:string}{const all1=g.captured.player1,all2=g.captured.player2;const out={player1:0,player2:0};const lines:string[]=[];function add(k:'player1'|'player2',label:string,n:number){if(n){out[k]+=n;lines.push(`${k==='player1'?'Giocatore 1':'Giocatore 2'} +${n} (${label})`);}}
if(all1.length>all2.length)add('player1','carte',1);else if(all2.length>all1.length)add('player2','carte',1);
const d1=all1.filter(c=>c.suit==='denari').length,d2=all2.filter(c=>c.suit==='denari').length;if(d1>d2)add('player1','denari',1);else if(d2>d1)add('player2','denari',1);
if(all1.some(c=>c.suit==='denari'&&c.rank===7))add('player1','Settebello',1);if(all2.some(c=>c.suit==='denari'&&c.rank===7))add('player2','Settebello',1);
const p1=primiera(all1),p2=primiera(all2);if(p1>p2)add('player1','primiera',1);else if(p2>p1)add('player2','primiera',1);
add('player1','scope',g.scopes.player1);add('player2','scope',g.scopes.player2);return {scores:out,detail:lines.join('\n')||'Nessun punto assegnato'};}
async function telegram(method:string,payload:Record<string,unknown>){
 const tokenStatus=await ensureBotToken();
 if(!tokenStatus.ok)throw new Error('Telegram non riconosce alcun token configurato per @'+BOT_USERNAME+'. Controlla i segreti esistenti, senza generarne uno nuovo.');
 let lastError='';
 const attempts=method==='setWebhook'?2:1;
 for(let attempt=1;attempt<=attempts;attempt++){
  const controller=new AbortController();
  const timeoutMs=method==='sendMessage'?25000:10000;
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
   const response=await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
   const result=await response.json();
   if(result.ok)return result;
   lastError=result.description||'richiesta non riuscita';
   console.error('Telegram API error',method,result,'attempt',attempt);
   if(method!=='setWebhook'||![502,503,504].includes(Number(result.error_code))||attempt===attempts)throw new Error(`Telegram ${method}: ${lastError}`);
  }catch(error){
   lastError=error instanceof Error?error.message:'errore di rete';
   console.error('Telegram request failed',method,lastError,'attempt',attempt);
   if(method!=='setWebhook'||attempt===attempts)throw new Error(`Telegram ${method}: ${lastError}`);
  }finally{
   clearTimeout(timer);
  }
  await new Promise(resolve=>setTimeout(resolve,attempt*1200));
 }
 throw new Error(`Telegram ${method}: ${lastError}`);
}
async function botProfilePhotoFileId():Promise<string>{
 const me=await telegram('getMe',{});
 const botId=Number(me.result?.id||0);
 if(!botId)throw new Error('ID bot non disponibile per recuperare la foto.');
 const photos=await telegram('getUserProfilePhotos',{user_id:botId,limit:1});
 const sizes=photos.result?.photos?.[0]||[];
 const photo=sizes[sizes.length-1];
 if(!photo?.file_id)throw new Error('Foto profilo del bot non disponibile.');
 return String(photo.file_id);
}
async function sendRoomAnnouncement(chatId:number,caption:string,gameLink:string,watchLink:string){
 const reply_markup={inline_keyboard:[[{text:'GIOCA',url:gameLink}],[{text:'GUARDA E CHATTA',url:watchLink}]]};
 try{
  const photo=await botProfilePhotoFileId();
  return await telegram('sendPhoto',{chat_id:chatId,photo,caption,reply_markup});
 }catch(photoError){
  console.error('Room photo unavailable; text fallback',photoError);
  return await telegram('sendMessage',{chat_id:chatId,text:caption,reply_markup});
 }
}
async function sendTournamentOpeningPoster(chatId:number,tournamentId:string){
 const photo=await botProfilePhotoFileId();
 const caption='🏆 TORNEO · by Dany\\n\\nPremi ISCRIVITI per partecipare. Quando l’organizzatrice chiude le iscrizioni, il bot sorteggia automaticamente le coppie. Ogni coppia può giocare la mano successiva appena tutte le coppie ancora in gara hanno completato quella precedente.';
 return await telegram('sendPhoto',{chat_id:chatId,photo,caption,reply_markup:{inline_keyboard:[
  [{text:'ISCRIVITI AL TORNEO',callback_data:'scopatorneo:join:'+tournamentId}],
  [{text:'ANNULLA ISCRIZIONE',callback_data:'scopatorneo:withdraw:'+tournamentId}]
 ]}});
}
async function sendTournamentWinnerPoster(chatId:number,champion:string){
 const me=await telegram('getMe',{});
 const botId=Number(me.result?.id||0);
 if(!botId)throw new Error('ID bot non disponibile per recuperare l’immagine della locandina.');
 const photos=await telegram('getUserProfilePhotos',{user_id:botId,limit:1});
 const sizes=photos.result?.photos?.[0]||[];
 const photo=sizes[sizes.length-1];
 if(!photo?.file_id)throw new Error('Immagine profilo del bot non disponibile: locandina non inviata.');
 return await telegram('sendPhoto',{
  chat_id:chatId,
  photo:photo.file_id,
  caption:'🏆 TORNEO CONCLUSO\\n🥇 VINCITRICE: '+champion+'\\n MONOPOLYGOITA SCOPA  by Dany'
 });
}
async function verifyInitData(raw:string){if(!raw)throw new Error('Apri il gioco dal pulsante del bot in Telegram.');const tokenStatus=await ensureBotToken();if(!tokenStatus.ok)throw new Error('Il token Telegram configurato non è valido per @Danymyscopa_bot.');const params=new URLSearchParams(raw);const hash=params.get('hash');if(!hash)throw new Error('Dati Telegram mancanti.');params.delete('hash');const authDate=Number(params.get('auth_date')||0);if(!authDate||Math.abs(Date.now()/1000-authDate)>86400)throw new Error('Sessione Telegram scaduta. Riapri il gioco dal bot.');const check=[...params.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');const enc=new TextEncoder();const keyMaterial=await crypto.subtle.importKey('raw',enc.encode('WebAppData'),{name:'HMAC',hash:'SHA-256'},false,['sign']);const secret=new Uint8Array(await crypto.subtle.sign('HMAC',keyMaterial,enc.encode(BOT_TOKEN)));const key=await crypto.subtle.importKey('raw',secret,{name:'HMAC',hash:'SHA-256'},false,['sign']);const sig=new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(check)));const got=[...sig].map(b=>b.toString(16).padStart(2,'0')).join('');if(got!==hash)throw new Error('Verifica Telegram non valida. Riapri il gioco dal bot.');const user=JSON.parse(params.get('user')||'{}');if(!user.id)throw new Error('Utente Telegram non disponibile.');return {id:Number(user.id),name:user.username?`@${user.username}`:[user.first_name,user.last_name].filter(Boolean).join(' ')||`Giocatore ${user.id}`};}
const VOICE_BUCKET='scopa-voice-messages';
async function ensureVoiceBucket(){
 const {data,error}=await db.storage.getBucket(VOICE_BUCKET);
 if(data)return;
 const {error:createError}=await db.storage.createBucket(VOICE_BUCKET,{public:false,fileSizeLimit:2*1024*1024,allowedMimeTypes:['audio/webm','audio/ogg','audio/mp4','audio/mpeg']});
 if(createError&&!/already exists|duplicate/i.test(String(createError.message||'')))throw createError;
}
async function getRoom(roomCode:string){const {data,error}=await db.from('scopa_telegram_rooms').select('*').eq('room_code',roomCode).maybeSingle();if(error)throw error;if(!data)throw new Error('Stanza non trovata. Avvia una nuova partita dal gruppo.');return data;}
function playerKey(room:any,uid:number):'player1'|'player2'|null{if(Number(room.player1_telegram_id)===uid)return 'player1';if(Number(room.player2_telegram_id)===uid)return 'player2';return null;}
function publicState(room:any,uid:number,spectator=false){
 const you=playerKey(room,uid);
 if(!you&&!spectator)throw new Error('Non sei tra i due giocatori di questa stanza.');
 const g=room.state as Game;
 const scores=g?.scores||{player1:0,player2:0};
 const handCounts={player1:g?.hands?.player1?.length||0,player2:g?.hands?.player2?.length||0};
 const handPoints=room.status==='playing'&&g?.captured&&g?.scopes?tally(g).scores:{player1:0,player2:0};
 const liveScores={player1:Number(scores.player1||0)+Number(handPoints.player1||0),player2:Number(scores.player2||0)+Number(handPoints.player2||0)};
 const common={roomCode:room.room_code,status:room.status,mode:room.mode||'complete',telegramUserId:uid,players:{player1:{name:room.player1_name},player2:{name:room.player2_name}},scores,liveScores,scopeTotals:g?.scopeTotals||g?.scopes||{player1:0,player2:0},lastMove:g?.lastMove||null,turn:g?.turn||'player1',board:g?.board||[],handCounts,deckCount:g?.deck?.length||0,chat:room.chat||[],scopaEvent:g?.scopaEvent||0,scopaBy:g?.scopaBy||null,finishedAt:room.finished_at||null,winnerName:room.winner_telegram_id?((Number(room.winner_telegram_id)===Number(room.player1_telegram_id)?room.player1_name:room.player2_name)):null,finalSummary:room.result_message||'',handNo:room.mode==='tournament'?Math.max(1,Number((g as any)?.tournamentHandNumber||1)):Math.max(1,(g?.history?.length||0)+(room.status==='finished'?0:1))};
 if(!you)return {...common,you:null,hand:[],opponentHandCount:0};
 const opp=you==='player1'?'player2':'player1';
 return {...common,you,hand:g?.hands?.[you]||[],opponentHandCount:handCounts[opp]};
}
async function stateWithVoiceUrls(room:any,uid:number,spectator=false){
 const state:any=publicState(room,uid,spectator);
 state.chat=await Promise.all((state.chat||[]).map(async (message:any)=>{
  if(message.type!=='voice'||!message.path)return message;
  const {data,error}=await db.storage.from(VOICE_BUCKET).createSignedUrl(message.path,3600);
  if(error){console.error('Voice signed URL error',error);return {...message,audioUrl:null};}
  return {...message,audioUrl:data?.signedUrl||null};
 }));
 return state;
}
async function insertRoom(chatId:number,mode:'complete'|'single'='complete',creator:any={}){const roomCode=crypto.randomUUID().replaceAll('-','').slice(0,10).toUpperCase();const {data,error}=await db.from('scopa_telegram_rooms').insert({room_code:roomCode,group_chat_id:chatId,status:'waiting',mode,created_by_telegram_id:Number(creator.id||0)||null,created_by_name:String(creator.name||creator.first_name||'Utente Telegram'),created_by_username:creator.username?String(creator.username):null,state:{},chat:[]}).select('*').single();if(error)throw error;return data;}
async function telegramProbe(method:string,payload?:Record<string,unknown>){
 const tokenStatus=await ensureBotToken();
 if(!tokenStatus.ok)return {method,telegramOk:false,description:"Nessun token valido configurato per il bot atteso.",tokenChecks:tokenStatus.checks};
 const started=Date.now();
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),7000);
 try{
  const response=await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`,{method:payload?"POST":"GET",...(payload?{headers:{"content-type":"application/json"},body:JSON.stringify(payload)}:{}),signal:controller.signal});
  const elapsedMs=Date.now()-started;
  const raw=await response.text();
  let data:any={};try{data=JSON.parse(raw);}catch{}
  let result:any=undefined;
  if(method==="getWebhookInfo"&&data.ok){
   result={
    url:typeof data.result?.url==="string"?data.result.url:"",
    urlConfigured:!!data.result?.url,
    pendingUpdateCount:data.result?.pending_update_count??null,
    lastErrorDate:data.result?.last_error_date??null,
    lastErrorMessage:data.result?.last_error_message??null,
    allowedUpdates:Array.isArray(data.result?.allowed_updates)?data.result.allowed_updates:null
   };
  }else if(method==="getMe"&&data.ok){
   result={username:data.result?.username??null,hasMainWebApp:data.result?.has_main_web_app===true};
  }else if(method==="getChatMenuButton"&&data.ok){
   result={type:data.result?.type??null,text:data.result?.text??null,webAppUrl:data.result?.web_app?.url??null};
  }else if(method==="getMyCommands"&&data.ok){
   result={commands:Array.isArray(data.result)?data.result.map((c:any)=>({command:c.command,description:c.description??""})):[]};
  }
  return {method,httpStatus:response.status,elapsedMs,telegramOk:data.ok===true,errorCode:data.error_code??null,description:typeof data.description==="string"?data.description.slice(0,180):null,result};
 }catch(e){
  return {method,elapsedMs:Date.now()-started,error:e instanceof Error?e.message:"network error"};
 }finally{clearTimeout(timer);}
}

function chooseFairBye(players:any[]):any{
 const minByes=Math.min(...players.map((p:any)=>Number(p.advanced_by_bye||0)));
 const candidates=players.filter((p:any)=>Number(p.advanced_by_bye||0)===minByes);
 return candidates[Math.floor(Math.random()*candidates.length)];
}

async function assignAutomaticTournamentPairs(tournamentId:string,roundNumber:number,sourcePlayers:any[]){
 const eligible=sourcePlayers.filter((p:any)=>!p.eliminated);
 if(eligible.length<2)throw new Error('Servono almeno due giocatori per creare gli abbinamenti.');
 const shuffled=[...eligible];
 for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
 let bye:any=null;
 if(shuffled.length%2===1){
  bye=chooseFairBye(shuffled);
  const {error:byePlayerError}=await db.from('scopa_tournament_players').update({qualified:true,advanced_by_bye:Number(bye.advanced_by_bye||0)+1,paired_opponent_id:null}).eq('id',bye.id);
  if(byePlayerError)throw byePlayerError;
  const {error:byeMatchError}=await db.from('scopa_tournament_matches').insert({tournament_id:tournamentId,round_number:roundNumber,play_date:new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Rome'}),player1_telegram_id:Number(bye.telegram_id),player1_name:bye.display_name,status:'bye'});
  if(byeMatchError)throw byeMatchError;
  shuffled.splice(shuffled.findIndex((p:any)=>Number(p.id)===Number(bye.id)),1);
 }
 const pairs:any[]=[];
 for(let i=0;i<shuffled.length;i+=2){
  const a=shuffled[i],b=shuffled[i+1];
  if(!a||!b)continue;
  const {error:aError}=await db.from('scopa_tournament_players').update({paired_opponent_id:Number(b.telegram_id)}).eq('id',a.id);
  if(aError)throw aError;
  const {error:bError}=await db.from('scopa_tournament_players').update({paired_opponent_id:Number(a.telegram_id)}).eq('id',b.id);
  if(bError)throw bError;
  pairs.push([a,b]);
 }
 const draft={mode:'automatic',registrationsClosed:true,round_number:roundNumber,pairs:pairs.map(([a,b])=>[Number(a.telegram_id),Number(b.telegram_id)]),bye:bye?Number(bye.telegram_id):null};
 const {error:draftError}=await db.from('scopa_tournaments').update({pairing_draft:draft}).eq('id',tournamentId).eq('status','active');
 if(draftError)throw draftError;
 return {pairs,bye};
}

async function sendTournamentPairWizard(tournamentId:string,chatId:number,editMessageId?:number){
 const {data:tournament,error:tError}=await db.from('scopa_tournaments').select('*').eq('id',tournamentId).eq('status','active').maybeSingle();if(tError)throw tError;
 if(!tournament||Number(tournament.created_by)!==Number(OWNER_ID))return await telegram('sendMessage',{chat_id:chatId,text:'Questo torneo non è più attivo o non è disponibile.'});
 const {data:initialPlayers,error:pError}=await db.from('scopa_tournament_players').select('*').eq('tournament_id',tournamentId).order('joined_at',{ascending:true});if(pError)throw pError;
 let players:any[]=initialPlayers||[];
 const draft=(tournament.pairing_draft&&typeof tournament.pairing_draft==='object')?tournament.pairing_draft:{pairs:[],selected:null};
 const pairs=Array.isArray(draft.pairs)?draft.pairs:[];
 const editOriginal=Array.isArray(draft.editOriginal)?draft.editOriginal.map(Number):[];
 const editMode=draft.mode==='edit'&&draft.editStage==='reshuffle'&&editOriginal.length===4;
 if(!editMode&&pairs.length===0&&!draft.selected){
  const {data:existingByes,error:byeCheckError}=await db.from('scopa_tournament_matches').select('id').eq('tournament_id',tournamentId).eq('round_number',Number(tournament.current_round)).eq('status','bye').limit(1);if(byeCheckError)throw byeCheckError;
  const available=players.filter((p:any)=>!p.eliminated&&!p.qualified&&!p.paired_opponent_id);
  if(!existingByes?.length&&available.length%2===1){
   const bye=chooseFairBye(available);
   const {error:byePlayerError}=await db.from('scopa_tournament_players').update({qualified:true,advanced_by_bye:Number(bye.advanced_by_bye||0)+1}).eq('id',bye.id);if(byePlayerError)throw byePlayerError;
   const {error:byeMatchError}=await db.from('scopa_tournament_matches').insert({tournament_id:tournamentId,round_number:Number(tournament.current_round),play_date:new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Rome'}),player1_telegram_id:Number(bye.telegram_id),player1_name:bye.display_name,status:'bye'});if(byeMatchError)throw byeMatchError;
   bye.qualified=true;bye.advanced_by_bye=Number(bye.advanced_by_bye||0)+1;
  }
 }
 const used=new Set<number>();for(const pair of pairs){used.add(Number(pair[0]));used.add(Number(pair[1]));}
 const editComplete=editMode&&pairs.length===2&&!draft.selected;
 const eligible=players.filter((p:any)=>!p.eliminated&&!p.qualified&&Number(p.telegram_id)!==Number(draft.selected||0)&&!used.has(Number(p.telegram_id))&&(!editMode||(!editComplete&&editOriginal.includes(Number(p.telegram_id)))));
 const names=new Map(players.map((p:any)=>[Number(p.telegram_id),String(p.display_name||'Giocatore')]));
 const lines=[(editMode?'✏️ MODIFICA DUE COPPIE · ROUND ':'🏆 PREPARA GLI ABBINAMENTI · ROUND ')+tournament.current_round];
 if(pairs.length)lines.push('',...pairs.map((p:number[],i:number)=>(i+1)+'. '+names.get(Number(p[0]))+' 🆚 '+names.get(Number(p[1]))));
 const byePlayer=players.find((p:any)=>p.qualified&&!p.eliminated&&!Number(p.paired_opponent_id||0));if(byePlayer&&!editMode)lines.push('','Passaggio automatico assegnato a: '+byePlayer.display_name+' (meno turni di riposo; a parità, sorteggio casuale).');
 if(editMode)lines.push('','Stai cambiando insieme le due coppie selezionate. Tutte le altre resteranno identiche.');if(editComplete)lines.push('','Controlla le due nuove coppie e premi PUBBLICA MODIFICHE NEL GRUPPO.');
 if(draft.selected)lines.push('','Hai scelto: '+(names.get(Number(draft.selected))||'Giocatore')+'. Ora scegli l’avversario.');
 else lines.push('','Seleziona due giocatori per la prima nuova coppia, poi gli altri due per la seconda.');
 if(eligible.length===1)lines.push('','Resta un solo giocatore: passerà automaticamente il turno quando pubblichi.');
 if(!eligible.length&&!draft.selected)lines.push('','Tutti i partecipanti disponibili sono già abbinati. Puoi pubblicare.');
 const keyboard:any[]=[];
 if(!editComplete){for(const p of eligible){keyboard.push([{text:String(p.display_name||'Giocatore').slice(0,60),callback_data:'tp:'+tournamentId+':'+Number(p.telegram_id)}]);}}
 if(draft.selected)keyboard.push([{text:'ANNULLA PRIMA SCELTA',callback_data:'tpa:'+tournamentId}]);
 if(editComplete)keyboard.push([{text:'PUBBLICA MODIFICHE NEL GRUPPO',callback_data:'tpp:'+tournamentId}]);else if(!editMode&&eligible.length<=1&&!draft.selected&&pairs.length)keyboard.push([{text:'PUBBLICA ABBINAMENTI',callback_data:'tpp:'+tournamentId}]);
 keyboard.push([{text:'ANNULLA PREPARAZIONE',callback_data:'tpc:'+tournamentId}]);
 const payload:any={chat_id:chatId,text:lines.join('\n'),reply_markup:{inline_keyboard:keyboard}};
 if(editMessageId)await telegram('editMessageText',{...payload,message_id:editMessageId});else await telegram('sendMessage',payload);
}

async function sendTournamentEditMenu(tournamentId:string,chatId:number){
 const {data:tournament,error:tError}=await db.from('scopa_tournaments').select('id,current_round,created_by,pairing_draft').eq('id',tournamentId).eq('status','active').maybeSingle();if(tError)throw tError;
 if(!tournament||Number(tournament.created_by)!==Number(OWNER_ID)){await telegram('sendMessage',{chat_id:chatId,text:'Non c’è un torneo attivo modificabile.'});return;}
 const {data:players,error:pError}=await db.from('scopa_tournament_players').select('telegram_id,display_name,paired_opponent_id,eliminated,qualified').eq('tournament_id',tournamentId).order('joined_at',{ascending:true});if(pError)throw pError;
 const byId=new Map((players||[]).map((p:any)=>[Number(p.telegram_id),p]));
 const pairs:any[]=[];const seen=new Set<number>();
 for(const p of (players||[])){const id=Number(p.telegram_id),opp=Number(p.paired_opponent_id||0);if(opp&&id<opp&&!seen.has(id)&&!seen.has(opp)){const other:any=byId.get(opp);if(other){pairs.push({id,opp,name:String(p.display_name||'Giocatore'),other:String(other.display_name||'Giocatore')});seen.add(id);seen.add(opp);}}}
 const draft=(tournament as any).pairing_draft&&typeof (tournament as any).pairing_draft==='object'?(tournament as any).pairing_draft:{};
 const choosingSecond=draft.mode==='edit'&&draft.editStage==='choose_second'&&Array.isArray(draft.editOriginal)&&draft.editOriginal.length===2;
 const firstIds=choosingSecond?draft.editOriginal.map(Number):[];
 const lines=[choosingSecond?'✏️ MODIFICA ABBINAMENTI · SECONDA COPPIA':'✏️ MODIFICA ABBINAMENTI · ROUND '+tournament.current_round,'',choosingSecond?'Hai scelto la prima coppia. Ora seleziona una seconda coppia: le quattro persone potranno essere riabbinate tra loro.':'Seleziona la prima coppia. Subito dopo dovrai selezionare anche una seconda coppia, così potrai scambiare gli abbinamenti tra i quattro giocatori.'];
 if(!pairs.length)lines.push('','Non ci sono coppie già assegnate da modificare.');
 const availablePairs=pairs.filter((p:any)=>!choosingSecond||(!firstIds.includes(p.id)&&!firstIds.includes(p.opp)));
 const keyboard:any[][]=availablePairs.map((p:any,i:number)=>[{text:(i+1)+'. '+p.name+' 🆚 '+p.other,callback_data:'te:'+tournamentId+':'+p.id+':'+p.opp}]);
 keyboard.push([{text:'CHIUDI',callback_data:'tec:'+tournamentId}]);
 await telegram('sendMessage',{chat_id:chatId,text:lines.join('\n'),reply_markup:{inline_keyboard:keyboard}});
}

async function handleTelegramUpdate(req:Request){const secretHeader=req.headers.get('x-telegram-bot-api-secret-token');const update=await req.json();
if(!WEBHOOK_SECRET||secretHeader!==WEBHOOK_SECRET){console.error('Telegram webhook secret mismatch',JSON.stringify({updateId:update.update_id??null,secretHeaderPresent:!!secretHeader}));return new Response('unauthorized',{status:401});}
if(update.my_chat_member){
 const ev=update.my_chat_member;const chat=ev.chat||{};const actor=ev.from||{};const oldMember=ev.old_chat_member||{};const nextStatus=ev.new_chat_member?.status;const oldStatus=oldMember.status;
 const wasAbsent=['left','kicked'].includes(oldStatus)||(oldStatus==='restricted'&&oldMember.is_member===false);
 const newlyAdded=wasAbsent&&['member','administrator'].includes(nextStatus);
 if(chat.id&&['group','supergroup'].includes(chat.type)&&newlyAdded){
  const actorId=Number(actor.id||0);const actorName=actor.username?'@'+actor.username:[actor.first_name,actor.last_name].filter(Boolean).join(' ')||'non disponibile';const now=new Date().toISOString();
  if(actorId===Number(OWNER_ID)){
   const {error:saveError}=await db.from('telegram_group_authorizations').upsert({chat_id:Number(chat.id),chat_title:chat.title||'Gruppo Telegram',status:'authorized',added_by_id:actorId,added_by_name:actorName,requested_at:now,decided_at:now,decided_by_id:actorId},{onConflict:'chat_id'});if(saveError)throw saveError;
   await telegram('sendMessage',{chat_id:OWNER_ID,text:'✅ Bot aggiunto da te e gruppo autorizzato: '+String(chat.title||'Gruppo Telegram').replace(/[&<>]/g,'')});
  }else{
   const {error:saveError}=await db.from('telegram_group_authorizations').upsert({chat_id:Number(chat.id),chat_title:chat.title||'Gruppo Telegram',status:'pending',added_by_id:actorId||null,added_by_name:actorName,requested_at:now,decided_at:null,decided_by_id:null},{onConflict:'chat_id'});if(saveError)throw saveError;
   const safeTitle=String(chat.title||'Gruppo Telegram').replace(/[&<>]/g,'');
   const safeActor=String(actorName).replace(/[&<>]/g,'');
   await telegram('sendMessage',{chat_id:OWNER_ID,text:'🔐 RICHIESTA AUTORIZZAZIONE BOT\\n\\nGruppo: '+safeTitle+'\\nID: '+Number(chat.id)+'\\nAggiunto da: '+safeActor+'\\n\\nVuoi autorizzare questo gruppo?',reply_markup:{inline_keyboard:[[{text:'✅ AUTORIZZA GRUPPO',callback_data:'ga:'+Number(chat.id)+':yes'}],[{text:'❌ RIFIUTA GRUPPO',callback_data:'ga:'+Number(chat.id)+':no'}]]}});
  }
 }
 return new Response('ok');
}
if(update.callback_query){
 const q=update.callback_query;const data=String(q.data||'');
 let callbackAnswered=false;
 const answerCallback=async(text:string,showAlert=false)=>{
  if(callbackAnswered)return;
  callbackAnswered=true;
  try{await telegram('answerCallbackQuery',{callback_query_id:q.id,text,show_alert:showAlert});}
  catch(e){console.error('Callback acknowledgement failed',e);}
 };
 // Acknowledge immediately so Telegram does not leave the inline button spinning
 // while database checks and tournament registration are processed.
 await answerCallback('Richiesta ricevuta…');

 if(data.startsWith('tw:')){
  const uid=Number(q.from?.id||0),groupId=Number(q.message?.chat?.id||0),tournamentId=data.split(':')[1]||'';
  if(!['group','supergroup'].includes(String(q.message?.chat?.type||''))||!isGroupManagerId(uid)){
   await telegram('sendMessage',{chat_id:groupId,text:'Solo Daniela e Jennifer possono proclamare il vincitore del torneo.'});
   return new Response('ok');
  }
  const {data:tournament,error:tournamentError}=await db.from('scopa_tournaments').select('id,status,group_chat_id').eq('id',tournamentId).eq('group_chat_id',groupId).maybeSingle();
  if(tournamentError)throw tournamentError;
  if(!tournament||tournament.status!=='finished'){
   await telegram('sendMessage',{chat_id:groupId,text:'Il torneo non risulta concluso. La proclamazione non è disponibile.'});
   return new Response('ok');
  }
  const {data:winners,error:winnersError}=await db.from('scopa_tournament_players').select('display_name,qualified,eliminated').eq('tournament_id',tournamentId).eq('qualified',true).eq('eliminated',false);
  if(winnersError)throw winnersError;
  if(!winners||winners.length!==1){
   await telegram('sendMessage',{chat_id:groupId,text:'Non riesco a identificare un unico vincitore finale. Nessuna proclamazione pubblicata.'});
   return new Response('ok');
  }
  const champion=String(winners[0].display_name||'Campione');
  try{
   await sendTournamentWinnerPoster(groupId,champion);
   await telegram('editMessageReplyMarkup',{chat_id:groupId,message_id:q.message.message_id,reply_markup:{inline_keyboard:[]}});
   await answerCallback('Vincitore proclamato!',false);
  }catch(posterError){
   console.error('Tournament winner poster failed',posterError);
   await telegram('sendMessage',{chat_id:groupId,text:'🏆 TORNEO CONCLUSO!\nVincitore: '+champion+'\nLa locandina non è stata caricata. Riprova tra poco.'});
  }
  return new Response('ok');
 }
 if(data.startsWith('ga:')){
  const uid=Number(q.from?.id||0),privateChat=q.message?.chat?.type==='private',chatId=Number(q.message?.chat?.id||0);
  const parts=data.split(':'),targetChat=Number(parts[1]||0),decision=parts[2];
  if(uid!==Number(OWNER_ID)||!privateChat||chatId!==uid||!targetChat||!['yes','no'].includes(decision)){
   await answerCallback('Solo la proprietaria può decidere.',false);return new Response('ok');
  }
  const {data:request,error:requestError}=await db.from('telegram_group_authorizations').select('*').eq('chat_id',targetChat).maybeSingle();if(requestError)throw requestError;
  if(!request||request.status!=='pending'){
   await answerCallback('Richiesta già gestita o non più disponibile.',false);return new Response('ok');
  }
  const now=new Date().toISOString(),approved=decision==='yes';
  const {error:updateError}=await db.from('telegram_group_authorizations').update({status:approved?'authorized':'rejected',decided_at:now,decided_by_id:Number(OWNER_ID)}).eq('chat_id',targetChat).eq('status','pending');if(updateError)throw updateError;
  if(approved){
   await answerCallback('Gruppo autorizzato!',false);
   await telegram('editMessageText',{chat_id:OWNER_ID,message_id:q.message.message_id,text:'✅ GRUPPO AUTORIZZATO\\n\\n'+String(request.chat_title||'Gruppo Telegram')+'\\nID: '+targetChat});
   try{await telegram('sendMessage',{chat_id:targetChat,text:'✅ Questo gruppo è stato autorizzato dalla proprietaria. Il bot è attivo.'});}catch(e){console.error('Group authorization notice failed',e);}
  }else{
   await answerCallback('Gruppo rifiutato.',false);
   try{await telegram('leaveChat',{chat_id:targetChat});}catch(e){console.error('Rejected group leave failed',e);}
   await telegram('editMessageText',{chat_id:OWNER_ID,message_id:q.message.message_id,text:'❌ GRUPPO RIFIUTATO\\n\\n'+String(request.chat_title||'Gruppo Telegram')+'\\nID: '+targetChat+'\\nIl bot ha tentato di uscire dal gruppo.'});
  }
  return new Response('ok');
 }

 if(data.startsWith('te:')||data.startsWith('tec:')||data.startsWith('tp:')||data.startsWith('tpa:')||data.startsWith('tpp:')||data.startsWith('tpc:')){
  const uid=Number(q.from?.id||0);const chatType=String(q.message?.chat?.type||'');const privateChat=chatType==='private';const chatId=Number(q.message?.chat?.id||0);
  const parts=data.split(':');const tournamentId=parts[1]||'';const editAction=data.startsWith('te:')||data.startsWith('tec:');const ownerPrivate=uid===Number(OWNER_ID)&&privateChat&&chatId===uid;const authorizedGroup=['group','supergroup'].includes(chatType)&&isGroupManagerId(uid);
  if(editAction?!ownerPrivate:!(ownerPrivate||authorizedGroup)){await answerCallback(editAction?'Non sei autorizzato a modificare gli abbinamenti.':'Non sei autorizzato a gestire gli abbinamenti.',false);return new Response('ok');}
  const {data:tournament,error:tError}=await db.from('scopa_tournaments').select('*').eq('id',tournamentId).eq('status','active').maybeSingle();if(tError)throw tError;
  if(!tournament||Number(tournament.created_by)!==Number(OWNER_ID)||(authorizedGroup&&Number(tournament.group_chat_id)!==chatId)){await answerCallback('Torneo non disponibile in questa chat.',false);return new Response('ok');}
  if(data.startsWith('tec:')){await answerCallback('Menu chiuso.',false);await telegram('editMessageText',{chat_id:chatId,message_id:q.message.message_id,text:'Menu modifica abbinamenti chiuso.'});return new Response('ok');}
  if(data.startsWith('te:')){
   const id1=Number(parts[2]||0),id2=Number(parts[3]||0);
   if(!id1||!id2||id1===id2){await answerCallback('Coppia non valida.',false);return new Response('ok');}
   const currentDraft=(tournament.pairing_draft&&typeof tournament.pairing_draft==='object')?tournament.pairing_draft:{};
   const choosingSecond=currentDraft.mode==='edit'&&currentDraft.editStage==='choose_second'&&Array.isArray(currentDraft.editOriginal)&&currentDraft.editOriginal.length===2;
   const firstIds=choosingSecond?currentDraft.editOriginal.map(Number):[];
   if(choosingSecond&&(firstIds.includes(id1)||firstIds.includes(id2))){await answerCallback('Scegli una coppia diversa dalla prima.',false);return new Response('ok');}
   const {data:matches,error:matchError}=await db.from('scopa_tournament_matches').select('id,status').eq('tournament_id',tournamentId).eq('round_number',Number(tournament.current_round)).or('and(player1_telegram_id.eq.'+id1+',player2_telegram_id.eq.'+id2+'),and(player1_telegram_id.eq.'+id2+',player2_telegram_id.eq.'+id1+')');
   if(matchError)throw matchError;
   if(matches?.length){await answerCallback('Questa coppia ha già una partita registrata: non posso modificarla.',false);return new Response('ok');}
   const {data:members,error:membersError}=await db.from('scopa_tournament_players').select('id,telegram_id,paired_opponent_id').eq('tournament_id',tournamentId).in('telegram_id',[id1,id2]);if(membersError)throw membersError;
   if(members?.length!==2||members.some((p:any)=>Number(p.paired_opponent_id)!==(Number(p.telegram_id)===id1?id2:id1))){await answerCallback('La coppia è cambiata. Riapri il menu.',false);return new Response('ok');}
   if(!choosingSecond){
    const {error:draftError}=await db.from('scopa_tournaments').update({pairing_draft:{pairs:[],selected:null,mode:'edit',editStage:'choose_second',editOriginal:[id1,id2]}}).eq('id',tournamentId);if(draftError)throw draftError;
    await answerCallback('Prima coppia scelta. Ora scegli la seconda coppia.',false);
    await telegram('editMessageText',{chat_id:chatId,message_id:q.message.message_id,text:'Prima coppia selezionata. Ora scegli una seconda coppia: potrai riabbinare tra loro tutti e quattro i giocatori.'});
    await sendTournamentEditMenu(tournamentId,chatId);return new Response('ok');
   }
   const four=[...firstIds,id1,id2];
   const {data:fourMembers,error:fourError}=await db.from('scopa_tournament_players').select('telegram_id,paired_opponent_id,eliminated,qualified').eq('tournament_id',tournamentId).in('telegram_id',four);if(fourError)throw fourError;
   if(fourMembers?.length!==4||fourMembers.some((p:any)=>p.eliminated||p.qualified)){await answerCallback('Uno dei quattro giocatori non è più disponibile.',false);return new Response('ok');}
   const {error:draftError}=await db.from('scopa_tournaments').update({pairing_draft:{pairs:[],selected:null,mode:'edit',editStage:'reshuffle',editOriginal:four}}).eq('id',tournamentId);if(draftError)throw draftError;
   await answerCallback('Quattro giocatori selezionati. Crea le due nuove coppie.',false);
   await telegram('editMessageText',{chat_id:chatId,message_id:q.message.message_id,text:'Ora crea due nuove coppie usando soltanto questi quattro giocatori. Tutte le altre coppie resteranno intatte.'});
   await sendTournamentPairWizard(tournamentId,chatId);return new Response('ok');
  }
  const draft=(tournament.pairing_draft&&typeof tournament.pairing_draft==='object')?tournament.pairing_draft:{pairs:[],selected:null};
  if(data.startsWith('tp:')){
   const playerId=Number(parts[2]||0);const {data:player,error:playerError}=await db.from('scopa_tournament_players').select('telegram_id,display_name,eliminated,qualified,paired_opponent_id').eq('tournament_id',tournamentId).eq('telegram_id',playerId).maybeSingle();if(playerError)throw playerError;
   const already=(draft.pairs||[]).some((p:any[])=>p.map(Number).includes(playerId));
   const editMode=draft.mode==='edit'&&Array.isArray(draft.editOriginal)&&draft.editOriginal.length===2;const editIds=editMode?draft.editOriginal.map(Number):[];const allowedForEdit=editMode&&(editIds.includes(playerId)||Number(player?.paired_opponent_id||0)===0);if(!player||player.eliminated||player.qualified||already||(editMode?!allowedForEdit:!!player.paired_opponent_id)){await answerCallback('Questo giocatore non è disponibile per l’abbinamento.',false);return new Response('ok');}
   if(!draft.selected){draft.selected=playerId;await db.from('scopa_tournaments').update({pairing_draft:draft}).eq('id',tournamentId);await answerCallback('Primo giocatore selezionato.',false);}
   else{
    const first=Number(draft.selected);if(first===playerId){await answerCallback('Scegli un avversario diverso.',false);return new Response('ok');}
    const {data:firstPlayer,error:firstError}=await db.from('scopa_tournament_players').select('paired_opponent_id').eq('tournament_id',tournamentId).eq('telegram_id',first).maybeSingle();if(firstError)throw firstError;
    if(draft.mode==='edit'){const original=(draft.editOriginal||[]).map(Number);if(!(original.includes(first)||Number(firstPlayer?.paired_opponent_id||0)===0)||!(original.includes(playerId)||Number(player.paired_opponent_id||0)===0)){await answerCallback('Scegli i componenti della coppia selezionata o giocatori liberi.',false);return new Response('ok');}}else if((Number(firstPlayer?.paired_opponent_id||0)!==0&&Number(firstPlayer?.paired_opponent_id)!==playerId)||(Number(player.paired_opponent_id||0)!==0&&Number(player.paired_opponent_id)!==first)){await answerCallback('Questi giocatori appartengono già a coppie diverse. Mantieni gli abbinamenti precedenti.',false);return new Response('ok');}
    draft.pairs=Array.isArray(draft.pairs)?draft.pairs:[];draft.pairs.push([first,playerId]);draft.selected=null;
    const {error:saveError}=await db.from('scopa_tournaments').update({pairing_draft:draft}).eq('id',tournamentId);if(saveError)throw saveError;
    await answerCallback('Coppia aggiunta.',false);
   }
   await sendTournamentPairWizard(tournamentId,chatId,q.message.message_id);return new Response('ok');
  }
  if(data.startsWith('tpa:')){
   draft.selected=null;const {error:saveError}=await db.from('scopa_tournaments').update({pairing_draft:draft}).eq('id',tournamentId);if(saveError)throw saveError;
   await answerCallback('Selezione annullata.',false);await sendTournamentPairWizard(tournamentId,chatId,q.message.message_id);return new Response('ok');
  }
  if(data.startsWith('tpc:')){
   const {error:saveError}=await db.from('scopa_tournaments').update({pairing_draft:{pairs:[],selected:null}}).eq('id',tournamentId);if(saveError)throw saveError;
   await answerCallback('Preparazione annullata.',false);await telegram('editMessageText',{chat_id:chatId,message_id:q.message.message_id,text:'Preparazione degli abbinamenti annullata.'});return new Response('ok');
  }
  if(data.startsWith('tpp:')){
   if(draft.mode==='edit'&&draft.editStage==='reshuffle'&&Array.isArray(draft.editOriginal)&&draft.editOriginal.length===4){
    const pairs=Array.isArray(draft.pairs)?draft.pairs:[];if(draft.selected||pairs.length!==2){await answerCallback('Completa entrambe le nuove coppie prima di pubblicare.',false);return new Response('ok');}
    const oldIds=draft.editOriginal.map(Number),newPairs=pairs.map((p:number[])=>p.map(Number));const newIds=newPairs.flat();
    if(newIds.length!==4||new Set(newIds).size!==4||oldIds.some(id=>!newIds.includes(id))){await answerCallback('Le due nuove coppie devono includere esattamente i quattro giocatori selezionati.',false);return new Response('ok');}
    const {data:players,error:pError}=await db.from('scopa_tournament_players').select('*').eq('tournament_id',tournamentId).order('joined_at',{ascending:true});if(pError)throw pError;
    const byId=new Map((players||[]).map((p:any)=>[Number(p.telegram_id),p]));const selectedPlayers=oldIds.map(id=>byId.get(id) as any);
    if(selectedPlayers.some((p:any)=>!p||p.eliminated||p.qualified)){await answerCallback('Uno dei quattro giocatori non è più disponibile. Nessuna modifica applicata.',false);return new Response('ok');}
    for(const p of selectedPlayers){const expected=oldIds.find(id=>id!==Number(p.telegram_id)&&Number(byId.get(id)?.paired_opponent_id||0)===Number(p.telegram_id));if(!expected||Number(p.paired_opponent_id||0)!==expected){await answerCallback('Gli abbinamenti originali sono cambiati. Riapri la modifica.',false);return new Response('ok');}}
    const oldPairs=[[oldIds[0],oldIds[1]],[oldIds[2],oldIds[3]]];
    for(const pair of oldPairs){const {data:matches,error:matchError}=await db.from('scopa_tournament_matches').select('id').eq('tournament_id',tournamentId).eq('round_number',Number(tournament.current_round)).or('and(player1_telegram_id.eq.'+pair[0]+',player2_telegram_id.eq.'+pair[1]+'),and(player1_telegram_id.eq.'+pair[1]+',player2_telegram_id.eq.'+pair[0]+')');if(matchError)throw matchError;if(matches?.length){await answerCallback('Una delle coppie selezionate ha già una partita registrata.',false);return new Response('ok');}}
    for(const id of oldIds){const p:any=byId.get(id);const {error:u}=await db.from('scopa_tournament_players').update({paired_opponent_id:null}).eq('id',p.id);if(u)throw u;}
    for(const pair of newPairs){const a:any=byId.get(pair[0]),b:any=byId.get(pair[1]);const {error:u1}=await db.from('scopa_tournament_players').update({paired_opponent_id:pair[1]}).eq('id',a.id);if(u1)throw u1;const {error:u2}=await db.from('scopa_tournament_players').update({paired_opponent_id:pair[0]}).eq('id',b.id);if(u2)throw u2;}
    const {error:clearError}=await db.from('scopa_tournaments').update({pairing_draft:{pairs:[],selected:null}}).eq('id',tournamentId);if(clearError)throw clearError;
    const {data:updated,error:updatedError}=await db.from('scopa_tournament_players').select('telegram_id,display_name,paired_opponent_id,qualified,eliminated').eq('tournament_id',tournamentId).order('joined_at',{ascending:true});if(updatedError)throw updatedError;
    const updatedById=new Map((updated||[]).map((p:any)=>[Number(p.telegram_id),p]));const output=['🏆 ABBINAMENTI TORNEO · ROUND '+tournament.current_round];const seen=new Set<number>();
    for(const p of (updated||[])){const id=Number(p.telegram_id),opp=Number(p.paired_opponent_id||0);if(opp&&id<opp&&!seen.has(id)&&!seen.has(opp)){const other:any=updatedById.get(opp);if(other){output.push(output.length+'. '+p.display_name+' 🆚 '+other.display_name);seen.add(id);seen.add(opp);}}}
    const bye=(updated||[]).find((p:any)=>p.qualified&&!p.eliminated&&!Number(p.paired_opponent_id||0));if(bye)output.push('Passaggio automatico: '+bye.display_name);
    await answerCallback('Modifica pubblicata.',false);
    await telegram('editMessageText',{chat_id:chatId,message_id:q.message.message_id,text:'✅ Modifica pubblicata nel gruppo. Le altre coppie sono rimaste invariate.'});
    await telegram('sendMessage',{chat_id:Number(tournament.group_chat_id),text:output.join('\n')});
    return new Response('ok');
   }
   const pairs=Array.isArray(draft.pairs)?draft.pairs:[];if(draft.selected){await answerCallback('Completa o annulla la prima scelta.',false);return new Response('ok');}
   const {data:players,error:pError}=await db.from('scopa_tournament_players').select('*').eq('tournament_id',tournamentId).order('joined_at',{ascending:true});if(pError)throw pError;
   const used=new Set<number>();for(const pair of pairs){used.add(Number(pair[0]));used.add(Number(pair[1]));}
   const eligible=(players||[]).filter((p:any)=>!p.eliminated&&!p.qualified&&!p.paired_opponent_id);
   const remaining=eligible.filter((p:any)=>!used.has(Number(p.telegram_id)));
   if(remaining.length>1||pairs.length===0){await answerCallback('Abbina tutti i giocatori disponibili prima di pubblicare.',false);return new Response('ok');}
   const byId=new Map((players||[]).map((p:any)=>[Number(p.telegram_id),p]));const publicLines=['🏆 ABBINAMENTI TORNEO · ROUND '+tournament.current_round];
   for(const pair of pairs){
    const id1=Number(pair[0]),id2=Number(pair[1]);const p1:any=byId.get(id1),p2:any=byId.get(id2);
    if(!p1||!p2||p1.eliminated||p2.eliminated||p1.qualified||p2.qualified||(Number(p1.paired_opponent_id||0)!==0&&Number(p1.paired_opponent_id||0)!==id2)||(Number(p2.paired_opponent_id||0)!==0&&Number(p2.paired_opponent_id||0)!==id1)){await answerCallback('Un partecipante è cambiato. Riapri la preparazione.',false);return new Response('ok');}
    const {error:u1}=await db.from('scopa_tournament_players').update({paired_opponent_id:id2}).eq('id',p1.id);if(u1)throw u1;
    const {error:u2}=await db.from('scopa_tournament_players').update({paired_opponent_id:id1}).eq('id',p2.id);if(u2)throw u2;
    publicLines.push((publicLines.length)+'. '+p1.display_name+' 🆚 '+p2.display_name);
   }
   let byeText='';if(remaining.length===1){const bye:any=remaining[0];const {error:byeUpdate}=await db.from('scopa_tournament_players').update({qualified:true,advanced_by_bye:Number(bye.advanced_by_bye||0)+1}).eq('id',bye.id);if(byeUpdate)throw byeUpdate;const {error:byeMatch}=await db.from('scopa_tournament_matches').insert({tournament_id:tournamentId,round_number:Number(tournament.current_round),play_date:playDate,player1_telegram_id:Number(bye.telegram_id),player1_name:bye.display_name,status:'bye'});if(byeMatch)throw byeMatch;byeText='\n'+bye.display_name+' passa automaticamente il turno.';publicLines.push('Passaggio automatico: '+bye.display_name);}
   const {error:clearError}=await db.from('scopa_tournaments').update({pairing_draft:{pairs:[],selected:null}}).eq('id',tournamentId);if(clearError)throw clearError;
   await answerCallback('Abbinamenti pubblicati nel gruppo.',false);
   if(byeText)publicLines.push(byeText);
   const {data:publishedPlayers,error:publishedError}=await db.from('scopa_tournament_players').select('telegram_id,display_name,paired_opponent_id,qualified,eliminated').eq('tournament_id',tournamentId).order('joined_at',{ascending:true});if(publishedError)throw publishedError;
   const publishedById=new Map((publishedPlayers||[]).map((p:any)=>[Number(p.telegram_id),p]));const completeLines=['🏆 ABBINAMENTI TORNEO · ROUND '+tournament.current_round];const publishedSeen=new Set<number>();
   for(const player of (publishedPlayers||[])){const pid=Number(player.telegram_id),oid=Number(player.paired_opponent_id||0),opponent:any=publishedById.get(oid);if(oid&&pid<oid&&!player.eliminated&&!player.qualified&&opponent&&!opponent.eliminated&&!opponent.qualified&&Number(opponent.paired_opponent_id)===pid&&!publishedSeen.has(pid)&&!publishedSeen.has(oid)){completeLines.push((completeLines.length)+'. '+player.display_name+' 🆚 '+opponent.display_name);publishedSeen.add(pid);publishedSeen.add(oid);}}
   const byePlayer=(publishedPlayers||[]).find((p:any)=>p.qualified&&!p.eliminated&&!Number(p.paired_opponent_id||0));if(byePlayer)completeLines.push('Passaggio automatico: '+byePlayer.display_name);
   await telegram('sendMessage',{chat_id:Number(tournament.group_chat_id),text:completeLines.join('\n')});
   await telegram('editMessageText',{chat_id:chatId,message_id:q.message.message_id,text:'✅ Abbinamenti pubblicati nel gruppo.'});
   return new Response('ok');
  }
 }

 if(data==='scopamode:complete'||data==='scopamode:single'){
  const targetChat=Number(q.message?.chat?.id||0);const mode=data.endsWith(':single')?'single':'complete';
  if(!targetChat||!['group','supergroup'].includes(String(q.message?.chat?.type||''))){await answerCallback('Apri la scelta dal gruppo.',false);return new Response('ok');}
  const {data:auth,error:authError}=await db.from('telegram_group_authorizations').select('status').eq('chat_id',targetChat).maybeSingle();if(authError)throw authError;
  if(auth?.status!=='authorized'){await answerCallback('Gruppo non autorizzato.',false);return new Response('ok');}
  const callbackUser=q.from||{};const creatorName=[callbackUser.first_name,callbackUser.last_name].filter(Boolean).join(' ')||'Utente Telegram';const creatorLabel=callbackUser.username?'@'+callbackUser.username:creatorName;
  let room:any;
  try{room=await insertRoom(targetChat,mode,{id:callbackUser.id,name:creatorName,first_name:creatorName,username:callbackUser.username});}
  catch(createRoomError:any){
   if(String(createRoomError?.code||'')!=='23505')throw createRoomError;
   const {data:existing,error:existingError}=await db.from('scopa_telegram_rooms').select('*').eq('group_chat_id',targetChat).in('mode',['complete','single']).in('status',['waiting','playing']).order('created_at',{ascending:false}).limit(1).maybeSingle();if(existingError)throw existingError;
   if(!existing){await answerCallback('Una stanza è già in fase di apertura. Attendi qualche secondo.',false);return new Response('ok');}
   const existingLink='https://t.me/'+BOT_USERNAME+'?startapp='+encodeURIComponent(existing.room_code);const existingWatch='https://t.me/'+BOT_USERNAME+'?startapp='+encodeURIComponent('watch_'+existing.room_code);const existingCreator=existing.created_by_username?'@'+existing.created_by_username:String(existing.created_by_name||'non indicato');
   await answerCallback('Esiste già una stanza aperta.',false);
   await telegram('sendMessage',{chat_id:targetChat,text:'♟ C’È GIÀ UNA PARTITA APERTA\n'+(existing.mode==='single'?'MANO SINGOLA':'PARTITA COMPLETA')+'\nStanza '+existing.room_code+'\nAperta da: '+existingCreator+'\nUsate questa stanza; una nuova sarà disponibile al termine della partita.',reply_markup:{inline_keyboard:[[{text:'GIOCA',url:existingLink}],[{text:'GUARDA E CHATTA',url:existingWatch}]]}});
   return new Response('ok');
  }
  const link='https://t.me/'+BOT_USERNAME+'?startapp='+encodeURIComponent(room.room_code);const watchLink='https://t.me/'+BOT_USERNAME+'?startapp='+encodeURIComponent('watch_'+room.room_code);
  const label=mode==='single'?'MANO SINGOLA':'PARTITA COMPLETA';
  await answerCallback('Stanza creata: '+label,false);
  await sendRoomAnnouncement(targetChat,'SCOPA DI MONOPOLY GOITA\\n'+label+'\\nStanza '+room.room_code+'\\nAperta da: '+creatorLabel+'\\nEntrano i primi due giocatori. La partita parte automaticamente nella Mini App.',link,watchLink);
  return new Response('ok');
 }
 if(data.startsWith('scopatorneo:withdraw:')){
  const [, , tournamentId, targetUserIdRaw]=data.split(':');const targetUserId=Number(targetUserIdRaw||0);const uid=Number(q.from?.id||0);const groupId=Number(q.message?.chat?.id||0);
  if(!tournamentId||!uid||!groupId){await answerCallback('Richiesta di ritiro non valida.',false);return new Response('ok');}
  const {data:tournament,error:tError}=await db.from('scopa_tournaments').select('id,status,group_chat_id').eq('id',tournamentId).eq('group_chat_id',groupId).maybeSingle();if(tError)throw tError;
  if(!tournament||tournament.status!=='active'){await answerCallback('Questo torneo non è più attivo.',false);return new Response('ok');}
  if(targetUserId&&uid!==targetUserId){await answerCallback('Questa richiesta appartiene a un altro partecipante.',false);return new Response('ok');}
  const {data:ownedPlayer,error:ownedError}=await db.from('scopa_tournament_players').select('telegram_id,display_name').eq('tournament_id',tournamentId).eq('telegram_id',uid).maybeSingle();if(ownedError)throw ownedError;
  if(!ownedPlayer){await answerCallback('Non risulti iscritto a questo torneo.',false);return new Response('ok');}
  await answerCallback('Conferma il tuo ritiro nel messaggio successivo.',false);
  await telegram('sendMessage',{chat_id:groupId,text:'⚠️ '+String(ownedPlayer.display_name||'Partecipante')+', vuoi davvero annullare la tua iscrizione o ritirarti dal torneo? Solo il tuo account può confermare.',reply_markup:{inline_keyboard:[[{text:'SÌ, CONFERMO',callback_data:'stc:'+tournamentId+':'+uid},{text:'ANNULLA',callback_data:'stx:'+tournamentId+':'+uid}]]}});
  return new Response('ok');
 }
 if(data.startsWith('stx:')||data.startsWith('scopatorneo:cancel:')){
  const parts=data.split(':');const compact=data.startsWith('stx:');const tournamentId=parts[compact?1:2];const targetUserId=Number(parts[compact?2:3]||0);
  if(!tournamentId||!targetUserId||Number(q.from?.id||0)!==targetUserId){await answerCallback('Questa conferma appartiene a un altro partecipante.',false);return new Response('ok');}
  await answerCallback('Ritiro annullato.',false);
  await telegram('deleteMessage',{chat_id:q.message.chat.id,message_id:q.message.message_id});
  return new Response('ok');
 }
 if(data.startsWith('stc:')||data.startsWith('scopatorneo:confirm:')){
  const parts=data.split(':');const compact=data.startsWith('stc:');const tournamentId=parts[compact?1:2];const targetUserId=Number(parts[compact?2:3]||0);const groupId=Number(q.message?.chat?.id||0);const user=q.from||{};const uid=Number(user.id||0);
  if(!targetUserId||uid!==targetUserId){await answerCallback('Questa conferma appartiene a un altro partecipante.',false);return new Response('ok');}
  if(!tournamentId||!groupId||!uid){await answerCallback('Richiesta di ritiro non valida.',false);return new Response('ok');}
  const {data:tournament,error:tError}=await db.from('scopa_tournaments').select('id,status,group_chat_id,current_round').eq('id',tournamentId).eq('group_chat_id',groupId).maybeSingle();if(tError)throw tError;
  if(!tournament||tournament.status!=='active'){await answerCallback('Questo torneo non è più attivo.',false);return new Response('ok');}
  const {data:player,error:pError}=await db.from('scopa_tournament_players').select('*').eq('tournament_id',tournamentId).eq('telegram_id',uid).maybeSingle();if(pError)throw pError;
  if(!player){await answerCallback('Non risulti iscritto a questo torneo.',false);return new Response('ok');}
  const {count:matchCount,error:countError}=await db.from('scopa_tournament_matches').select('id',{count:'exact',head:true}).eq('tournament_id',tournamentId);if(countError)throw countError;
  const displayName=String(player.display_name||'Giocatore');
  if(Number(matchCount||0)===0){
   const {error:deleteError}=await db.from('scopa_tournament_players').delete().eq('id',player.id).eq('tournament_id',tournamentId);if(deleteError)throw deleteError;
   await answerCallback('Iscrizione annullata.',false);
   await telegram('deleteMessage',{chat_id:groupId,message_id:q.message.message_id});
   await telegram('sendMessage',{chat_id:groupId,text:'↩️ '+displayName+' ha annullato l’iscrizione al torneo. Nessuna penalità: può iscriversi di nuovo finché le iscrizioni sono aperte.'});
   return new Response('ok');
  }
  if(player.eliminated){await answerCallback('Il tuo ritiro risulta già registrato.',false);return new Response('ok');}
  const opponentId=Number(player.paired_opponent_id||0);
  let opponent:any=null;
  if(opponentId){const {data:opp,error:oppError}=await db.from('scopa_tournament_players').select('*').eq('tournament_id',tournamentId).eq('telegram_id',opponentId).maybeSingle();if(oppError)throw oppError;opponent=opp;}
  const {data:openMatches,error:openError}=await db.from('scopa_tournament_matches').select('*').eq('tournament_id',tournamentId).eq('round_number',Number(tournament.current_round)).in('status',['waiting','playing']).or('player1_telegram_id.eq.'+uid+',player2_telegram_id.eq.'+uid);if(openError)throw openError;
  for(const match of (openMatches||[])){
   const winnerId=Number(match.player1_telegram_id)===uid?Number(match.player2_telegram_id||0):Number(match.player1_telegram_id||0);
   const winnerName=Number(match.player1_telegram_id)===uid?String(match.player2_name||opponent?.display_name||'Avversario'):String(match.player1_name||opponent?.display_name||'Avversario');
   if(winnerId){
    const {error:matchUpdateError}=await db.from('scopa_tournament_matches').update({status:'finished',winner_telegram_id:winnerId,loser_telegram_id:uid,winner_name:winnerName,loser_name:displayName,finished_at:new Date().toISOString()}).eq('id',match.id).in('status',['waiting','playing']);if(matchUpdateError)throw matchUpdateError;
    const {data:linkedRoom,error:linkedRoomError}=await db.from('scopa_telegram_rooms').select('id,version').eq('tournament_match_id',match.id).in('status',['waiting','playing']).maybeSingle();if(linkedRoomError)throw linkedRoomError;if(linkedRoom){const roomNow=new Date().toISOString();const {error:roomUpdateError}=await db.from('scopa_telegram_rooms').update({status:'finished',turn_deadline_at:null,winner_telegram_id:winnerId,result_message:'🏆 '+winnerName+' passa il turno: '+displayName+' si è ritirato dal torneo.',finished_at:roomNow,updated_at:roomNow,version:Number(linkedRoom.version||0)+1}).eq('id',linkedRoom.id).eq('version',linkedRoom.version).in('status',['waiting','playing']);if(roomUpdateError)throw roomUpdateError;}
    if(!opponent&&winnerId){const {data:opp2,error:opp2Error}=await db.from('scopa_tournament_players').select('*').eq('tournament_id',tournamentId).eq('telegram_id',winnerId).maybeSingle();if(opp2Error)throw opp2Error;opponent=opp2;}
   }
  }
  const {error:withdrawError}=await db.from('scopa_tournament_players').update({eliminated:true,qualified:false,paired_opponent_id:null}).eq('id',player.id);if(withdrawError)throw withdrawError;
  if(opponent){
   const {error:advanceError}=await db.from('scopa_tournament_players').update({qualified:true,eliminated:false}).eq('id',opponent.id);if(advanceError)throw advanceError;
  }
  await answerCallback('Ritiro registrato.',false);
  await telegram('deleteMessage',{chat_id:groupId,message_id:q.message.message_id});
  await telegram('sendMessage',{chat_id:groupId,text:'🚪 '+displayName+' si è ritirato dal torneo. '+(opponent?'🏆 '+opponent.display_name+' passa automaticamente al prossimo round.':'Il ritiro è stato registrato; non è previsto un avversario da far avanzare automaticamente.')});
  return new Response('ok');
 }
 if(data.startsWith('scopatorneo:join:')){
  const tournamentId=data.split(':')[2];const groupId=Number(q.message?.chat?.id||0);const user=q.from||{};
  if(!tournamentId||!groupId||!user.id){await answerCallback('Iscrizione non valida.',false);return new Response('ok');}
  const {data:tournament,error:tError}=await db.from('scopa_tournaments').select('id,status,group_chat_id,pairing_draft').eq('id',tournamentId).eq('group_chat_id',groupId).maybeSingle();if(tError)throw tError;
  if(!tournament||tournament.status!=='active'||tournament.pairing_draft?.registrationsClosed===true){await answerCallback('Le iscrizioni sono chiuse.',false);return new Response('ok');}
  const {count:existingMatches,error:matchCheckError}=await db.from('scopa_tournament_matches').select('id',{count:'exact',head:true}).eq('tournament_id',tournamentId);if(matchCheckError)throw matchCheckError;
  if(Number(existingMatches||0)>0){await answerCallback('Le iscrizioni sono chiuse: il torneo è già iniziato.',false);return new Response('ok');}
  const displayName=user.username?'@'+user.username:[user.first_name,user.last_name].filter(Boolean).join(' ')||('Giocatore '+user.id);
  const {error:joinError}=await db.from('scopa_tournament_players').upsert({tournament_id:tournamentId,telegram_id:Number(user.id),display_name:displayName},{onConflict:'tournament_id,telegram_id'});
  if(joinError)throw joinError;
  const {count:registeredCount,error:countError}=await db.from('scopa_tournament_players').select('telegram_id',{count:'exact',head:true}).eq('tournament_id',tournamentId);
  if(countError)throw countError;
  await telegram('editMessageReplyMarkup',{chat_id:groupId,message_id:q.message.message_id,reply_markup:{inline_keyboard:[[{text:'ISCRIVITI AL TORNEO · '+Number(registeredCount||0)+' ISCRITTI',callback_data:'scopatorneo:join:'+tournamentId}],[{text:'ANNULLA ISCRIZIONE',callback_data:'scopatorneo:withdraw:'+tournamentId}]]}});
  await telegram('sendMessage',{chat_id:groupId,text:'✅ '+displayName+' si è iscritto al torneo. Iscritti: '+Number(registeredCount||0)+'.'});
  return new Response('ok');
 }
 if(data.startsWith('groupauth:')){
  const [,decision,chatId]=data.split(':');
  if(String(q.from?.id)!==OWNER_ID||!['approve','reject'].includes(decision)){await answerCallback('Non autorizzato',false);return new Response('ok');}
  const {data:row,error:rowError}=await db.from('telegram_group_authorizations').select('chat_title').eq('chat_id',Number(chatId)).maybeSingle();if(rowError)throw rowError;
  if(!row){await answerCallback('Richiesta non trovata',false);return new Response('ok');}
  if(decision==='approve'){
   const {error:updateError}=await db.from('telegram_group_authorizations').update({status:'authorized',decided_at:new Date().toISOString(),decided_by_id:Number(q.from.id)}).eq('chat_id',Number(chatId));if(updateError)throw updateError;
   await answerCallback('Gruppo autorizzato',false);
   await telegram('sendMessage',{chat_id:Number(chatId),text:'✅ Questo gruppo è autorizzato. Scopa è attiva.'});
   await telegram('sendMessage',{chat_id:OWNER_ID,text:'✅ Hai autorizzato il gruppo: '+String(row.chat_title||'Gruppo')});
  }else{
   const {error:updateError}=await db.from('telegram_group_authorizations').update({status:'rejected',decided_at:new Date().toISOString(),decided_by_id:Number(q.from.id)}).eq('chat_id',Number(chatId));if(updateError)throw updateError;
   await answerCallback('Richiesta rifiutata',false);
   try{await telegram('leaveChat',{chat_id:Number(chatId)});await telegram('sendMessage',{chat_id:OWNER_ID,text:'🚫 Hai rifiutato il gruppo '+String(row.chat_title||'Gruppo')+'. Il bot è uscito dal gruppo.'});}
   catch(e){console.error('Scopa leaveChat failed',e);await telegram('sendMessage',{chat_id:OWNER_ID,text:'🚫 Gruppo rifiutato e bloccato, ma Telegram non ha confermato l’uscita automatica.'});}
  }
 }
 return new Response('ok');
}
const msg=update.message||update.edited_message;
if(!msg){console.log('Telegram update received without message',JSON.stringify({updateId:update.update_id??null,keys:Object.keys(update||{})}));return new Response('ok');}
const incomingText=String(msg.text||'');const incomingCommandToken=incomingText.trim().toLowerCase().split(' ')[0]||'';const incomingCommand=incomingCommandToken.startsWith('/')?incomingCommandToken.slice(1).split('@')[0]:'';console.log('Telegram update received',JSON.stringify({updateId:update.update_id??null,chatType:msg.chat?.type??null,command:['start','scopa','promemoria','chiudiscopa','regole','comandi','classifica','azzera','cronologia','cronologiatornei'].includes(incomingCommand)||incomingCommand.startsWith('torneo')?incomingCommand:'non-command',secretHeaderPresent:!!secretHeader}));
const text=String(msg.text||'');const chat=msg.chat||{};const from=msg.from||{};if(chat.type==='group'||chat.type==='supergroup'){const {data:access,error:accessError}=await db.from('telegram_group_authorizations').select('status').eq('chat_id',Number(chat.id)).maybeSingle();if(accessError)throw accessError;if(access?.status!=='authorized')return new Response('ok');}const normalized=text.trim().toLowerCase();const commandToken=normalized.split(' ')[0]||'';const commandName=commandToken.startsWith('/')?commandToken.slice(1).split('@')[0]:'';const isScopaCommand=commandName==='scopa';const isStartCommand=commandName==='start';const isCloseRoomCommand=commandName==='chiudiscopa';const isRulesCommand=commandName==='regole';const isCommandsCommand=commandName==='comandi';const isLeaderboardCommand=commandName==='classifica';const isResetLeaderboardCommand=commandName==='azzera';const isReminderCommand=commandName==='promemoria';const isTournamentCommand=commandName.startsWith('torneo')||isReminderCommand;if((msg.chat?.type==='group'||msg.chat?.type==='supergroup')){const {data:access,error:accessError}=await db.from('telegram_group_authorizations').select('status').eq('chat_id',Number(msg.chat.id)).maybeSingle();if(accessError)throw accessError;if(access?.status!=='authorized')return new Response('ok');}if(!isStartCommand&&!isScopaCommand&&!isCloseRoomCommand&&!isRulesCommand&&!isCommandsCommand&&!isLeaderboardCommand&&!isResetLeaderboardCommand&&!isTournamentCommand&&commandName!=='cronologiatornei'&&commandName!=='cronologia')return new Response('ok');const parts=text.trim().split(/\s+/);const param=parts[1]||'';
const rulesText='📖 REGOLE DELLA SCOPA NAPOLETANA\n\n• Si gioca con 40 carte: denari, coppe, spade e bastoni.\n• Ogni giocatore riceve 3 carte; sul tavolo si mettono 4 carte.\n• A turno si gioca una carta: si prende una carta dello stesso valore oppure una combinazione di carte che abbia la stessa somma. Se non è possibile prendere, la carta resta sul tavolo.\n• Se con una presa si libera completamente il tavolo, si fa SCOPA (1 punto).\n• Alla fine della mano si assegnano: 1 punto a chi ha più carte, 1 a chi ha più denari, 1 per il Settebello (7 di denari) e 1 per la Primiera.\n• La Primiera confronta la migliore carta di ogni seme; vince chi totalizza il valore maggiore.\n• La partita completa termina quando il punteggio raggiunge o supera 11 punti.\n\n🎴 MANO SINGOLA: si gioca una sola mano; vince chi ottiene più punti in quella mano.\n\n🏆 TORNEO\n• Ogni incontro è una sola mano. I punti Scopa reali ottenuti si sommano al punteggio personale del torneo.\n• Quando un giocatore raggiunge almeno 11 punti, si qualifica; se l’avversario è sotto 11, viene eliminato. Se entrambi raggiungono 11, si qualificano entrambi.\n• Tutte le coppie ancora in gara devono completare la stessa mano: il bot blocca automaticamente la mano successiva finché tutte non hanno finito. Gli avversari restano gli stessi finché un giocatore raggiunge almeno 11 punti; chi raggiunge 11 si qualifica e l’avversario viene eliminato. Quando il round è concluso, vengono preparati nuovi abbinamenti tra i qualificati.\n• Gli abbinamenti vengono sorteggiati automaticamente quando l’organizzatrice chiude le iscrizioni e a ogni nuovo round. Le coppie restano fisse per il round. I punteggi dei qualificati ripartono da zero. Se i qualificati sono dispari, passa chi ha avuto meno turni di riposo; in caso di parità il sorteggio è casuale.';
const commandsText='🎮 COMANDI SCOPA\n/scopa — avvia una partita\n/regole — mostra le regole\n/chiudiscopa — chiude la stanza\n/torneonuovo — crea un torneo\n/torneoazzera — archivia e azzera il torneo\n/torneoabbina — abbina i giocatori\n/promemoria — Mostra chi deve ancora giocare\n/torneoannuncia — Pubblica l’esito della mano torneo\n/torneoproclama — Pubblica la locandina del vincitore finale';
if(isRulesCommand||isCommandsCommand){await telegram('sendMessage',{chat_id:chat.id,text:isRulesCommand?rulesText:commandsText});return new Response('ok');}
if(isLeaderboardCommand||isResetLeaderboardCommand){
 if(chat.type!=='group'&&chat.type!=='supergroup'){await telegram('sendMessage',{chat_id:chat.id,text:'Questo comando si usa nel gruppo di gioco.'});return new Response('ok');}
 if(isResetLeaderboardCommand){
  if(!isGroupManagerId(from.id)){await telegram('sendMessage',{chat_id:chat.id,text:'Non sei autorizzato a gestire la classifica.'});return new Response('ok');}
  const {error:resetError}=await db.from('scopa_group_match_results').delete().eq('group_chat_id',Number(chat.id));
  if(resetError)throw resetError;
  await telegram('sendMessage',{chat_id:chat.id,text:'🧹 Classifica di questo gruppo azzerata. I risultati degli altri gruppi non sono stati modificati.'});
  return new Response('ok');
 }
 const {data:rows,error:rowsError}=await db.from('scopa_group_match_results').select('player1_telegram_id,player1_name,player1_score,player2_telegram_id,player2_name,player2_score,winner_telegram_id,finished_at').eq('group_chat_id',Number(chat.id)).order('finished_at',{ascending:true});
 if(rowsError)throw rowsError;
 if(!rows?.length){await telegram('sendMessage',{chat_id:chat.id,text:'📊 CLASSIFICA DEL GRUPPO\nNon ci sono ancora partite concluse.'});return new Response('ok');}
 const totals=new Map<number,{name:string;points:number;wins:number;games:number}>();
 for(const row of rows){
  for(const p of [{id:Number(row.player1_telegram_id),name:String(row.player1_name||'Giocatore'),score:Number(row.player1_score||0)},{id:Number(row.player2_telegram_id),name:String(row.player2_name||'Giocatore'),score:Number(row.player2_score||0)}]){
   const item=totals.get(p.id)||{name:p.name,points:0,wins:0,games:0};item.name=p.name;item.points+=p.score;item.games++;if(Number(row.winner_telegram_id)===p.id)item.wins++;totals.set(p.id,item);
  }
 }
 const ranking=[...totals.values()].sort((a,b)=>b.points-a.points||b.wins-a.wins||a.name.localeCompare(b.name));
 const board='📊 CLASSIFICA DEL GRUPPO\n'+ranking.map((p,i)=>`${i+1}. ${p.name} — ${p.points} punti (${p.wins} vittorie, ${p.games} partite)`).join('\n');
 await telegram('sendMessage',{chat_id:chat.id,text:board});return new Response('ok');
}

if(commandName==='torneoannullaabbinamenti'){
 if(chat.type!=='private'){await telegram('sendMessage',{chat_id:chat.id,text:'Questo comando si usa esclusivamente nella chat privata con il bot.'});return new Response('ok');}
 if(String(from.id)!==OWNER_ID){await telegram('sendMessage',{chat_id:chat.id,text:'Non sei autorizzato ad annullare gli abbinamenti.'});return new Response('ok');}
 const {data:tournaments,error:tournamentsError}=await db.from('scopa_tournaments').select('id,name,current_round,group_chat_id,pairing_draft').eq('created_by',Number(from.id)).eq('status','active').order('created_at',{ascending:false});
 if(tournamentsError)throw tournamentsError;
 if(!tournaments?.length){await telegram('sendMessage',{chat_id:chat.id,text:'Non c’è un torneo attivo da modificare.'});return new Response('ok');}
 let tournament:any=null;
 if(param){tournament=tournaments.find((t:any)=>String(t.id)===param);}
 else if(tournaments.length===1){tournament=tournaments[0];}
 if(!tournament){
  const choices=tournaments.map((t:any)=>'• '+String(t.name||'Torneo')+' — ID '+String(t.id)).join('\n');
  await telegram('sendMessage',{chat_id:chat.id,text:tournaments.length>1?'Hai più tornei attivi. Ripeti il comando indicando l’ID del torneo da modificare:\n'+choices:'ID del torneo non riconosciuto. Controlla e ripeti il comando.'});
  return new Response('ok');
 }
 const {count:registeredMatches,error:matchesError}=await db.from('scopa_tournament_matches').select('id',{count:'exact',head:true}).eq('tournament_id',tournament.id).eq('round_number',Number(tournament.current_round)).neq('status','bye');
 if(matchesError)throw matchesError;
 if(Number(registeredMatches||0)>0){
  await telegram('sendMessage',{chat_id:chat.id,text:'Non posso annullare gli abbinamenti: nel Round '+tournament.current_round+' è già registrato almeno un incontro. Risultati e partite già create restano protetti.'});
  return new Response('ok');
 }
 const {error:playersUpdateError}=await db.from('scopa_tournament_players').update({paired_opponent_id:null}).eq('tournament_id',tournament.id);
 if(playersUpdateError)throw playersUpdateError;
 const {error:draftUpdateError}=await db.from('scopa_tournaments').update({pairing_draft:{pairs:[],selected:null}}).eq('id',tournament.id).eq('status','active');
 if(draftUpdateError)throw draftUpdateError;
 await telegram('sendMessage',{chat_id:chat.id,text:'✅ Tutti gli abbinamenti del Round '+tournament.current_round+' sono stati annullati.\nPartecipanti, torneo e punteggi sono rimasti invariati.\nOra puoi rifare le coppie con /torneoabbina.'});
 return new Response('ok');
}
if(chat.type==='private'&&commandName==='torneomodifica'){
 if(String(from.id)!==OWNER_ID){await telegram('sendMessage',{chat_id:chat.id,text:'Non sei autorizzato a modificare gli abbinamenti.'});return new Response('ok');}
 const {data:tournament,error:tournamentError}=await db.from('scopa_tournaments').select('id').eq('created_by',Number(from.id)).eq('status','active').order('created_at',{ascending:false}).limit(1).maybeSingle();if(tournamentError)throw tournamentError;
 if(!tournament){await telegram('sendMessage',{chat_id:chat.id,text:'Non c’è un torneo attivo da modificare.'});return new Response('ok');}
 await sendTournamentEditMenu(tournament.id,Number(chat.id));return new Response('ok');
}
if(commandName==='torneoannuncia'){
 if(chat.type!=='group'&&chat.type!=='supergroup'){await telegram('sendMessage',{chat_id:chat.id,text:'Questo comando si usa nel gruppo del torneo.'});return new Response('ok');}
 if(!isGroupManagerId(from.id)){await telegram('sendMessage',{chat_id:chat.id,text:'Non sei autorizzato a pubblicare l’esito del torneo.'});return new Response('ok');}
 const {data:tournament,error:tournamentError}=await db.from('scopa_tournaments').select('id,current_round,group_chat_id').eq('group_chat_id',Number(chat.id)).eq('created_by',Number(OWNER_ID)).eq('status','active').order('created_at',{ascending:false}).limit(1).maybeSingle();
 if(tournamentError)throw tournamentError;
 if(!tournament){await telegram('sendMessage',{chat_id:chat.id,text:'Non trovo un torneo attivo in questo gruppo.'});return new Response('ok');}
 const {data:match,error:matchError}=await db.from('scopa_tournament_matches').select('player1_telegram_id,player2_telegram_id,winner_name,round_number,finished_at').eq('tournament_id',tournament.id).eq('round_number',Number(tournament.current_round)).eq('status','finished').order('finished_at',{ascending:false}).limit(1).maybeSingle();
 if(matchError)throw matchError;
 if(!match){await telegram('sendMessage',{chat_id:chat.id,text:'Non trovo una mano conclusa nel round attuale.'});return new Response('ok');}
 const ids=[Number(match.player1_telegram_id),Number(match.player2_telegram_id)];
 const {data:players,error:playersError}=await db.from('scopa_tournament_players').select('telegram_id,display_name,round_points,qualified,eliminated').eq('tournament_id',tournament.id).in('telegram_id',ids);
 if(playersError)throw playersError;
 const p1=players?.find((p:any)=>Number(p.telegram_id)===ids[0]),p2=players?.find((p:any)=>Number(p.telegram_id)===ids[1]);
 if(!p1||!p2){await telegram('sendMessage',{chat_id:chat.id,text:'Non riesco a recuperare entrambi i partecipanti della mano.'});return new Response('ok');}
 const status=(p:any)=>p.qualified&&!p.eliminated?'QUALIFICATA':p.eliminated?'ELIMINATA':'ANCORA IN GARA';
 const winnerLine=match.winner_name?'Vince la mano: '+String(match.winner_name):'Mano conclusa in parità.';
 const message='🏆 ESITO DELLA MANO TORNEO · ROUND '+Number(match.round_number)+'\\n\\n'+winnerLine+'\\n\\nPUNTEGGIO TORNEO\\n'+String(p1.display_name||'Giocatore')+': '+Number(p1.round_points||0)+'/11 — '+status(p1)+'\\n'+String(p2.display_name||'Giocatore')+': '+Number(p2.round_points||0)+'/11 — '+status(p2)+(p1.qualified&&!p1.eliminated&&p2.eliminated?'\\n\\n'+String(p1.display_name||'La giocatrice qualificata')+' passa al prossimo turno.':(p2.qualified&&!p2.eliminated&&p1.eliminated?'\\n\\n'+String(p2.display_name||'La giocatrice qualificata')+' passa al prossimo turno.':(p1.qualified&&p2.qualified?'\\n\\nEntrambe qualificate per il prossimo round.':'')));
 await telegram('sendMessage',{chat_id:Number(chat.id),text:message});
 return new Response('ok');
}
if(commandName==='cronologia'){
 if(chat.type!=='group'&&chat.type!=='supergroup'){await telegram('sendMessage',{chat_id:chat.id,text:'La cronologia dei vincitori si consulta dal gruppo.'});return new Response('ok');}
 const groupId=Number(chat.id);
 const {data:tournaments,error:tournamentsError}=await db.from('scopa_tournaments').select('id,name,finished_at,created_at').eq('group_chat_id',groupId).eq('status','finished').order('finished_at',{ascending:false}).limit(30);
 if(tournamentsError)throw tournamentsError;
 if(!tournaments?.length){await telegram('sendMessage',{chat_id:groupId,text:'🏆 CRONOLOGIA VINCITORI\\n\\nIn questo gruppo non risultano ancora tornei conclusi.'});return new Response('ok');}
 const tournamentIds=tournaments.map((t:any)=>t.id);
 const {data:players,error:playersError}=await db.from('scopa_tournament_players').select('tournament_id,display_name,qualified,eliminated,tournament_points,wins').in('tournament_id',tournamentIds).eq('qualified',true).eq('eliminated',false).order('tournament_points',{ascending:false});
 if(playersError)throw playersError;
 const winnersByTournament=new Map<string,any[]>();
 for(const p of (players||[])){const key=String(p.tournament_id);if(!winnersByTournament.has(key))winnersByTournament.set(key,[]);winnersByTournament.get(key)!.push(p);}
 const lines=tournaments.map((t:any,i:number)=>{const dt=t.finished_at||t.created_at;const date=dt?new Intl.DateTimeFormat('it-IT',{dateStyle:'short',timeZone:'Europe/Rome'}).format(new Date(dt)):'—';const winners=winnersByTournament.get(String(t.id))||[];const winnerText=winners.length?winners.map((p:any)=>String(p.display_name||'Giocatore')+' ('+Number(p.tournament_points||0)+' pt)').join(', '):'Vincitore non registrato';return (i+1)+'. '+String(t.name||'Torneo Scopa')+' · '+date+'\\n   🏆 '+winnerText;});
 await telegram('sendMessage',{chat_id:groupId,text:'🏆 CRONOLOGIA VINCITORI · QUESTO GRUPPO\\n\\n'+lines.join('\\n\\n')});
 return new Response('ok');
}
if(commandName==='cronologiatornei'){
 if(chat.type!=='private'){await telegram('sendMessage',{chat_id:chat.id,text:'La cronologia dei tornei è disponibile solo nella chat privata con il bot.'});return new Response('ok');}
 if(String(from.id)!==OWNER_ID){await telegram('sendMessage',{chat_id:chat.id,text:'Non sei autorizzato a consultare la cronologia dei tornei.'});return new Response('ok');}
 if(param){
  const {data:tournament,error:tournamentError}=await db.from('scopa_tournaments').select('id,name,status,current_round,group_chat_id,created_at,finished_at,archived_at').eq('id',param).eq('created_by',Number(from.id)).maybeSingle();
  if(tournamentError)throw tournamentError;
  if(!tournament){await telegram('sendMessage',{chat_id:chat.id,text:'Non trovo questo torneo nel tuo archivio. Invia /cronologiatornei per vedere l’elenco.'});return new Response('ok');}
  const {data:group,error:groupError}=await db.from('telegram_group_authorizations').select('chat_title').eq('chat_id',Number(tournament.group_chat_id)).maybeSingle();if(groupError)throw groupError;
  const {data:players,error:playersError}=await db.from('scopa_tournament_players').select('display_name,tournament_points,wins,losses,eliminated,qualified,advanced_by_bye').eq('tournament_id',tournament.id).order('tournament_points',{ascending:false});if(playersError)throw playersError;
  const {data:matches,error:matchesError}=await db.from('scopa_tournament_matches').select('round_number,player1_name,player2_name,player1_points,player2_points,winner_name,status,play_date,finished_at,created_at').eq('tournament_id',tournament.id).order('round_number',{ascending:true}).order('created_at',{ascending:true}).limit(40);if(matchesError)throw matchesError;
  const dateValue=tournament.archived_at||tournament.finished_at||tournament.created_at;
  const dateText=dateValue?new Intl.DateTimeFormat('it-IT',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Rome'}).format(new Date(dateValue)):'Data non disponibile';
  const statusText=tournament.status==='reset'?'Archiviato e azzerato':(tournament.status==='finished'?'Concluso':String(tournament.status||'—'));
  const playerLines=(players||[]).map((p:any,i:number)=>(i+1)+'. '+String(p.display_name||'Giocatore')+' — '+Number(p.tournament_points||0)+' pt, '+Number(p.wins||0)+' vittorie, '+Number(p.losses||0)+' sconfitte'+(p.eliminated?' · eliminato':(p.qualified?' · qualificato':'')));
  const matchLines=(matches||[]).map((m:any)=>'Round '+m.round_number+': '+String(m.player1_name||'—')+' '+(m.player1_points===null?'':String(m.player1_points))+' - '+(m.player2_points===null?'':String(m.player2_points))+' '+String(m.player2_name||'')+(m.winner_name?' · vince '+m.winner_name:(m.status==='bye'?' · passa automaticamente':'')));
  const detail='🏆 STORICO TORNEO\n'+String(tournament.name||'Torneo Scopa')+'\nStato: '+statusText+'\nGruppo: '+String(group?.chat_title||('Gruppo '+tournament.group_chat_id))+'\nData: '+dateText+'\nRound raggiunto: '+Number(tournament.current_round||0)+'\nID: '+String(tournament.id)+'\n\nPARTECIPANTI\n'+(playerLines.length?playerLines.join('\n'):'Nessun partecipante registrato')+'\n\nPARTITE\n'+(matchLines.length?matchLines.join('\n'):'Nessuna partita registrata')+'\n\nPer tornare all’elenco: /cronologiatornei';
  await telegram('sendMessage',{chat_id:chat.id,text:detail.slice(0,3900)});return new Response('ok');
 }
 const {data:tournaments,error:tournamentsError}=await db.from('scopa_tournaments').select('id,name,status,current_round,group_chat_id,created_at,finished_at,archived_at').eq('created_by',Number(from.id)).in('status',['reset','finished']).order('created_at',{ascending:false}).limit(15);
 if(tournamentsError)throw tournamentsError;
 if(!tournaments?.length){await telegram('sendMessage',{chat_id:chat.id,text:'📚 Non ci sono ancora tornei archiviati o conclusi. Quando ne archivierai o concluderai uno, lo troverai qui.'});return new Response('ok');}
 const groupIds=[...new Set(tournaments.map((t:any)=>Number(t.group_chat_id)))];
 const {data:groups,error:groupsError}=await db.from('telegram_group_authorizations').select('chat_id,chat_title').in('chat_id',groupIds);if(groupsError)throw groupsError;
 const groupNames=new Map((groups||[]).map((g:any)=>[Number(g.chat_id),String(g.chat_title||'Gruppo')]));
 const lines=tournaments.map((t:any,i:number)=>{const dt=t.archived_at||t.finished_at||t.created_at;const date=dt?new Intl.DateTimeFormat('it-IT',{dateStyle:'short',timeZone:'Europe/Rome'}).format(new Date(dt)):'—';const state=t.status==='reset'?'Archiviato':'Concluso';return (i+1)+'. '+String(t.name||'Torneo Scopa')+' · '+state+'\n   '+String(groupNames.get(Number(t.group_chat_id))||('Gruppo '+t.group_chat_id))+' · '+date+'\n   ID: '+String(t.id);});
 await telegram('sendMessage',{chat_id:chat.id,text:'📚 CRONOLOGIA TORNEI\n\n'+lines.join('\n\n')+'\n\nPer aprire un torneo, invia:\n/cronologiatornei ID'});
 return new Response('ok');
}
if(isTournamentCommand){
 if(chat.type!=='group'&&chat.type!=='supergroup'){await telegram('sendMessage',{chat_id:chat.id,text:'I comandi del torneo si usano nel gruppo.'});return new Response('ok');}
 if(!isGroupManagerId(from.id)){await telegram('sendMessage',{chat_id:chat.id,text:'Non sei autorizzato a gestire il torneo.'});return new Response('ok');}
 const groupId=Number(chat.id);
 if(commandName==='torneoproclama'){
  const {data:finishedTournament,error:finishedError}=await db.from('scopa_tournaments').select('id,name,created_at').eq('group_chat_id',groupId).eq('status','finished').order('finished_at',{ascending:false}).limit(1).maybeSingle();
  if(finishedError)throw finishedError;
  if(!finishedTournament){await telegram('sendMessage',{chat_id:groupId,text:'Non trovo un torneo concluso in questo gruppo.'});return new Response('ok');}
  const {data:winners,error:winnersError}=await db.from('scopa_tournament_players').select('display_name,qualified,eliminated').eq('tournament_id',finishedTournament.id).eq('qualified',true).eq('eliminated',false);
  if(winnersError)throw winnersError;
  if(!winners||winners.length!==1){await telegram('sendMessage',{chat_id:groupId,text:'Non riesco a identificare un unico vincitore finale. Nessuna locandina pubblicata.'});return new Response('ok');}
  const champion=String(winners[0].display_name||'Campione');
  try{await sendTournamentWinnerPoster(groupId,champion);}
  catch(photoError){console.error('Tournament winner poster failed',photoError);await telegram('sendMessage',{chat_id:groupId,text:'🏆 TORNEO CONCLUSO!\\nVincitrice: '+champion+'\\nLa locandina non è stata caricata. Riprova tra poco.'});}
  return new Response('ok');
 }
 if(commandName==='torneonuovo'&&String(from.id)!==OWNER_ID){await telegram('sendMessage',{chat_id:groupId,text:'Non sei autorizzato ad aprire un nuovo torneo.'});return new Response('ok');}
 const {data:active,error:activeError}=await db.from('scopa_tournaments').select('*').eq('group_chat_id',groupId).eq('status','active').order('created_at',{ascending:false}).limit(1).maybeSingle();if(activeError)throw activeError;
 if(commandName==='torneonuovo'){
  if(active){await telegram('sendMessage',{chat_id:groupId,text:'C’è già un torneo attivo. Usa /torneopartecipanti o /torneoclassifica.'});return new Response('ok');}
  const {data:tournament,error:createError}=await db.from('scopa_tournaments').insert({group_chat_id:groupId,created_by:Number(from.id),name:'Torneo Scopa',status:'active',current_round:1}).select('*').single();if(createError)throw createError;
  try{
   await sendTournamentOpeningPoster(groupId,String(tournament.id));
  }catch(photoError){
   console.error('Tournament opening photo failed; using text fallback',photoError);
   await telegram('sendMessage',{chat_id:groupId,text:'🏆 TORNEO SCOPA APERTO · by Dany\nPremi ISCRIVITI per partecipare. Quando l’organizzatrice chiude le iscrizioni, il bot sorteggia automaticamente le coppie. Ogni coppia può giocare la mano successiva appena tutte le coppie ancora in gara hanno completato quella precedente.',reply_markup:{inline_keyboard:[[{text:'ISCRIVITI AL TORNEO',callback_data:'scopatorneo:join:'+tournament.id}],[{text:'ANNULLA ISCRIZIONE',callback_data:'scopatorneo:withdraw:'+tournament.id}]]}});
  }
  return new Response('ok');
 }
 if(!active){await telegram('sendMessage',{chat_id:groupId,text:'Non c’è un torneo attivo in questo gruppo. Usa /torneonuovo per crearne uno.'});return new Response('ok');}
 if(commandName==='promemoria'){
  console.log('Manual tournament reminder requested',JSON.stringify({groupId,tournamentId:active.id,requesterId:from.id,round:active.current_round}));
  const {data:players,error:playersError}=await db.from('scopa_tournament_players').select('telegram_id,display_name,paired_opponent_id,eliminated,qualified').eq('tournament_id',active.id).order('joined_at',{ascending:true});if(playersError)throw playersError;
  const byId=new Map<number,any>((players||[]).map((p:any)=>[Number(p.telegram_id),p]));
  const activePairs=new Map<string,{a:number,b:number}>();
  const pairKey=(a:number,b:number)=>[Math.min(a,b),Math.max(a,b)].join(':');
  for(const p of (players||[])){
   const a=Number(p.telegram_id),b=Number(p.paired_opponent_id||0),other=byId.get(b);
   if(!b||!other||a>b||p.eliminated||p.qualified||other.eliminated||other.qualified||Number(other.paired_opponent_id)!==a)continue;
   activePairs.set(pairKey(a,b),{a,b});
  }
  if(!activePairs.size){await telegram('sendMessage',{chat_id:groupId,text:'✅ Non ci sono coppie ancora in gara che devono giocare.'});return new Response('ok');}
  const {data:matches,error:matchesError}=await db.from('scopa_tournament_matches').select('player1_telegram_id,player2_telegram_id,status').eq('tournament_id',active.id).eq('round_number',Number(active.current_round));if(matchesError)throw matchesError;
  const completedCounts=new Map<string,number>([...activePairs.keys()].map((key:string)=>[key,0]));
  const activePairKeys=new Set<string>();
  for(const m of matches||[]){
   const key=pairKey(Number(m.player1_telegram_id),Number(m.player2_telegram_id));
   if(m.status==='finished'&&completedCounts.has(key))completedCounts.set(key,(completedCounts.get(key)||0)+1);
   else if((m.status==='waiting'||m.status==='playing')&&activePairs.has(key))activePairKeys.add(key);
  }
  const currentCompleted=Math.min(...completedCounts.values());
  const handNumber=currentCompleted+1;
  const pending:string[]=[];
  for(const [key,pair] of activePairs){
   if((completedCounts.get(key)||0)!==currentCompleted||activePairKeys.has(key))continue;
   const first=byId.get(pair.a),second=byId.get(pair.b);
   pending.push(String(first?.display_name||'Giocatore')+' VS '+String(second?.display_name||'Giocatore'));
  }
  const response=pending.length?'⏳ DEVONO ANCORA COMPLETARE LA MANO '+handNumber+'\n\n'+pending.join('\n'):activePairKeys.size?'🟢 Le altre coppie hanno già avviato la partita. Nessun promemoria da inviare a chi sta già giocando.':'✅ Tutte le coppie hanno completato la mano corrente.';
  await telegram('sendMessage',{chat_id:groupId,text:response});
  return new Response('ok');
 }
 if(commandName==='torneoabbina'){
  if(active.pairing_draft?.registrationsClosed===true){await telegram('sendMessage',{chat_id:groupId,text:'🔒 Le iscrizioni sono già chiuse e gli abbinamenti del Round '+Number(active.current_round||1)+' sono già stati assegnati.'});return new Response('ok');}
  const {count:existingMatches,error:matchesError}=await db.from('scopa_tournament_matches').select('id',{count:'exact',head:true}).eq('tournament_id',active.id);
  if(matchesError)throw matchesError;
  if(Number(existingMatches||0)>0){await telegram('sendMessage',{chat_id:groupId,text:'🔒 Il torneo è già iniziato: non posso rifare gli abbinamenti.'});return new Response('ok');}
  const {data:players,error:playersError}=await db.from('scopa_tournament_players').select('*').eq('tournament_id',active.id).order('joined_at',{ascending:true});
  if(playersError)throw playersError;
  const eligible=(players||[]).filter((p:any)=>!p.eliminated&&!p.qualified);
  if(eligible.length<2){await telegram('sendMessage',{chat_id:groupId,text:'Servono almeno due iscritti per chiudere le iscrizioni e sorteggiare le coppie. Le iscrizioni restano aperte.'});return new Response('ok');}
  const assigned=await assignAutomaticTournamentPairs(String(active.id),Number(active.current_round||1),eligible);
  const lines=assigned.pairs.map(([a,b]:any)=>String(a.display_name||'Giocatore')+' VS '+String(b.display_name||'Giocatore'));
  const byeLine=assigned.bye?'\\n\\n🍀 '+String(assigned.bye.display_name||'Giocatore')+' passa automaticamente il turno per numero dispari di iscritti.':'';
  await telegram('sendMessage',{chat_id:groupId,text:'🏆 ISCRIZIONI CHIUSE · ABBINAMENTI AUTOMATICI\\nROUND '+Number(active.current_round||1)+'\\n\\n'+lines.join('\\n')+byeLine+'\\n\\nLe coppie sono state sorteggiate e restano fisse per questo round. Ogni coppia può giocare la mano successiva appena tutte le coppie ancora in gara hanno completato quella precedente.'});
  return new Response('ok');
 }
 if(commandName==='torneocoppie'){
  const {data:players,error:playersError}=await db.from('scopa_tournament_players').select('telegram_id,display_name,paired_opponent_id,eliminated,qualified,advanced_by_bye').eq('tournament_id',active.id).order('joined_at',{ascending:true});if(playersError)throw playersError;
  if(!players?.length){await telegram('sendMessage',{chat_id:groupId,text:'Non ci sono ancora iscritti al torneo.'});return new Response('ok');}
  const byId=new Map<number,any>((players||[]).map((p:any)=>[Number(p.telegram_id),p]));
  const seen=new Set<number>();const pairLines:string[]=[];
  for(const p of players){
   const id=Number(p.telegram_id),opp=Number(p.paired_opponent_id||0),other=byId.get(opp);
   if(!opp||!other||p.eliminated||p.qualified||other.eliminated||other.qualified||Number(other.paired_opponent_id)!==id||seen.has(id)||seen.has(opp))continue;
   pairLines.push((pairLines.length+1)+'. '+String(p.display_name||'Giocatore')+' 🆚 '+String(other.display_name||'Giocatore'));
   seen.add(id);seen.add(opp);
  }
  const waiting=players.filter((p:any)=>!seen.has(Number(p.telegram_id))&&!p.eliminated&&!p.qualified);
  const lines=['🤝 COPPIE DEL TORNEO · ROUND '+active.current_round,''];
  lines.push(...(pairLines.length?pairLines:['Nessuna coppia assegnata.']));
  if(waiting.length)lines.push('','⏳ SENZA COPPIA',...waiting.map((p:any)=>'• '+String(p.display_name||'Giocatore')));
  const byePlayers=players.filter((p:any)=>Number(p.advanced_by_bye||0)>0&&!p.paired_opponent_id&&!p.eliminated);
  if(byePlayers.length)lines.push('','⏩ PASSAGGIO AUTOMATICO',...byePlayers.map((p:any)=>'• '+String(p.display_name||'Giocatore')));
  await telegram('sendMessage',{chat_id:groupId,text:lines.join('\n')});
  return new Response('ok');
 }
 if(commandName==='torneopartecipanti'||commandName==='torneoclassifica'){
  const {data:players,error:playersError}=await db.from('scopa_tournament_players').select('telegram_id,display_name,tournament_points,wins,losses,eliminated,qualified,advanced_by_bye').eq('tournament_id',active.id).order('joined_at',{ascending:true});if(playersError)throw playersError;
  if(!players?.length){await telegram('sendMessage',{chat_id:groupId,text:'Non ci sono ancora iscritti al torneo.'});return new Response('ok');}
  const list=players.map((p:any,i:number)=>{const status=p.eliminated?'🔴 Eliminato':(p.qualified?'🟢 Qualificato':'🟢 In gara');return (i+1)+'. '+p.display_name+(commandName==='torneoclassifica'?' · '+p.tournament_points+' pt':'')+(p.eliminated||p.qualified?' · '+status:'');}).join('\n');
  const heading=commandName==='torneopartecipanti'?'🏆 TORNEO':'🏆 CLASSIFICA TORNEO';
  const countLine=commandName==='torneopartecipanti'?'👥 '+players.length+' giocatori\n':'';
  const footer=commandName==='torneopartecipanti'&&players.every((p:any)=>!p.eliminated&&!p.qualified)?'\n🟢 Tutti in gara':'';
  await telegram('sendMessage',{chat_id:groupId,text:heading+' · ROUND '+active.current_round+'\n'+countLine+list+footer});
  return new Response('ok');
 }
 if(commandName==='torneoazzera'){
  const {error:resetError}=await db.from('scopa_tournaments').update({status:'reset',archived_at:new Date().toISOString()}).eq('id',active.id);if(resetError)throw resetError;
  await telegram('sendMessage',{chat_id:groupId,text:'🧹 Torneo archiviato e azzerato. La classifica delle partite normali non è stata toccata. Puoi crearne uno nuovo con /torneonuovo.'});
  return new Response('ok');
 }
 await telegram('sendMessage',{chat_id:groupId,text:'Comando torneo non riconosciuto. Usa /torneocoppie per vedere gli abbinamenti.'});
 return new Response('ok');
}
if(chat.type==='private'){
 if(commandName==='torneoabbina'){
  if(String(from.id)!==OWNER_ID){await telegram('sendMessage',{chat_id:chat.id,text:'Non sei autorizzato a preparare gli abbinamenti.'});return new Response('ok');}
  const {data:tournament,error:tournamentError}=await db.from('scopa_tournaments').select('id,current_round').eq('created_by',Number(from.id)).eq('status','active').order('created_at',{ascending:false}).limit(1).maybeSingle();if(tournamentError)throw tournamentError;
  if(!tournament){await telegram('sendMessage',{chat_id:chat.id,text:'Non c’è un torneo attivo da abbinare.'});return new Response('ok');}
  await telegram('sendMessage',{chat_id:chat.id,text:'🏆 PREPARAZIONE ABBINAMENTI · ROUND '+tournament.current_round+'\\nScegli qui i giocatori. Le coppie confermate saranno pubblicate nel gruppo del torneo.'});
  await sendTournamentPairWizard(tournament.id,Number(chat.id));return new Response('ok');
 }
 if(commandName==='torneomodifica'){
  if(String(from.id)!==OWNER_ID){await telegram('sendMessage',{chat_id:chat.id,text:'Non sei autorizzato a modificare gli abbinamenti.'});return new Response('ok');}
  const {data:tournament,error:tournamentError}=await db.from('scopa_tournaments').select('id').eq('created_by',Number(from.id)).eq('status','active').order('created_at',{ascending:false}).limit(1).maybeSingle();if(tournamentError)throw tournamentError;
  if(!tournament){await telegram('sendMessage',{chat_id:chat.id,text:'Non c’è un torneo attivo da modificare.'});return new Response('ok');}
  await sendTournamentEditMenu(tournament.id,Number(chat.id));return new Response('ok');
 }
 if(param.startsWith('pair_')){
  if(String(from.id)!==OWNER_ID){await telegram('sendMessage',{chat_id:chat.id,text:'Non sei autorizzato a preparare gli abbinamenti.'});return new Response('ok');}
  const tournamentId=param.slice(5);
  await sendTournamentPairWizard(tournamentId,Number(chat.id));
  return new Response('ok');
 }
 if(isCloseRoomCommand){await telegram('sendMessage',{chat_id:chat.id,text:'Il comando /chiudiscopa si usa nel gruppo in cui è stata creata la stanza.'});return new Response('ok');}
 const code=param.startsWith('room_')?param.slice(5):param;
 const miniLink=code?`https://t.me/${BOT_USERNAME}?startapp=${encodeURIComponent(code)}`:null;
 await telegram('sendMessage',{chat_id:chat.id,text:code?'Apri la stanza: la partita parte automaticamente quando entrano entrambi i giocatori.':'Per iniziare, apri un gruppo in cui è presente questo bot e invia /scopa. Ogni gruppo avrà stanze e partite indipendenti.',...(miniLink?{reply_markup:{inline_keyboard:[[{text:'♠ Apri Scopa',url:miniLink}]]}}:{})});return new Response('ok');}
if(chat.type==='group'||chat.type==='supergroup'){
 if(isCloseRoomCommand){
  if(!isGroupManagerId(from.id)){await telegram('sendMessage',{chat_id:chat.id,text:'Non sei autorizzato a usare /chiudiscopa.'});return new Response('ok');}
  const {data:waitingRoom,error:findError}=await db.from('scopa_telegram_rooms').select('*').eq('group_chat_id',Number(chat.id)).in('mode',['complete','single']).in('status',['waiting','playing']).order('created_at',{ascending:false}).limit(1).maybeSingle();
  if(findError)throw findError;
  if(!waitingRoom){await telegram('sendMessage',{chat_id:chat.id,text:'Non ci sono stanze aperte da chiudere.'});return new Response('ok');}
  const now=new Date().toISOString();
  const closeMessage=`🚫 STANZA ${waitingRoom.room_code} CHIUSA\nLa partita è stata chiusa da un amministratore del gruppo. Per creare una nuova partita, usa /scopa.`;
  const {data:closed,error:closeError}=await db.from('scopa_telegram_rooms').update({status:'finished',turn_deadline_at:null,result_message:closeMessage,finished_at:now,updated_at:now,version:Number(waitingRoom.version||0)+1}).eq('id',waitingRoom.id).in('status',['waiting','playing']).select('id').maybeSingle();
  if(closeError)throw closeError;
  if(!closed){await telegram('sendMessage',{chat_id:chat.id,text:'La stanza è già stata avviata o chiusa. Nessuna modifica effettuata.'});return new Response('ok');}
  await telegram('sendMessage',{chat_id:chat.id,text:closeMessage});
  return new Response('ok');
 }
 const {data:tournament,error:tError}=await db.from('scopa_tournaments').select('*').eq('group_chat_id',Number(chat.id)).eq('status','active').order('created_at',{ascending:false}).limit(1).maybeSingle();if(tError)throw tError;
 if(tournament){
  const {data:me,error:meError}=await db.from('scopa_tournament_players').select('*').eq('tournament_id',tournament.id).eq('telegram_id',Number(from.id)).maybeSingle();if(meError)throw meError;
  if(isScopaCommand)console.log('Scopa command received in active tournament',JSON.stringify({groupId:Number(chat.id),requesterId:Number(from.id),tournamentId:tournament.id,playerFound:!!me,pairedOpponentId:me?.paired_opponent_id??null,qualified:me?.qualified??null,eliminated:me?.eliminated??null}));
  if(me&&!me.eliminated&&!me.qualified&&me.paired_opponent_id){
   const {data:opponent,error:opError}=await db.from('scopa_tournament_players').select('*').eq('tournament_id',tournament.id).eq('telegram_id',Number(me.paired_opponent_id)).maybeSingle();if(opError)throw opError;
   if(!opponent||opponent.eliminated||opponent.qualified){await telegram('sendMessage',{chat_id:chat.id,text:'Il tuo avversario non è disponibile nel round attuale.'});return new Response('ok');}
   const playDate=new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Rome'});
   const {data:roundPlayers,error:roundPlayersError}=await db.from('scopa_tournament_players').select('telegram_id,paired_opponent_id,eliminated,qualified').eq('tournament_id',tournament.id);if(roundPlayersError)throw roundPlayersError;
   const activeById=new Map<number,any>((roundPlayers||[]).filter((p:any)=>!p.eliminated&&!p.qualified).map((p:any)=>[Number(p.telegram_id),p]));
   const pairKey=(a:number,b:number)=>[Math.min(a,b),Math.max(a,b)].join(':');
   const activePairs=new Map<string,{a:number,b:number}>();
   for(const p of activeById.values()){
    const a=Number(p.telegram_id),b=Number(p.paired_opponent_id||0),other=activeById.get(b);
    if(b&&other&&Number(other.paired_opponent_id)===a)activePairs.set(pairKey(a,b),{a,b});
   }
   const currentPairKey=pairKey(Number(me.telegram_id),Number(opponent.telegram_id));
   if(!activePairs.has(currentPairKey)){await telegram('sendMessage',{chat_id:chat.id,text:'La coppia non risulta più attiva nel round. Contatta un amministratore del gruppo.'});return new Response('ok');}
   const {data:roundMatches,error:roundMatchesError}=await db.from('scopa_tournament_matches').select('player1_telegram_id,player2_telegram_id,status').eq('tournament_id',tournament.id).eq('round_number',Number(tournament.current_round));if(roundMatchesError)throw roundMatchesError;
   const completedCounts=new Map<string,number>([...activePairs.keys()].map((key:string)=>[key,0]));
   for(const m of roundMatches||[]){
    if(m.status!=='finished')continue;
    const key=pairKey(Number(m.player1_telegram_id),Number(m.player2_telegram_id));
    if(completedCounts.has(key))completedCounts.set(key,(completedCounts.get(key)||0)+1);
   }
   const myCompleted=completedCounts.get(currentPairKey)||0;
   const minimumCompleted=Math.min(...completedCounts.values());
   if(myCompleted>minimumCompleted){
    await telegram('sendMessage',{chat_id:chat.id,text:'⏳ La tua coppia ha già completato la mano '+myCompleted+'. La mano successiva si sbloccherà quando tutte le altre coppie ancora in gara avranno completato la mano '+myCompleted+'. Gli avversari restano gli stessi.'});
    return new Response('ok');
   }
   const {data:open,error:openError}=await db.from('scopa_tournament_matches').select('player1_telegram_id,player2_telegram_id').eq('tournament_id',tournament.id).eq('round_number',Number(tournament.current_round)).in('status',['waiting','playing']);if(openError)throw openError;
   if((open||[]).some((m:any)=>[Number(m.player1_telegram_id),Number(m.player2_telegram_id)].includes(Number(me.telegram_id))||[Number(m.player1_telegram_id),Number(m.player2_telegram_id)].includes(Number(opponent.telegram_id)))){await telegram('sendMessage',{chat_id:chat.id,text:'La tua coppia ha già una stanza aperta.'});return new Response('ok');}
   const {data:pendingTournamentRoom,error:pendingRoomError}=await db.from('scopa_telegram_rooms').select('room_code,player1_name,player2_name').eq('tournament_id',tournament.id).eq('mode','tournament').eq('status','waiting').limit(1).maybeSingle();if(pendingRoomError)throw pendingRoomError;
   if(pendingTournamentRoom){await telegram('sendMessage',{chat_id:chat.id,text:'⏳ UN’ALTRA COPPIA STA ENTRANDO NELLA PROPRIA STANZA.\nPrima devono entrare entrambi: '+String(pendingTournamentRoom.player1_name||'Giocatore')+' e '+String(pendingTournamentRoom.player2_name||'Giocatore')+'.\nAppena saranno entrambi presenti, la prossima coppia potrà aprire la propria stanza.'});return new Response('ok');}
   const handNumber=myCompleted+1;
   const {data:match,error:matchError}=await db.from('scopa_tournament_matches').insert({tournament_id:tournament.id,round_number:Number(tournament.current_round),play_date:playDate,player1_telegram_id:Number(me.telegram_id),player1_name:me.display_name,player2_telegram_id:Number(opponent.telegram_id),player2_name:opponent.display_name,status:'waiting'}).select('*').single();if(matchError)throw matchError;
   const roomCode=crypto.randomUUID().replaceAll('-','').slice(0,10).toUpperCase();
   const {error:roomError}=await db.from('scopa_telegram_rooms').insert({room_code:roomCode,group_chat_id:Number(chat.id),status:'waiting',mode:'tournament',tournament_id:tournament.id,tournament_match_id:match.id,player1_telegram_id:Number(me.telegram_id),player1_name:me.display_name,player2_telegram_id:Number(opponent.telegram_id),player2_name:opponent.display_name,created_by_telegram_id:Number(from.id),created_by_name:String(me.display_name||'Giocatore'),created_by_username:from.username?String(from.username):null,state:{joinedPlayers:[],tournamentHandNumber:handNumber},chat:[]});
   if(roomError){if(String((roomError as any)?.code||'')==='23505'){await db.from('scopa_tournament_matches').delete().eq('id',match.id);await telegram('sendMessage',{chat_id:chat.id,text:'⏳ Un’altra coppia ha appena aperto la propria stanza. Entrate prima entrambi in quella stanza; subito dopo sarà possibile aprire la vostra.'});return new Response('ok');}throw roomError;}
   const {error:linkError}=await db.from('scopa_tournament_matches').update({room_code:roomCode}).eq('id',match.id);if(linkError)throw linkError;
   const gameLink='https://t.me/'+BOT_USERNAME+'?startapp='+encodeURIComponent(roomCode);
   const watchLink='https://t.me/'+BOT_USERNAME+'?startapp='+encodeURIComponent('watch_'+roomCode);
   await telegram('sendMessage',{chat_id:chat.id,text:'🎴 STANZA TORNEO · MANO '+handNumber+'\nCOPPIA: '+me.display_name+' — '+opponent.display_name+'\nAperta da: '+String(me.display_name||'Giocatore')+'\nQuesta stanza è riservata a questi due giocatori. Entrate entrambi qui: solo dopo il vostro ingresso si potrà aprire la stanza della coppia successiva.\n\nGli altri membri possono assistere e chattare come spettatori.',reply_markup:{inline_keyboard:[[{text:'ENTRA NELLA PARTITA',url:gameLink}],[{text:'👀 GUARDA E CHATTA',url:watchLink}]]}});
   return new Response('ok');
  }
 }
 const requester=from.username?'@'+String(from.username):[from.first_name,from.last_name].filter(Boolean).join(' ')||'Utente Telegram';
 await telegram('sendMessage',{chat_id:chat.id,text:'SCOPA DI MONOPOLY GOITA\nRichiesta da: '+requester+'\nScegli il tipo di partita:',reply_markup:{inline_keyboard:[[{text:'PARTITA COMPLETA · 11 PUNTI',callback_data:'scopamode:complete'}],[{text:'MANO SINGOLA',callback_data:'scopamode:single'}]]}});return new Response('ok');}
return new Response('ok');}
async function handleAction(body:any,internalAuto=false){const identity=await verifyInitData(String(body.initData||''));const roomCode=String(body.roomId||'');if(!roomCode)throw new Error('Codice stanza mancante.');let room=await getRoom(roomCode);let you=playerKey(room,identity.id);
if(body.action==='watch')return {state:await stateWithVoiceUrls(room,identity.id,true)};
if(body.action==='join'){
 let joinedNow=false;
 if(!you){
  if(room.mode==='tournament'&&Number(identity.id)!==Number(room.player1_telegram_id)&&Number(identity.id)!==Number(room.player2_telegram_id))throw new Error('Questa stanza è riservata ai due giocatori abbinati nel torneo.');
  for(let attempt=0;attempt<4&&!you;attempt++){
   if(room.status!=='waiting')throw new Error('La partita è già iniziata e i due posti sono occupati.');
   const patch=room.player1_telegram_id==null?{player1_telegram_id:identity.id,player1_name:identity.name}:{player2_telegram_id:identity.id,player2_name:identity.name};
   const {data,error}=await db.from('scopa_telegram_rooms').update({...patch,version:room.version+1,updated_at:new Date().toISOString()}).eq('id',room.id).eq('version',room.version).select('*').maybeSingle();
   if(error)throw error;
   if(data){room=data;you=playerKey(room,identity.id);joinedNow=true;break;}
   room=await getRoom(roomCode);
   you=playerKey(room,identity.id);
  }
  if(!you)throw new Error('Non è stato possibile assegnare il posto. Riapri la stessa stanza.');
 }
 if(joinedNow&&room.group_chat_id){
  try{await telegram('sendMessage',{chat_id:room.group_chat_id,text:`👤 ${identity.name} è entrato nella stanza ${room.room_code}.\n${room.player1_telegram_id&&room.player2_telegram_id?'Entrambi i giocatori sono presenti: la partita parte automaticamente!':'In attesa del secondo giocatore…'}`});}
  catch(noticeError){console.error('Group join notice failed',noticeError);}
 }
 if(room.mode==='tournament'&&room.status==='waiting'){
  let joinedNow=false;
  for(let attempt=0;attempt<4;attempt++){
   const joined=Array.isArray((room.state as any)?.joinedPlayers)?(room.state as any).joinedPlayers.map(Number):[];
   if(joined.includes(identity.id))break;
   const nextState={...(room.state||{}),joinedPlayers:[...joined,identity.id]};
   const {data:joinState,error:joinStateError}=await db.from('scopa_telegram_rooms').update({state:nextState,version:Number(room.version||0)+1,updated_at:new Date().toISOString()}).eq('id',room.id).eq('version',room.version).select('*').maybeSingle();
   if(joinStateError)throw joinStateError;
   if(joinState){room=joinState;joinedNow=true;break;}
   room=await getRoom(roomCode);
   if(room.status!=='waiting')break;
  }
  if(joinedNow&&room.group_chat_id){
   const joinedIds=Array.isArray((room.state as any)?.joinedPlayers)?(room.state as any).joinedPlayers.map(Number):[];
   const isFirst=joinedIds.length===1;
   const otherName=Number(room.player1_telegram_id)===identity.id?room.player2_name:room.player1_name;
   const entryText=isFirst
    ?'👤 PRIMO GIOCATORE ENTRATO\\n'+identity.name+' è entrato nella stanza.\\nIn attesa di '+String(otherName||'secondo giocatore')+'.'
    :'👤 SECONDO GIOCATORE ENTRATO\\n'+identity.name+' è entrato nella stanza.\\n✅ Entrambi i giocatori sono presenti.';
   try{await telegram('sendMessage',{chat_id:room.group_chat_id,text:entryText});}
   catch(noticeError){console.error('Tournament group join notice failed',noticeError);}
  }
 }
 if(room.player1_telegram_id&&room.player2_telegram_id&&room.status==='waiting'&&(room.mode!=='tournament'||((room.state as any)?.joinedPlayers||[]).length>=2)){
  const g=newGame();
  if(room.mode==='tournament')(g as any).tournamentHandNumber=Math.max(1,Number((room.state as any)?.tournamentHandNumber||1));
  const {data:started,error:se}=await db.from('scopa_telegram_rooms').update({state:g,status:'playing',turn_deadline_at:new Date(Date.now()+15000).toISOString(),version:room.version+1,updated_at:new Date().toISOString()}).eq('id',room.id).eq('version',room.version).select('*').maybeSingle();
  if(se)throw se;
  room=started??await getRoom(roomCode);
  if(started&&room.tournament_match_id){
   const {error:matchStartError}=await db.from('scopa_tournament_matches').update({status:'playing'}).eq('id',room.tournament_match_id).eq('status','waiting');
   if(matchStartError)throw matchStartError;
   const handNumber=Math.max(1,Number((room.state as any)?.tournamentHandNumber||1));
   try{await telegram('sendMessage',{chat_id:room.group_chat_id,text:'🟢 PARTITA INIZIATA · MANO '+handNumber+'\\n'+room.player1_name+' — '+room.player2_name+'\\n🎴 I due giocatori sono al tavolo: STANNO GIOCANDO!\\n➡️ Ora la coppia successiva può aprire la propria stanza.'});}
   catch(noticeError){console.error('Tournament game-start notice failed',noticeError);}
  }
 }
 return {state:await stateWithVoiceUrls(room,identity.id)};
}
room=await getRoom(roomCode);you=playerKey(room,identity.id);
if(body.action==='state'){
 if(room.status==='playing'&&room.turn_deadline_at&&Date.parse(room.turn_deadline_at)<=Date.now()){
  const timedGame=room.state as Game;const timedPlayer=timedGame.turn;const timedHand=timedGame.hands[timedPlayer]||[];
  if(timedHand.length){const timedCard=timedHand[Math.floor(Math.random()*timedHand.length)];const timedCombos=combinations(timedGame.board,timedCard.rank);return await handleAction({...body,action:'move',cardId:timedCard.id,captureIds:timedCombos[0]||[]},true);}
 }
 return {state:await stateWithVoiceUrls(room,identity.id,!you&&body.spectator===true)};
}
if(body.action==='voice'){
 const spectator=!you&&body.spectator===true;
 if(!you&&!spectator)throw new Error('Non sei autorizzato a inviare vocali in questa chat.');
 if(!['waiting','playing'].includes(room.status))throw new Error('La chat della partita è chiusa.');
 const encoded=String(body.audioBase64||'');
 if(!encoded||encoded.length>2100000)throw new Error('Registrazione non valida o troppo grande.');
 const mime=String(body.mime||'audio/webm').split(';')[0].toLowerCase();
 const allowed=['audio/webm','audio/ogg','audio/mp4','audio/mpeg'];
 if(!allowed.includes(mime))throw new Error('Formato audio non supportato.');
 const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
 if(!bytes.length||bytes.length>1500000)throw new Error('Il vocale deve essere inferiore a 1,5 MB.');
 await ensureVoiceBucket();
 const ext=mime==='audio/ogg'?'ogg':mime==='audio/mp4'?'mp4':mime==='audio/mpeg'?'mp3':'webm';
 const path=room.room_code+'/'+identity.id+'/'+crypto.randomUUID()+'.'+ext;
 const {error:uploadError}=await db.storage.from(VOICE_BUCKET).upload(path,bytes,{contentType:mime,upsert:false});
 if(uploadError)throw uploadError;
 const message={type:'voice',name:identity.name,path,duration:Math.max(1,Math.min(30,Number(body.duration)||1)),createdAt:new Date().toISOString()};
 for(let attempt=0;attempt<4;attempt++){
  const chat=Array.isArray(room.chat)?room.chat:[];
  const {data,error}=await db.from('scopa_telegram_rooms').update({chat:[...chat,message].slice(-100),version:Number(room.version||0)+1,updated_at:new Date().toISOString()}).eq('id',room.id).eq('version',Number(room.version||0)).select('*').maybeSingle();
  if(error)throw error;
  if(data)return {state:await stateWithVoiceUrls(data,identity.id,spectator)};
  room=await getRoom(roomCode);you=playerKey(room,identity.id);
  if(!you&&!spectator)throw new Error('Non sei autorizzato a inviare vocali in questa chat.');
 }
 throw new Error('La chat è stata aggiornata contemporaneamente. Riprova.');
}
if(body.action==='chat'){
 const spectator=!you&&body.spectator===true;
 if(!you&&!spectator)throw new Error('Non sei autorizzato a scrivere in questa chat.');
 if(!['waiting','playing'].includes(room.status))throw new Error('La chat della partita è chiusa.');
 const messageText=String(body.text||'').trim().slice(0,180);
 if(!messageText)throw new Error('Scrivi un messaggio prima di inviare.');
 for(let attempt=0;attempt<4;attempt++){
  const chat=Array.isArray(room.chat)?room.chat:[];
  const message={type:'text',name:identity.name,text:messageText,createdAt:new Date().toISOString()};
  const nextChat=[...chat,message].slice(-100);
  const {data,error}=await db.from('scopa_telegram_rooms').update({chat:nextChat,version:Number(room.version||0)+1,updated_at:new Date().toISOString()}).eq('id',room.id).eq('version',Number(room.version||0)).select('*').maybeSingle();
  if(error)throw error;
  if(data)return {state:await stateWithVoiceUrls(data,identity.id,spectator)};
  room=await getRoom(roomCode);
  you=playerKey(room,identity.id);
  if(!you&&!spectator)throw new Error('Non sei autorizzato a scrivere in questa chat.');
 }
 throw new Error('La chat è stata aggiornata contemporaneamente. Riprova.');
}

if(body.action==='move'){
 if(!you&&!internalAuto)throw new Error('Solo i due giocatori possono tirare le carte.');
 if(room.status!=='playing')throw new Error('La partita non è in corso.');
 const g=structuredClone(room.state) as Game;
 if(internalAuto)you=g.turn;
 if(g.turn!==you)throw new Error('Non è il tuo turno.');
 if(!internalAuto&&room.turn_deadline_at&&Date.parse(room.turn_deadline_at)<=Date.now())throw new Error('Tempo scaduto: aggiorno la mossa automatica.');
 const cardId=Number(body.cardId);
 const hand=g.hands[you];
 const card=hand.find(c=>c.id===cardId);
 if(!card)throw new Error('Questa carta non è nella tua mano.');
 const captureIds=Array.isArray(body.captureIds)?body.captureIds.map(Number):[];
 const legal=combinations(g.board,card.rank);
 let captured:Card[]=[];
 if(captureIds.length){
  const valid=legal.some(combo=>combo.length===captureIds.length&&combo.every(id=>captureIds.includes(id)));
  if(!valid)throw new Error('La combinazione selezionata non è valida.');
  captured=g.board.filter(c=>captureIds.includes(c.id));
 }else if(legal.length)throw new Error('Devi prendere una combinazione possibile di carte.');
 g.lastMove={card:{...card},player:you,at:Date.now()};
 hand.splice(hand.findIndex(c=>c.id===cardId),1);
 let scopa=false;
 if(captured.length){
  g.board=g.board.filter(c=>!captureIds.includes(c.id));
  g.captured[you].push(card,...captured);
  g.lastCapturer=you;
  if(g.board.length===0&&(g.hands.player1.length+g.hands.player2.length>0||g.deck.length>0)){
   g.scopes[you]++;g.scopeTotals=g.scopeTotals||{player1:Number(g.scopes.player1||0),player2:Number(g.scopes.player2||0)};g.scopeTotals[you]++;scopa=true;g.scopaEvent=(g.scopaEvent||0)+1;g.scopaBy=you;
  }
 }else g.board.push(card);
 const roundEnded=g.hands.player1.length===0&&g.hands.player2.length===0&&g.deck.length===0;
 let roundDetail='';
 if(roundEnded){
  if(g.board.length&&g.lastCapturer)g.captured[g.lastCapturer].push(...g.board);
  g.board=[];
  const round=tally(g);
  g.scores.player1+=round.scores.player1;g.scores.player2+=round.scores.player2;
  roundDetail=round.detail;g.history=g.history||[];
  g.history.push('Mano '+(g.history.length+1)+':\n'+round.detail);
  g.scopes={player1:0,player2:0};
 }
 if(g.hands.player1.length===0&&g.hands.player2.length===0&&g.deck.length){
  g.hands.player1=[g.deck.pop()!,g.deck.pop()!,g.deck.pop()!];
  g.hands.player2=[g.deck.pop()!,g.deck.pop()!,g.deck.pop()!];
 }
 let status=room.status;let winnerId:number|null=null;let resultMessage:string|null=null;
 if(g.scores.player1>=11||g.scores.player2>=11){
  status='finished';const win=g.scores.player1>=11?'player1':'player2';
  winnerId=Number(win==='player1'?room.player1_telegram_id:room.player2_telegram_id);
  const winnerName=win==='player1'?room.player1_name:room.player2_name;
  resultMessage='🏆 SCOPA DI MONOPOLY GOITA\nVince '+winnerName+'!\n'+room.player1_name+': '+g.scores.player1+' — '+room.player2_name+': '+g.scores.player2+'\nGrazie per aver giocato!';
 }else if(roundEnded&&(room.mode==='single'||room.mode==='tournament')){
  status='finished';
  if(g.scores.player1>g.scores.player2)winnerId=Number(room.player1_telegram_id);else if(g.scores.player2>g.scores.player1)winnerId=Number(room.player2_telegram_id);
  const winnerName=winnerId===Number(room.player1_telegram_id)?room.player1_name:(winnerId===Number(room.player2_telegram_id)?room.player2_name:null);
  const handTitle=room.mode==='tournament'?'MANO TORNEO':'MANO SINGOLA';
  resultMessage=winnerName?'🏆 <b>VITTORIA</b>\n🔴 <b>'+String(winnerName).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</b>\n\n'+String(room.player1_name).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+': '+g.scores.player1+' — '+String(room.player2_name).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+': '+g.scores.player2:'🤝 <b>'+handTitle+' IN PARITÀ</b>\n'+String(room.player1_name).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+': '+g.scores.player1+' — '+String(room.player2_name).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+': '+g.scores.player2;
 }else if(roundEnded){
  g.captured={player1:[],player2:[]};g.lastCapturer=null;
  const deck=deckOfCards();
  g.board=[deck.pop()!,deck.pop()!,deck.pop()!,deck.pop()!];
  g.hands={player1:[deck.pop()!,deck.pop()!,deck.pop()!],player2:[deck.pop()!,deck.pop()!,deck.pop()!]};
  g.deck=deck;g.turn='player1';
 }else g.turn=you==='player1'?'player2':'player1';
 const {data:updated,error}=await db.from('scopa_telegram_rooms').update({state:g,status,turn_deadline_at:status==='playing'?new Date(Date.now()+15000).toISOString():null,winner_telegram_id:winnerId,result_message:resultMessage,finished_at:status==='finished'?new Date().toISOString():null,version:room.version+1,updated_at:new Date().toISOString()}).eq('id',room.id).eq('version',room.version).select('*').maybeSingle();
 if(error)throw error;
 if(!updated)throw new Error('La stanza è cambiata contemporaneamente. Aggiorna e riprova.');
 if(status==='finished'&&updated.group_chat_id&&updated.mode!=='tournament'){
  const {error:recordError}=await db.from('scopa_group_match_results').upsert({room_id:updated.id,group_chat_id:Number(updated.group_chat_id),player1_telegram_id:Number(updated.player1_telegram_id),player1_name:updated.player1_name,player1_score:Number(g.scores.player1||0),player2_telegram_id:Number(updated.player2_telegram_id),player2_name:updated.player2_name,player2_score:Number(g.scores.player2||0),winner_telegram_id:winnerId,finished_at:new Date().toISOString()},{onConflict:'room_id',ignoreDuplicates:true});
  if(recordError)console.error('Leaderboard save failed',recordError);
  const {data:rows, error:boardError}=await db.from('scopa_group_match_results').select('player1_telegram_id,player1_name,player1_score,player2_telegram_id,player2_name,player2_score,winner_telegram_id,finished_at').eq('group_chat_id',Number(updated.group_chat_id)).order('finished_at',{ascending:true});
  let boardText='';
  if(!boardError&&rows?.length){const totals=new Map<number,{name:string;points:number;wins:number;games:number}>();for(const row of rows){for(const p of [{id:Number(row.player1_telegram_id),name:String(row.player1_name||'Giocatore'),score:Number(row.player1_score||0)},{id:Number(row.player2_telegram_id),name:String(row.player2_name||'Giocatore'),score:Number(row.player2_score||0)}]){const item=totals.get(p.id)||{name:p.name,points:0,wins:0,games:0};item.name=p.name;item.points+=p.score;item.games++;if(Number(row.winner_telegram_id)===p.id)item.wins++;totals.set(p.id,item);}}const ranking=[...totals.values()].sort((a,b)=>b.points-a.points||b.wins-a.wins||a.name.localeCompare(b.name));boardText='\n\n📊 CLASSIFICA DEL GRUPPO\n'+ranking.map((p,i)=>`${i+1}. ${p.name} — ${p.points} punti (${p.wins} vittorie, ${p.games} partite)`).join('\n');}
  await telegram('sendMessage',{chat_id:updated.group_chat_id,text:(resultMessage||'Partita terminata.')+String(boardText||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),parse_mode:'HTML'});
}
 if(status==='finished'&&updated.mode==='tournament'&&updated.tournament_id&&updated.tournament_match_id){
  const tournamentId=updated.tournament_id;
  const id1=Number(updated.player1_telegram_id),id2=Number(updated.player2_telegram_id);
  const {data:players,error:playerReadError}=await db.from('scopa_tournament_players').select('*').eq('tournament_id',tournamentId).in('telegram_id',[id1,id2]);if(playerReadError)throw playerReadError;
  const p1=players?.find((p:any)=>Number(p.telegram_id)===id1),p2=players?.find((p:any)=>Number(p.telegram_id)===id2);
  if(!p1||!p2)throw new Error('Iscrizioni torneo non trovate per questa partita.');
  const hand1=Number(g.scores.player1||0),hand2=Number(g.scores.player2||0);
  const total1=Number(p1.tournament_points||0)+hand1,total2=Number(p2.tournament_points||0)+hand2;
  const roundTotal1=Number(p1.round_points||0)+hand1,roundTotal2=Number(p2.round_points||0)+hand2;
  const qualified1=roundTotal1>=11,qualified2=roundTotal2>=11;
  const {error:saveMatchError}=await db.from('scopa_tournament_matches').update({status:'finished',player1_points:hand1,player2_points:hand2,points_awarded:hand1+hand2,winner_telegram_id:winnerId,loser_telegram_id:winnerId?(winnerId===id1?id2:id1):null,winner_name:winnerId?(winnerId===id1?p1.display_name:p2.display_name):null,loser_name:winnerId?(winnerId===id1?p2.display_name:p1.display_name):null,finished_at:new Date().toISOString()}).eq('id',updated.tournament_match_id);if(saveMatchError)throw saveMatchError;
  const {error:saveP1Error}=await db.from('scopa_tournament_players').update({tournament_points:total1,round_points:roundTotal1,qualified:qualified1,eliminated:qualified2&&!qualified1,wins:Number(p1.wins||0)+(winnerId===id1?1:0),losses:Number(p1.losses||0)+(winnerId===id2?1:0)}).eq('id',p1.id);if(saveP1Error)throw saveP1Error;
  const {error:saveP2Error}=await db.from('scopa_tournament_players').update({tournament_points:total2,round_points:roundTotal2,qualified:qualified2,eliminated:qualified1&&!qualified2,wins:Number(p2.wins||0)+(winnerId===id2?1:0),losses:Number(p2.losses||0)+(winnerId===id1?1:0)}).eq('id',p2.id);if(saveP2Error)throw saveP2Error;
  const state1=qualified1?'QUALIFICATO':(qualified2?'ELIMINATO':'ANCORA IN GARA');
  const state2=qualified2?'QUALIFICATO':(qualified1?'ELIMINATO':'ANCORA IN GARA');
  const tournamentWinnerName=winnerId===id1?p1.display_name:(winnerId===id2?p2.display_name:null);
  const tournamentMessage=(tournamentWinnerName?'🏆 MANO TORNEO CONCLUSA\n\nVince la mano: '+tournamentWinnerName+'!':'🤝 MANO TORNEO CONCLUSA IN PARITÀ')+'\n\nPUNTEGGIO TORNEO\n'+p1.display_name+': '+roundTotal1+'/11 — '+state1+'\n'+p2.display_name+': '+roundTotal2+'/11 — '+state2+(qualified1&&qualified2?'\n\nEntrambi qualificati per il prossimo round.':(qualified1||qualified2?'\n\nLa coppia è decisa: il giocatore qualificato passa al prossimo round.':'\n\nEntrambe ancora in gara.\nLa stessa coppia continua nella prossima giornata.'));
  await telegram('sendMessage',{chat_id:updated.group_chat_id,text:tournamentMessage});
  const {data:roundPlayers,error:roundPlayersError}=await db.from('scopa_tournament_players').select('*').eq('tournament_id',tournamentId);
  if(roundPlayersError)throw roundPlayersError;
  const activeById=new Map<number,any>((roundPlayers||[]).filter((p:any)=>!p.eliminated&&!p.qualified).map((p:any)=>[Number(p.telegram_id),p]));
  const pairKey=(a:number,b:number)=>[Math.min(a,b),Math.max(a,b)].join(':');
  const activePairs=new Map<string,{a:number,b:number}>();
  for(const p of activeById.values()){
   const a=Number(p.telegram_id),b=Number(p.paired_opponent_id||0),other=activeById.get(b);
   if(b&&other&&Number(other.paired_opponent_id)===a)activePairs.set(pairKey(a,b),{a,b});
  }
  if(activePairs.size){
   const {data:gateTournament,error:gateTournamentError}=await db.from('scopa_tournaments').select('current_round').eq('id',tournamentId).maybeSingle();
   if(gateTournamentError)throw gateTournamentError;
   const {data:gateMatches,error:gateMatchesError}=await db.from('scopa_tournament_matches').select('player1_telegram_id,player2_telegram_id,status').eq('tournament_id',tournamentId).eq('round_number',Number(gateTournament?.current_round||0));
   if(gateMatchesError)throw gateMatchesError;
   const gateCounts=new Map<string,number>([...activePairs.keys()].map((key:string)=>[key,0]));
   for(const m of gateMatches||[]){
    if(m.status!=='finished')continue;
    const key=pairKey(Number(m.player1_telegram_id),Number(m.player2_telegram_id));
    if(gateCounts.has(key))gateCounts.set(key,(gateCounts.get(key)||0)+1);
   }
   const counts=[...gateCounts.values()];
   const minDone=Math.min(...counts),maxDone=Math.max(...counts);
   if(minDone>0&&minDone===maxDone){
    await telegram('sendMessage',{chat_id:updated.group_chat_id,text:'🏆 TUTTI I GIOCATORI HANNO COMPLETATO LA MANO '+minDone+'.\n\nPotete iniziare la MANO '+(minDone+1)+'!'});
   }else if(maxDone>minDone){
    await telegram('sendMessage',{chat_id:updated.group_chat_id,text:'⏳ Una o più coppie hanno già terminato la mano '+maxDone+'. Le altre coppie devono completare la mano '+maxDone+' prima dello sblocco successivo.'});
   }
  }
  const allResolved=(roundPlayers||[]).length>0&&(roundPlayers||[]).every((p:any)=>p.eliminated||p.qualified);
  if(allResolved){
   const advancing=(roundPlayers||[]).filter((p:any)=>p.qualified&&!p.eliminated);
   const {data:tournamentRow,error:tournamentRowError}=await db.from('scopa_tournaments').select('current_round,status').eq('id',tournamentId).maybeSingle();
   if(tournamentRowError)throw tournamentRowError;
   if(tournamentRow?.status==='active'&&advancing.length===1){
    const {data:finishedTournament,error:finishTournamentError}=await db.from('scopa_tournaments').update({status:'finished',finished_at:new Date().toISOString()}).eq('id',tournamentId).eq('status','active').select('id').maybeSingle();
    if(finishTournamentError)throw finishTournamentError;
    if(finishedTournament){
     const champion=String(advancing[0].display_name||'Campione');
     await telegram('sendMessage',{chat_id:updated.group_chat_id,text:'🏆 TORNEO CONCLUSO!\n\nIl torneo è terminato. Premi il pulsante qui sotto per proclamare il vincitore e pubblicare la locandina ufficiale.',reply_markup:{inline_keyboard:[[{text:'🏆 PROCLAMA IL VINCITORE',callback_data:'tw:'+tournamentId}]]}});
    }
   }else if(tournamentRow?.status==='active'&&advancing.length>1){
    const nextRound=Number(tournamentRow.current_round)+1;
    const {error:advanceRoundError}=await db.from('scopa_tournaments').update({current_round:nextRound}).eq('id',tournamentId).eq('current_round',tournamentRow.current_round);
    if(advanceRoundError)throw advanceRoundError;
    // Round nuovo: azzera gli abbinamenti di TUTTI (anche eliminati), così nessun partner del round precedente resta visibile nei promemoria.
    const {error:clearOldPairsError}=await db.from('scopa_tournament_players').update({paired_opponent_id:null}).eq('tournament_id',tournamentId);
    if(clearOldPairsError)throw clearOldPairsError;
    for(const player of advancing){
     const {error:resetRoundError}=await db.from('scopa_tournament_players').update({round_points:0,qualified:false,paired_opponent_id:null}).eq('id',player.id);
     if(resetRoundError)throw resetRoundError;
    }
    const assigned=await assignAutomaticTournamentPairs(String(tournamentId),nextRound,advancing);
    const pairLines=assigned.pairs.map(([a,b]:any)=>String(a.display_name||'Giocatore')+'\nVS\n'+String(b.display_name||'Giocatore'));
    const byeText=assigned.bye?'\n\nTURNO AUTOMATICO\n'+String(assigned.bye.display_name||'Giocatore')+' passa direttamente al prossimo round perché il numero dei partecipanti è dispari.':'';
    await telegram('sendMessage',{chat_id:updated.group_chat_id,text:'🏆 ROUND '+nextRound+'\nABBINAMENTI DEL ROUND\n\n'+pairLines.join('\n\n')+byeText+'\n\nLe coppie restano fisse per tutto il round.'});
   }
  }
 }
 return {state:await stateWithVoiceUrls(updated,identity.id),scopa};
}

if(body.action==='abandon'){
 if(!you)throw new Error('Solo uno dei due giocatori può abbandonare la partita.');
 if(room.status!=='playing')throw new Error('Puoi abbandonare solo una partita in corso.');
 const opponent=you==='player1'?'player2':'player1';
 const winnerId=Number(opponent==='player1'?room.player1_telegram_id:room.player2_telegram_id);
 const winnerName=opponent==='player1'?room.player1_name:room.player2_name;
 if(!winnerId||!winnerName)throw new Error('Non è presente un avversario a cui assegnare la vittoria.');
 const g=room.state as Game;
 const scores=g?.scores||{player1:0,player2:0};
 const totalScopes=Number(g?.scopes?.player1||0)+Number(g?.scopes?.player2||0);
 const resultMessage='🏆 SCOPA DI MONOPOLY GOITA\n🥇 Vince '+winnerName+' per abbandono dell’avversario.\n'+String(room.player1_name||'Giocatore 1')+': '+Number(scores.player1||0)+' — '+String(room.player2_name||'Giocatore 2')+': '+Number(scores.player2||0)+'\n✨ Scope: '+totalScopes+'\nGrazie per aver giocato!';
 const now=new Date().toISOString();
 const {data:updated,error}=await db.from('scopa_telegram_rooms').update({status:'finished',turn_deadline_at:null,winner_telegram_id:winnerId,result_message:resultMessage,finished_at:now,version:Number(room.version||0)+1,updated_at:now}).eq('id',room.id).eq('version',room.version).eq('status','playing').select('*').maybeSingle();
 if(error)throw error;
 if(!updated)throw new Error('La stanza è cambiata contemporaneamente. Aggiorna e riprova.');
 if(updated.mode==='tournament'&&updated.tournament_id&&updated.tournament_match_id){
  const {data:players,error:playerError}=await db.from('scopa_tournament_players').select('*').eq('tournament_id',updated.tournament_id).in('telegram_id',[Number(updated.player1_telegram_id),Number(updated.player2_telegram_id)]);if(playerError)throw playerError;
  const p1=players?.find((p:any)=>Number(p.telegram_id)===Number(updated.player1_telegram_id)),p2=players?.find((p:any)=>Number(p.telegram_id)===Number(updated.player2_telegram_id));
  if(p1&&p2){
   const winner=opponent==='player1'?p1:p2;const loser=you==='player1'?p1:p2;
   const {error:matchError}=await db.from('scopa_tournament_matches').update({status:'finished',winner_telegram_id:winnerId,loser_telegram_id:Number(loser.telegram_id),winner_name:winner.display_name,loser_name:loser.display_name,finished_at:now}).eq('id',updated.tournament_match_id);if(matchError)throw matchError;
   const {error:wError}=await db.from('scopa_tournament_players').update({qualified:true}).eq('id',winner.id);if(wError)throw wError;
   const {error:lError}=await db.from('scopa_tournament_players').update({eliminated:true,qualified:false}).eq('id',loser.id);if(lError)throw lError;
  }
  await telegram('sendMessage',{chat_id:updated.group_chat_id,text:resultMessage+'\n\n🏆 TORNEO: '+winnerName+' passa il turno per abbandono. L’avversario è eliminato.'});
 }
 if(updated.group_chat_id&&updated.mode!=='tournament'){
  const {error:recordError}=await db.from('scopa_group_match_results').upsert({room_id:updated.id,group_chat_id:Number(updated.group_chat_id),player1_telegram_id:Number(updated.player1_telegram_id),player1_name:String(updated.player1_name||'Giocatore 1'),player1_score:Number(scores.player1||0),player2_telegram_id:Number(updated.player2_telegram_id),player2_name:String(updated.player2_name||'Giocatore 2'),player2_score:Number(scores.player2||0),winner_telegram_id:winnerId,finished_at:now},{onConflict:'room_id',ignoreDuplicates:true});
  if(recordError)console.error('Leaderboard save after abandon failed',recordError);
  await telegram('sendMessage',{chat_id:updated.group_chat_id,text:resultMessage});
 }
 return {state:await stateWithVoiceUrls(updated,identity.id),scopa:false};
}
}
Deno.serve(async (req:Request)=>{if(req.method==='OPTIONS')return new Response('ok',{headers:cors});try{if(req.method==='GET'&&new URL(req.url).searchParams.get('action')==='botCheck'){
 const status=await ensureBotToken();
 if(!status.ok)return new Response(JSON.stringify({ok:false,expectedBot:BOT_USERNAME,activeSecretName:null,checks:status.checks}),{status:200,headers:cors});
 if(!WEBHOOK_SECRET)return new Response(JSON.stringify({ok:false,expectedBot:BOT_USERNAME,activeSecretName:status.source,error:'Segreto webhook non configurato.'}),{status:200,headers:cors});
 const hookUrl='https://sommziqnmxgkwyjatxcn.supabase.co/functions/v1/scopa-telegram-staging';
 try{
  const beforeHook=await telegramProbe('getWebhookInfo');
  const beforeMenu=await telegramProbe('getChatMenuButton');
  const beforeCommands=await telegramProbe('getMyCommands');
  const beforeGroupCommands=await telegramProbe('getMyCommands',{scope:{type:'all_group_chats'}});
  const beforePrivateCommands=await telegramProbe('getMyCommands',{scope:{type:'all_private_chats'}});
  const beforeOwnerCommands=await telegramProbe('getMyCommands',{scope:{type:'chat',chat_id:Number(OWNER_ID)}});
  const beforeAdminCommands=await telegramProbe('getMyCommands',{scope:{type:'all_chat_administrators'}});
  const knownGroupIds=['-1003989780784','-1004432387423'];
  const beforeChatCommands=await Promise.all(knownGroupIds.map(chat_id=>telegramProbe('getMyCommands',{scope:{type:'chat',chat_id}})));
  const me=await telegramProbe('getMe');
  if(!beforeHook.telegramOk||!beforeMenu.telegramOk||!beforeCommands.telegramOk||!me.telegramOk){
   throw new Error('Telegram non ha restituito tutte le verifiche di configurazione.');
  }
  const hookAllowed=beforeHook.result?.allowedUpdates;
  const webhookNeedsUpdate=beforeHook.result?.url!==hookUrl||(Array.isArray(hookAllowed)&&(!hookAllowed.includes('message')||!hookAllowed.includes('my_chat_member')||!hookAllowed.includes('callback_query')));
  let registrationOk=true;
  if(webhookNeedsUpdate){
   const registration=await telegram('setWebhook',{url:hookUrl,secret_token:WEBHOOK_SECRET,allowed_updates:['message','callback_query','my_chat_member']});
   registrationOk=registration.ok===true;
  }
  const menuConfigured=beforeMenu.result?.type==='web_app'&&beforeMenu.result?.webAppUrl===APP_URL&&beforeMenu.result?.text==='Scopa';
  let menuSetupOk=true;
  if(!menuConfigured){
   const menu=await telegram('setChatMenuButton',{menu_button:{type:'web_app',text:'Scopa',web_app:{url:APP_URL}}});
   menuSetupOk=menu.ok===true;
  }
  const groupCommandList=[
   {command:'scopa',description:'Avvia una partita'},
   {command:'classifica',description:'Classifica Scopa normale'},
   {command:'cronologia',description:'Vincitori tornei di questo gruppo'},
   {command:'azzera',description:'Azzera classifica Scopa (admin)'},
   {command:'regole',description:'Mostra le regole'},
   {command:'chiudiscopa',description:'Chiude la stanza'},
   {command:'torneonuovo',description:'Crea un torneo'},
   {command:'torneoazzera',description:'Archivia e azzera il torneo'},
   {command:'torneoabbina',description:'Abbina i giocatori'},
   {command:'promemoria',description:'Mostra chi deve ancora giocare'},
   {command:'torneoannuncia',description:'Pubblica l’esito della mano torneo'},
   {command:'torneoproclama',description:'Pubblica la locandina della vincitrice'}
  ];
  const privateCommandList=[
   {command:'cronologiatornei',description:'Consulta lo storico dei tornei'},
   {command:'torneomodifica',description:'Modifica gli abbinamenti'},
   {command:'torneoannullaabbinamenti',description:'Annulla gli abbinamenti'}
  ];
  const sameCommands=(actual:any[],expected:any[])=>actual.length===expected.length&&expected.every((e:any)=>actual.some((a:any)=>a.command===e.command&&a.description===e.description));
  const existingCommands=beforeCommands.result?.commands||[];
  const existingGroupCommands=beforeGroupCommands.result?.commands||[];
  const existingPrivateCommands=beforePrivateCommands.result?.commands||[];
  let commandsSetupOk=true;
  if(existingCommands.length){const x=await telegram('deleteMyCommands');commandsSetupOk=x.ok===true&&commandsSetupOk;}
  if(existingGroupCommands.length){const x=await telegram('deleteMyCommands',{scope:{type:'all_group_chats'}});commandsSetupOk=x.ok===true&&commandsSetupOk;}
  if(existingPrivateCommands.length){const x=await telegram('deleteMyCommands',{scope:{type:'all_private_chats'}});commandsSetupOk=x.ok===true&&commandsSetupOk;}
  const g=await telegram('setMyCommands',{commands:groupCommandList,scope:{type:'all_group_chats'}});
  const a=await telegram('setMyCommands',{commands:groupCommandList,scope:{type:'all_chat_administrators'}});
  const o=await telegram('setMyCommands',{commands:privateCommandList,scope:{type:'chat',chat_id:Number(OWNER_ID)}});
  commandsSetupOk=g.ok===true&&a.ok===true&&o.ok===true&&commandsSetupOk;
  for(const chat_id of knownGroupIds){const x=await telegram('deleteMyCommands',{scope:{type:'chat',chat_id}});commandsSetupOk=x.ok===true&&commandsSetupOk;}
  const [afterHook,afterMenu,afterCommands,afterGroupCommands,afterAdminCommands,afterPrivateCommands,afterOwnerCommands,...afterChatCommands]=await Promise.all([
   telegramProbe('getWebhookInfo'),telegramProbe('getChatMenuButton'),telegramProbe('getMyCommands'),telegramProbe('getMyCommands',{scope:{type:'all_group_chats'}}),telegramProbe('getMyCommands',{scope:{type:'all_chat_administrators'}}),telegramProbe('getMyCommands',{scope:{type:'all_private_chats'}}),telegramProbe('getMyCommands',{scope:{type:'chat',chat_id:Number(OWNER_ID)}}),...knownGroupIds.map(chat_id=>telegramProbe('getMyCommands',{scope:{type:'chat',chat_id}}))
  ]);
  const webhookOk=afterHook.telegramOk&&afterHook.result?.url===hookUrl;
  const menuOk=afterMenu.telegramOk&&afterMenu.result?.type==='web_app'&&afterMenu.result?.webAppUrl===APP_URL&&afterMenu.result?.text==='Scopa';
  const commandsNow=afterCommands.result?.commands||[];
  const groupCommandsNow=afterGroupCommands.result?.commands||[];
  const adminCommandsNow=afterAdminCommands.result?.commands||[];
  const privateCommandsNow=afterPrivateCommands.result?.commands||[];
  const ownerCommandsNow=afterOwnerCommands.result?.commands||[];
  const chatCommandsNow=afterChatCommands.map(x=>x.result?.commands||[]);
  const commandsOk=afterCommands.telegramOk&&afterGroupCommands.telegramOk&&afterAdminCommands.telegramOk&&afterPrivateCommands.telegramOk&&afterOwnerCommands.telegramOk&&commandsNow.length===0&&sameCommands(groupCommandsNow,groupCommandList)&&sameCommands(adminCommandsNow,groupCommandList)&&privateCommandsNow.length===0&&sameCommands(ownerCommandsNow,privateCommandList)&&afterChatCommands.every(x=>x.telegramOk)&&chatCommandsNow.every(x=>x.length===0);
  const mainAppConfigured=me.result?.hasMainWebApp===true;
  return new Response(JSON.stringify({
   ok:webhookOk&&menuOk&&commandsOk&&registrationOk&&menuSetupOk&&commandsSetupOk&&mainAppConfigured,
   expectedBot:BOT_USERNAME,
   activeSecretName:status.source,
   webhook:afterHook.result??null,
   registrationNeeded:webhookNeedsUpdate,
   registrationOk,
   menuConfigured:menuOk,
   menuSetupNeeded:!menuConfigured,
   menuSetupOk,
   commandsConfigured:commandsOk,
   commandsSetupNeeded:!commandsOk,
   commandsSetupOk,
   commandVerification:{global:commandsNow,group:groupCommandsNow,administrators:adminCommandsNow,allPrivate:privateCommandsNow,owner:ownerCommandsNow,chatOverrides:chatCommandsNow},
   mainAppConfigured,
   mainAppNeedsBotFather:!mainAppConfigured,
   appUrl:APP_URL
  }),{status:200,headers:cors});
 }catch(error){
  return new Response(JSON.stringify({ok:false,expectedBot:BOT_USERNAME,activeSecretName:status.source,error:error instanceof Error?error.message:'Errore verifica Telegram'}),{status:200,headers:cors});
 }
}
if(req.method==='GET'&&new URL(req.url).searchParams.get('action')==='webhookInfo'){
 const status=await ensureBotToken();
 if(!status.ok)return new Response(JSON.stringify({ok:false,webhook:null,error:'Nessun token valido configurato per il bot atteso.',tokenChecks:status.checks}),{status:200,headers:cors});
 const info=await telegramProbe('getWebhookInfo');
 return new Response(JSON.stringify({ok:info.telegramOk===true,webhook:info.result??null,error:info.description??info.error??null,tokenSource:status.source}),{status:200,headers:cors});
}
if(req.method!=='POST')return new Response(JSON.stringify({error:'Metodo non supportato'}),{status:405,headers:cors});const path=new URL(req.url).pathname;if((path.endsWith('/scopa-telegram-staging')||path.endsWith('/scopa-telegram'))&&req.headers.has('x-telegram-bot-api-secret-token'))return await handleTelegramUpdate(req);const body=await req.json();
if(body.action==="scheduledTournamentReminders"){
 const supplied=req.headers.get("x-scopa-cron-secret")||"";
 const {data:cronAuth,error:cronAuthError}=await db.from("scopa_reminder_cron_auth").select("secret").eq("id",1).maybeSingle();
 if(cronAuthError)throw cronAuthError;
 if(!cronAuth?.secret||supplied!==cronAuth.secret)return new Response(JSON.stringify({ok:false,error:"unauthorized"}),{status:401,headers:cors});
 const italyTime=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Rome",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date());
 console.log("Scheduled tournament reminder trigger",JSON.stringify({italyTime}));
 if(!italyTime.startsWith("21:"))return new Response(JSON.stringify({ok:true,skipped:"not_21_hour_italy",localTime:italyTime}),{status:200,headers:cors});
 const {data:tournaments,error:tournamentsError}=await db.from("scopa_tournaments").select("id,name,group_chat_id,current_round").eq("status","active");
 if(tournamentsError)throw tournamentsError;
 const notified:any[]=[];
 for(const tournament of tournaments||[]){
  const {data:players,error:playersError}=await db.from("scopa_tournament_players").select("telegram_id,display_name,paired_opponent_id,eliminated,qualified").eq("tournament_id",tournament.id).order("joined_at",{ascending:true});
  if(playersError)throw playersError;
  const byId=new Map<number,any>((players||[]).map((p:any)=>[Number(p.telegram_id),p]));
  const pairs=new Map<string,{a:number,b:number}>();
  const pairKey=(a:number,b:number)=>[Math.min(a,b),Math.max(a,b)].join(":");
  for(const player of players||[]){
   const a=Number(player.telegram_id),b=Number(player.paired_opponent_id||0),other=byId.get(b);
   if(!b||!other||a>b||player.eliminated||player.qualified||other.eliminated||other.qualified||Number(other.paired_opponent_id)!==a)continue;
   pairs.set(pairKey(a,b),{a,b});
  }
  if(!pairs.size)continue;
  const {data:matches,error:matchesError}=await db.from("scopa_tournament_matches").select("player1_telegram_id,player2_telegram_id,status").eq("tournament_id",tournament.id).eq("round_number",Number(tournament.current_round));
  if(matchesError)throw matchesError;
  const counts=new Map<string,number>([...pairs.keys()].map((key:string)=>[key,0]));
  const activePairKeys=new Set<string>();
  for(const match of matches||[]){
   const key=pairKey(Number(match.player1_telegram_id),Number(match.player2_telegram_id));
   if(match.status==="finished"&&counts.has(key))counts.set(key,(counts.get(key)||0)+1);
   else if((match.status==="waiting"||match.status==="playing")&&pairs.has(key))activePairKeys.add(key);
  }
  const minDone=Math.min(...counts.values());
  const pending:string[]=[];
  for(const [key,pair] of pairs){
   if((counts.get(key)||0)!==minDone||activePairKeys.has(key))continue;
   const first=byId.get(pair.a),second=byId.get(pair.b);
   pending.push(String(first?.display_name||"Giocatore")+" VS "+String(second?.display_name||"Giocatore"));
  }
  if(!pending.length)continue;
  const handNumber=minDone+1;
  const groupId=Number(tournament.group_chat_id);
  await telegram("sendMessage",{chat_id:groupId,text:"⏰ PROMEMORIA TORNEO SCOPA · ORE 21:00\n\nÈ il momento di giocare la mano "+handNumber+".\n\nCoppie ancora in attesa:\n"+pending.join("\n")+"\n\nQuando avete terminato, il torneo aggiornerà automaticamente la classifica e gli abbinamenti."});
  notified.push({tournamentId:tournament.id,groupChatId:groupId,hand:handNumber,pairs:pending.length});
 }
 return new Response(JSON.stringify({ok:true,localTime:italyTime,notified}),{status:200,headers:cors});
}
if(body.update_id!==undefined)return await handleTelegramUpdate(new Request(req.url,{method:'POST',headers:req.headers,body:JSON.stringify(body)}));if(body.action==="diagnostics"){
 const tokenStatus=await ensureBotToken();
 const webhook=tokenStatus.ok?await telegramProbe("getWebhookInfo"):null;
 return new Response(JSON.stringify({ok:tokenStatus.ok,expectedBot:BOT_USERNAME,activeSecretName:tokenStatus.source,tokenChecks:tokenStatus.checks,webhook:webhook?.result??null,telegramError:webhook?.description??webhook?.error??null}),{status:200,headers:cors});
}
if(body.action==="registerWebhook"){if(!WEBHOOK_SECRET||body.setupSecret!==WEBHOOK_SECRET)throw new Error("Chiave di configurazione non valida.");const hookUrl="https://sommziqnmxgkwyjatxcn.supabase.co/functions/v1/scopa-telegram-staging";const result=await telegram("setWebhook",{url:hookUrl,secret_token:WEBHOOK_SECRET,allowed_updates:["message","callback_query","my_chat_member"]});return new Response(JSON.stringify({ok:true,description:"Webhook di prova registrato."}),{status:200,headers:cors});}const result=await handleAction(body);return new Response(JSON.stringify(result),{status:200,headers:cors});}catch(e){const detail = e instanceof Error ? e.message : (typeof e === 'object' && e !== null ? String((e as any).message ?? (e as any).details ?? (e as any).hint ?? JSON.stringify(e)) : String(e)); const message = detail && detail !== '{}' ? detail.slice(0,500) : 'Errore non identificato'; console.error('Webhook/action error:', message); return new Response(JSON.stringify({error:message}),{status:400,headers:cors});}});
