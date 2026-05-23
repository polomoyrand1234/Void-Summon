
// VOID SUMMON V3 - Full clean front-only game.
// Supabase: replace these two values with your public project URL and anon/public key only.
const SUPABASE_URL = "";
const SUPABASE_ANON_KEY = "";

const ITEMS = window.VOID_ITEMS;
const RARITIES = window.VOID_RARITIES;
const CATEGORIES = window.VOID_CATEGORIES;
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const today = () => new Date().toISOString().slice(0,10);
const rarity = name => RARITIES.find(r=>r.name===name);
const tier = name => rarity(name)?.tier || 1;
const categoryItems = cat => ITEMS.filter(i=>i.category===cat);

const XP_PER_LEVEL = lvl => Math.floor(160 + Math.pow(lvl,1.75)*120);
const TITLES = [
  [1,'Éveilleur débutant'],[5,'Invocateur'],[10,'Chasseur de failles'],[25,'Maître du portail'],[50,'Seigneur du Néant'],[100,'Empereur Oméga']
];
const DEFAULT_STATE = () => ({
  version:'v3', inventory:{}, stats:{summons:0,tenPulls:0,rarePlus:0,epicPlus:0,legendaryPlus:0,mythicPlus:0,bestTier:0,duplicates:0,totalFragmentsEarned:0,totalFragmentsSpent:0,questsDone:0,achievementsClaimed:0},
  level:1,xp:0,fragments:0,title:'Éveilleur débutant',unlockedTitles:['Éveilleur débutant','Invocateur du Portail'],
  pity:{epic:0,legendary:0,mythic:0}, history:[], activeCategory:'characters', selectedProfile:{title:'Éveilleur débutant',favorite:null,frame:null,aura:null},
  daily:{date:null,claimedLogin:false,streak:0,bestStreak:0,lastLogin:null,quests:[]}, achievements:{}, shop:{}, sound:true
});
let state = loadLocal();
let supabaseClient = null;
let currentUser = null;

function loadLocal(){try{return {...DEFAULT_STATE(), ...(JSON.parse(localStorage.getItem('void_summon_v3'))||{})}}catch{return DEFAULT_STATE()}}
function saveLocal(){localStorage.setItem('void_summon_v3',JSON.stringify(state)); syncSupabase();}
function toast(msg){const t=document.createElement('div');t.className='toast';t.textContent=msg;$('#toastZone').append(t);setTimeout(()=>t.remove(),3500)}
function fmt(n){return Number(n||0).toLocaleString('fr-FR')}
function owned(id){return state.inventory[id]||0}
function isOwned(id){return owned(id)>0}
function getBestRarity(){const r=RARITIES.find(r=>r.tier===state.stats.bestTier);return r?r.name:'Aucun'}

// WebAudio sound effects: no external file needed.
let audioCtx;
function sfx(type='click', power=1){
  if(!state.sound) return;
  try{
    audioCtx = audioCtx || new (window.AudioContext||window.webkitAudioContext)();
    const now=audioCtx.currentTime;
    const o=audioCtx.createOscillator(); const g=audioCtx.createGain(); const f=audioCtx.createBiquadFilter();
    o.connect(f); f.connect(g); g.connect(audioCtx.destination); f.type='lowpass'; f.frequency.value=1200+power*420;
    const base = type==='reveal'? 180+power*70 : type==='rare'? 260+power*95 : type==='boom'? 70 : 420;
    o.type = type==='boom'?'sawtooth':'triangle';
    o.frequency.setValueAtTime(base,now); o.frequency.exponentialRampToValueAtTime(base*(type==='boom'?0.45:1.7),now+.18+.03*power);
    g.gain.setValueAtTime(0.0001,now); g.gain.exponentialRampToValueAtTime(0.08+power*.015,now+.025); g.gain.exponentialRampToValueAtTime(0.0001,now+.22+power*.04);
    o.start(now); o.stop(now+.35+power*.04);
  }catch(e){}
}

function rollRarity(category){
  const p = state.pity;
  let forced = null;
  if(p.mythic >= 180) forced = 'Mythique';
  else if(p.legendary >= 90) forced = 'Légendaire';
  else if(p.epic >= 30) forced = 'Épique';
  let chosen = forced;
  if(!chosen){
    let r=Math.random()*100, acc=0;
    for(const row of RARITIES){ acc+=row.rate; if(r<=acc){chosen=row.name; break;} }
    chosen = chosen || 'Commun';
  }
  const t=tier(chosen);
  p.epic = t>=5 ? 0 : p.epic+1;
  p.legendary = t>=6 ? 0 : p.legendary+1;
  p.mythic = t>=7 ? 0 : p.mythic+1;
  return chosen;
}
function randomItem(category, rarityName){
  const pool=ITEMS.filter(i=>i.category===category && i.rarity===rarityName);
  return pool[Math.floor(Math.random()*pool.length)];
}
function fragmentValue(item){return [0,1,2,5,10,20,40,80,140,220,360][item.tier]||1}
function gainXp(amount){
  state.xp += amount;
  let leveled=false;
  while(state.xp >= XP_PER_LEVEL(state.level)){ state.xp-=XP_PER_LEVEL(state.level); state.level++; leveled=true; }
  for(const [lvl,title] of TITLES){ if(state.level>=lvl && !state.unlockedTitles.includes(title)) state.unlockedTitles.push(title); }
  if(leveled) toast(`Niveau ${state.level} atteint !`);
}
function addItem(item){
  const wasOwned=isOwned(item.id); state.inventory[item.id]=(state.inventory[item.id]||0)+1;
  if(wasOwned){const f=fragmentValue(item); state.fragments+=f; state.stats.duplicates++; state.stats.totalFragmentsEarned+=f; toast(`Doublon : +${f} fragments`)}
  if(item.tier>=3) state.stats.rarePlus++; if(item.tier>=5) state.stats.epicPlus++; if(item.tier>=6) state.stats.legendaryPlus++; if(item.tier>=7) state.stats.mythicPlus++;
  state.stats.bestTier=Math.max(state.stats.bestTier||0,item.tier);
  state.history.unshift({id:item.id,date:new Date().toISOString()}); state.history=state.history.slice(0,30);
  gainXp(10 + item.tier*item.tier*2);
}
function summon(count){
  ensureDaily(); sfx('click',2);
  const items=[];
  for(let i=0;i<count;i++){const r=rollRarity(state.activeCategory); const it=randomItem(state.activeCategory,r); items.push(it); addItem(it);}
  state.stats.summons+=count; if(count===10) state.stats.tenPulls++;
  updateQuestProgress('summons',count); if(count===10) updateQuestProgress('ten',1);
  if(items.some(i=>i.tier>=3)) updateQuestProgress('rarePlus',1);
  checkAchievements(); saveLocal(); render(); playSummon(items);
}
function playSummon(items){
  const dialog=$('#summonDialog'), stage=$('#summonStage'), box=$('#summonCards'), cut=$('#cutIn');
  box.innerHTML=''; cut.classList.add('hidden'); $('#closeSummon').classList.add('hidden'); $('#revealAllBtn').classList.remove('hidden');
  stage.className='summon-stage';
  const highest=items.reduce((a,b)=>b.tier>a.tier?b:a,items[0]);
  if(highest.tier>=5) stage.classList.add('high-rarity');
  items.forEach((item,idx)=>{
    const r=rarity(item.rarity);
    const card=document.createElement('button'); card.className='summon-result-card '+(items.length===1?'single':''); card.style.setProperty('--delay',(idx*.08)+'s'); card.style.setProperty('--rcolor',r.color); card.style.setProperty('--rglow',r.glow);
    card.innerHTML=`<div class="card-inner"><div class="card-face card-back"></div><div class="card-face card-front"><img src="${item.image}" alt="${item.name}"><div class="front-label">${item.name}<br><span style="color:${r.color}">${item.rarity}</span></div></div></div>`;
    card.addEventListener('click',()=>revealSummonCard(card,item)); box.append(card);
  });
  dialog.showModal();
  setTimeout(()=>{if(items.length===1) revealSummonCard($('.summon-result-card'),items[0]);},900);
}
function revealSummonCard(card,item){
  if(!card || card.classList.contains('revealed')) return;
  card.classList.add('revealed'); const t=item.tier;
  sfx(t>=6?'boom':t>=4?'rare':'reveal',t);
  if(t>=5){const cut=$('#cutIn'); cut.querySelector('strong').textContent=item.rarity+' — '+item.name; cut.querySelector('p').textContent='“'+item.quote+'”'; cut.classList.remove('hidden'); setTimeout(()=>cut.classList.add('hidden'),2700);}
  if($$('.summon-result-card').every(c=>c.classList.contains('revealed'))){$('#closeSummon').classList.remove('hidden'); $('#revealAllBtn').classList.add('hidden');}
}
function closeSummon(){ if($('#summonDialog').open) $('#summonDialog').close(); render(); }

function ensureDaily(){
  const d=today();
  if(state.daily.date!==d){ state.daily.date=d; state.daily.claimedLogin=false; state.daily.quests=[
    {id:'q-summon',label:'Faire 20 invocations',type:'summons',goal:20,progress:0,reward:{xp:80,fragments:20},claimed:false},
    {id:'q-rare',label:'Obtenir 1 Rare ou mieux',type:'rarePlus',goal:1,progress:0,reward:{xp:80,fragments:25},claimed:false},
    {id:'q-ten',label:'Faire une x10',type:'ten',goal:1,progress:0,reward:{xp:100,fragments:30},claimed:false},
    {id:'q-collection',label:'Ouvrir la collection',type:'collection',goal:1,progress:0,reward:{xp:60,fragments:15},claimed:false}
  ];}
}
function updateQuestProgress(type,amount){ensureDaily(); state.daily.quests.forEach(q=>{if(q.type===type) q.progress=Math.min(q.goal,(q.progress||0)+amount)});}
function claimQuest(id){const q=state.daily.quests.find(q=>q.id===id); if(!q||q.claimed||q.progress<q.goal)return; q.claimed=true; state.stats.questsDone++; gainXp(q.reward.xp); state.fragments+=q.reward.fragments; toast(`Quête validée : +${q.reward.xp} XP, +${q.reward.fragments} fragments`); checkAchievements(); saveLocal(); render();}
function claimDaily(){ensureDaily(); if(state.daily.claimedLogin){toast('Récompense déjà récupérée.'); return;} const last=state.daily.lastLogin; const yesterday=new Date(Date.now()-86400000).toISOString().slice(0,10); state.daily.streak = last===yesterday ? (state.daily.streak||0)+1 : 1; state.daily.bestStreak=Math.max(state.daily.bestStreak||0,state.daily.streak); state.daily.lastLogin=today(); state.daily.claimedLogin=true; const day=((state.daily.streak-1)%7)+1; const rewards=[{xp:30,fragments:10},{xp:35,fragments:18},{xp:45,fragments:22},{xp:55,fragments:28},{xp:65,fragments:36},{xp:70,fragments:45},{xp:100,fragments:70}]; const rw=rewards[day-1]; gainXp(rw.xp); state.fragments+=rw.fragments; if(state.daily.streak>=7 && !state.unlockedTitles.includes('Fidèle du Portail')) state.unlockedTitles.push('Fidèle du Portail'); toast(`Jour ${day} : +${rw.xp} XP, +${rw.fragments} fragments`); saveLocal(); render();}

function achievements(){
  const countOwned = Object.keys(state.inventory).filter(id=>state.inventory[id]>0).length;
  const ownedByCat = cat => ITEMS.filter(i=>i.category===cat && isOwned(i.id)).length;
  const has = name => ITEMS.some(i=>i.name.includes(name) && isOwned(i.id));
  const list=[];
  const add=(id,cat,icon,title,desc,done,reward=50,secret=false)=>list.push({id,cat,icon,title,desc,done,reward,secret});
  [1,100,500,1000,2500,5000,10000].forEach(n=>add('summons'+n,'Invocations','🔥',`${n} invocations`, `Faire ${n} invocations au total.`, state.stats.summons>=n, Math.min(900,50+n/10)));
  [25,75,150,300,450,600].forEach(n=>add('collection'+n,'Collection','📚',`${n} objets découverts`, `Débloquer ${n} objets uniques.`, countOwned>=n, 80+n));
  [3,4,5,6,7,8,9,10].forEach(t=>{const r=RARITIES.find(r=>r.tier===t); add('first'+r.name,'Raretés','✦',`Premier ${r.name}`,`Obtenir un objet ${r.name}.`, Object.keys(state.inventory).some(id=>isOwned(id)&&ITEMS.find(i=>i.id===id)?.tier===t), 80+t*35);});
  ['characters','artifacts','cosmetics'].forEach(cat=>[20,60,120,200].forEach(n=>add(cat+n,'Collection','🧩',`${CATEGORIES[cat].label} ${n}`,`Débloquer ${n} ${CATEGORIES[cat].label.toLowerCase()}.`,ownedByCat(cat)>=n,100+n)));
  [1,10,50,100,250,500].forEach(n=>add('dupes'+n,'Fragments','💎',`${n} doublons`, `Obtenir ${n} doublons.`, state.stats.duplicates>=n,80+n));
  [100,500,1500,5000,10000].forEach(n=>add('frag'+n,'Fragments','💠',`${n} fragments gagnés`, `Gagner ${n} fragments au total.`, state.stats.totalFragmentsEarned>=n,80+n/3));
  [1,7,14,30,60,100].forEach(n=>add('streak'+n,'Connexion','📅',`${n} jours de série`, `Atteindre ${n} jours de connexion consécutifs.`, state.daily.bestStreak>=n,90+n*10));
  [1,10,50,150,300].forEach(n=>add('quests'+n,'Quêtes','✅',`${n} quêtes terminées`, `Terminer ${n} quêtes quotidiennes.`, state.stats.questsDone>=n,80+n*3));
  // Special easter eggs linked to original-inspired designs, but public names stay original.
  add('violet','Spéciaux','🟣','Violet','Obtenir un personnage d’infini de rareté Mythique ou plus.', ITEMS.some(i=>i.category==='characters'&&i.inspiredBy.includes('Gojo')&&i.tier>=7&&isOwned(i.id)),500,true);
  add('monarch','Spéciaux','👑','Monarque des ombres','Obtenir un personnage d’ombre de rareté Légendaire ou plus.', ITEMS.some(i=>i.category==='characters'&&i.inspiredBy.includes('Jin')&&i.tier>=6&&isOwned(i.id)),450,true);
  add('drums','Spéciaux','🥁','Tambours de l’aube','Obtenir une carte d’aube blanche de rareté Mythique ou plus.', ITEMS.some(i=>i.inspiredBy.includes('Luffy')&&i.tier>=7&&isOwned(i.id)),450,true);
  add('hat','Spéciaux','🎩','Braises fraternelles','Obtenir un chapeau ou une carte de braise de rareté Mythique ou plus.', ITEMS.some(i=>i.inspiredBy.includes('Ace')&&i.tier>=7&&isOwned(i.id)),450,true);
  add('triple','Spéciaux','⚔️','Trois horizons','Obtenir une carte du sabreur triple de rareté Légendaire ou plus.', ITEMS.some(i=>i.inspiredBy.includes('Zoro')&&i.tier>=6&&isOwned(i.id)),420,true);
  add('fox','Spéciaux','🦊','Renard solaire','Obtenir une carte renard de rareté Céleste ou plus.', ITEMS.some(i=>i.inspiredBy.includes('Naruto')&&i.tier>=9&&isOwned(i.id)),700,true);
  add('garden','Spéciaux','🐺','Jardin terminal','Obtenir une carte chimère de rareté Oméga.', ITEMS.some(i=>i.inspiredBy.includes('Megumi')&&i.tier>=10&&isOwned(i.id)),900,true);
  add('doubleEpic','Spéciaux','🌌','La faille a tremblé','Obtenir au moins 2 Épiques ou mieux dans une x10. Débloqué automatiquement via historique récent.', recentHighCount(5)>=2,350,true);
  return list;
}
function recentHighCount(t){return state.history.slice(0,10).filter(h=>ITEMS.find(i=>i.id===h.id)?.tier>=t).length}
function checkAchievements(){achievements().forEach(a=>{if(a.done && !state.achievements[a.id]?.seen){state.achievements[a.id]={seen:true,claimed:false}; toast('Succès débloqué : '+a.title)}})}
function claimAchievement(id){const a=achievements().find(a=>a.id===id); if(!a||!a.done)return; state.achievements[id]=state.achievements[id]||{seen:true,claimed:false}; if(state.achievements[id].claimed)return; state.achievements[id].claimed=true; state.stats.achievementsClaimed++; gainXp(Number(a.reward)||50); state.fragments+=Math.floor((Number(a.reward)||50)/4); toast(`Succès récupéré : +${Math.floor(a.reward)} XP`); saveLocal(); render();}

const SHOP=[
  {id:'title-neant',name:'Titre : Voyageur du Néant',price:120,type:'title',value:'Voyageur du Néant'},
  {id:'title-flamme',name:'Titre : Brasier Doré',price:250,type:'title',value:'Brasier Doré'},
  {id:'frame-gold',name:'Cadre doré',price:300,type:'frame',value:'gold'},
  {id:'aura-violet',name:'Aura violette',price:400,type:'aura',value:'violet'},
  {id:'title-legend',name:'Titre : Briseur de destin',price:850,type:'title',value:'Briseur de destin'},
  {id:'pity-boost',name:'Boost pity +10',price:1200,type:'boost',value:'pity10'},
  {id:'frame-omega',name:'Cadre Oméga cosmétique',price:2500,type:'frame',value:'omega'},
];
function buyShop(id){const it=SHOP.find(x=>x.id===id); if(!it||state.shop[id])return; if(state.fragments<it.price){toast('Fragments insuffisants.'); return;} state.fragments-=it.price; state.stats.totalFragmentsSpent+=it.price; state.shop[id]=true; if(it.type==='title'&&!state.unlockedTitles.includes(it.value))state.unlockedTitles.push(it.value); if(it.type==='boost'){state.pity.epic+=10; state.pity.legendary+=10; state.pity.mythic+=10;} toast('Achat validé : '+it.name); saveLocal(); render();}

function render(){ensureDaily(); renderQuick(); renderPity(); renderQuests(); renderCollectionHub(); renderProfile(); renderAchievements(); renderShop(); renderRates();}
function renderQuick(){
  $('#activeBannerTitle').textContent=CATEGORIES[state.activeCategory].label; $('#quickLevel').textContent=state.level; $('#quickTitle').textContent=state.selectedProfile.title||state.title; $('#quickFragments').textContent=fmt(state.fragments); $('#quickBest').textContent=getBestRarity(); $('#quickName').textContent=state.selectedProfile.title||'Invocateur';
  $('#quickXp').style.width=Math.min(100,state.xp/XP_PER_LEVEL(state.level)*100)+'%';
  const fav=ITEMS.find(i=>i.id===state.selectedProfile.favorite) || ITEMS.find(i=>isOwned(i.id)&&i.category==='characters');
  $('#quickAvatar').style.backgroundImage=fav?`url(${fav.image})`:'';
}
function renderPity(){
  $('#pityRows').innerHTML=[['Épique',state.pity.epic,30],['Légendaire',state.pity.legendary,90],['Mythique',state.pity.mythic,180]].map(([n,v,g])=>`<div class="pity-row"><small><span>${n}</span><b>${v}/${g}</b></small><div class="mini-track"><div style="width:${Math.min(100,v/g*100)}%"></div></div></div>`).join('');
}
function renderQuests(){
  $('#questsGrid').innerHTML=state.daily.quests.map(q=>`<article class="quest ${q.claimed?'done':''}"><strong>${q.label}</strong><p>${q.progress}/${q.goal}</p><div class="mini-track"><div style="width:${Math.min(100,q.progress/q.goal*100)}%"></div></div><p>+${q.reward.xp} XP · +${q.reward.fragments} fragments</p><button class="secondary-btn small" ${q.claimed||q.progress<q.goal?'disabled':''} onclick="claimQuest('${q.id}')">${q.claimed?'Récupéré':'Récupérer'}</button></article>`).join('');
  const day=((state.daily.streak||0)%7)+1;
  $('#dailyRewards').innerHTML=[1,2,3,4,5,6,7].map(d=>`<div class="daily ${state.daily.claimedLogin&&d===day?'claimed':''}"><b>Jour ${d}</b><small>${d===7?'Titre + fragments':'+XP + fragments'}</small></div>`).join('');
}
function renderCollectionHub(){
  const summary=Object.keys(state.inventory).filter(id=>state.inventory[id]>0).length;
  $('#collectionSummary').textContent=`${summary} / ${ITEMS.length} cartes uniques débloquées`;
  $('#collectionHub').innerHTML=Object.keys(CATEGORIES).map(cat=>{const total=categoryItems(cat).length, own=categoryItems(cat).filter(i=>isOwned(i.id)).length;return `<article class="hub-card" data-cat="${cat}"><span class="eyebrow">${CATEGORIES[cat].label}</span><h2>${CATEGORIES[cat].icon} ${own}/${total}</h2><div class="mega-progress"><div style="width:${own/total*100}%"></div></div><p>Ouvrir la collection</p></article>`}).join('');
}
function openCollection(cat){ updateQuestProgress('collection',1); state.currentCollection=cat; $('#collectionHub').classList.add('hidden'); $('#collectionDetail').classList.remove('hidden'); $('#collectionTitle').textContent=CATEGORIES[cat].label; renderCollectionDetail(); saveLocal();}
function renderCollectionDetail(){const cat=state.currentCollection||'characters', rar=$('#collectionRarity').value, st=$('#collectionState').value, q=$('#collectionSearch').value.toLowerCase().trim();let arr=categoryItems(cat); if(rar!=='all')arr=arr.filter(i=>i.rarity===rar); if(st==='owned')arr=arr.filter(i=>isOwned(i.id)); if(st==='missing')arr=arr.filter(i=>!isOwned(i.id)); if(q)arr=arr.filter(i=>(i.name+' '+i.rarity+' '+i.element).toLowerCase().includes(q)); const own=categoryItems(cat).filter(i=>isOwned(i.id)).length,total=categoryItems(cat).length; $('#collectionProgressTxt').textContent=`${own} / ${total} débloqués`; $('#collectionProgressBar').style.width=own/total*100+'%'; $('#collectionGrid').innerHTML=arr.sort((a,b)=>b.tier-a.tier||a.number-b.number).map(cardHtml).join('');}
function cardHtml(i){const r=rarity(i.rarity);return `<article class="item-card ${isOwned(i.id)?'':'locked'}" style="--rcolor:${r.color}" data-id="${i.id}"><img src="${i.image}" alt="${isOwned(i.id)?i.name:'Carte inconnue'}"><div class="card-body"><strong>${isOwned(i.id)?i.name:'Carte inconnue'}</strong><br><span class="pill" style="color:${r.color}">${i.rarity}</span><span class="pill">${i.element}</span>${isOwned(i.id)?`<span class="pill">x${owned(i.id)}</span>`:''}</div></article>`}
function openItem(id){const i=ITEMS.find(x=>x.id===id), r=rarity(i.rarity), lock=!isOwned(i.id); $('#itemModal').innerHTML=`<div class="modal-head"><h2>${lock?'Carte inconnue':i.name}</h2><button class="ghost-btn icon" onclick="$('#itemDialog').close()">×</button></div><div class="item-modal-grid"><img src="${i.image}" style="${lock?'filter:grayscale(1) brightness(.35)':''}"><div><span class="pill" style="color:${r.color}">${i.rarity}</span><span class="pill">${i.element}</span><span class="pill">Puissance ${i.power}</span><p>${lock?'Continue les invocations pour révéler cette carte.':i.description}</p><blockquote>${lock?'Citation verrouillée.':'“'+i.quote+'”'}</blockquote><p>${lock?'':`Copies : ${owned(i.id)}`}</p></div></div>`; $('#itemDialog').showModal();}
function renderProfile(){const fav=ITEMS.find(i=>i.id===state.selectedProfile.favorite)||ITEMS.find(i=>isOwned(i.id)&&i.category==='characters'); $('#profileCard').innerHTML=`<div class="profile-visual" style="background-image:${fav?`url(${fav.image})`:'none'}"><div class="profile-info"><h2>${state.selectedProfile.title||state.title}</h2><p>Niveau ${state.level} · ${fmt(state.xp)}/${fmt(XP_PER_LEVEL(state.level))} XP</p><p>Fragments : ${fmt(state.fragments)} · Série : ${state.daily.streak||0} jours</p><p>Meilleur drop : ${getBestRarity()}</p></div></div>`; const chars=ITEMS.filter(i=>i.category==='characters'&&isOwned(i.id)); $('#customizer').innerHTML=`<label>Titre<select class="customizer-select" id="titleSelect">${state.unlockedTitles.map(t=>`<option ${state.selectedProfile.title===t?'selected':''}>${t}</option>`).join('')}</select></label><label>Personnage favori<select class="customizer-select" id="favSelect"><option value="">Aucun</option>${chars.map(i=>`<option value="${i.id}" ${state.selectedProfile.favorite===i.id?'selected':''}>${i.name}</option>`).join('')}</select></label><p class="help">Tu ne peux équiper que ce que tu as vraiment débloqué.</p>`; renderHistory('#historyList');}
function renderHistory(sel){const box=$(sel); if(!box)return; box.innerHTML=state.history.length?state.history.map(h=>{const i=ITEMS.find(x=>x.id===h.id), r=rarity(i.rarity);return `<div class="history-row"><img src="${i.image}"><div><b>${i.name}</b><br><small style="color:${r.color}">${i.rarity}</small></div><small>${new Date(h.date).toLocaleDateString('fr-FR')}</small></div>`}).join(''):'<p class="help">Aucune invocation pour l’instant.</p>';}
function renderAchievements(){const cats=['Tous',...new Set(achievements().map(a=>a.cat))]; $('#achievementFilters').innerHTML=cats.map(c=>`<button data-ach-cat="${c}" class="${(state.achFilter||'Tous')===c?'active':''}">${c}</button>`).join(''); let list=achievements().filter(a=>(state.achFilter||'Tous')==='Tous'||a.cat===state.achFilter); $('#achievementsList').innerHTML=list.map(a=>{const unlocked=a.done || state.achievements[a.id]?.seen; const claimed=state.achievements[a.id]?.claimed; const hidden=a.secret&&!unlocked; return `<article class="achievement ${a.done?'done':''}"><div class="badge">${hidden?'?':a.icon}</div><div><strong>${hidden?'Succès secret':a.title}</strong><p>${hidden?'Continue à jouer pour le révéler.':a.desc}</p></div><button class="secondary-btn small" ${!a.done||claimed?'disabled':''} onclick="claimAchievement('${a.id}')">${claimed?'Pris':a.done?'Récupérer':'Verrouillé'}</button></article>`}).join('');}
function renderShop(){ $('#shopGrid').innerHTML=SHOP.map(s=>`<article class="shop-item"><strong>${s.name}</strong><p>${fmt(s.price)} fragments</p><button class="primary-btn small" ${state.shop[s.id]?'disabled':''} onclick="buyShop('${s.id}')">${state.shop[s.id]?'Acheté':'Acheter'}</button></article>`).join('');}
function renderRates(){ $('#ratesList').innerHTML=RARITIES.map(r=>`<div class="statline"><span style="color:${r.color}">${r.name}</span><strong>${r.rate}%</strong></div>`).join('');}

async function initSupabase(){ if(!SUPABASE_URL||!SUPABASE_ANON_KEY||!window.supabase)return; supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY); const {data}=await supabaseClient.auth.getUser(); currentUser=data?.user||null; if(currentUser) await loadSupabase(); $('#accountStatus').textContent=currentUser?'Connecté : '+currentUser.email:'Non connecté';}
async function loadSupabase(){ if(!supabaseClient||!currentUser)return; const {data}=await supabaseClient.from('void_summon_profiles').select('save_data').eq('user_id',currentUser.id).maybeSingle(); if(data?.save_data){state={...DEFAULT_STATE(),...state,...data.save_data}; saveLocal(); toast('Sauvegarde Supabase chargée.');}}
async function syncSupabase(){ if(!supabaseClient||!currentUser)return; await supabaseClient.from('void_summon_profiles').upsert({user_id:currentUser.id,save_data:state,inventory:state.inventory,stats:state.stats,player_level:state.level,player_xp:state.xp,player_title:state.selectedProfile.title||state.title,fragments:state.fragments,pity:state.pity,unlocked_titles:state.unlockedTitles,app_version:'v3'});}
async function signUp(){ if(!supabaseClient){toast('Ajoute tes clés Supabase dans app.js.');return;} const email=$('#emailInput').value,password=$('#passwordInput').value; const {error}=await supabaseClient.auth.signUp({email,password}); if(error)toast(error.message); else toast('Compte créé. Vérifie éventuellement ton email.');}
async function signIn(){ if(!supabaseClient){toast('Ajoute tes clés Supabase dans app.js.');return;} const {data,error}=await supabaseClient.auth.signInWithPassword({email:$('#emailInput').value,password:$('#passwordInput').value}); if(error)toast(error.message); else{currentUser=data.user; await syncSupabase(); toast('Connecté.'); render();}}
async function signOut(){ if(supabaseClient) await supabaseClient.auth.signOut(); currentUser=null; toast('Déconnecté.');}

function bind(){
  $('#summonOne').onclick=$('#summonOne2').onclick=()=>summon(1); $('#summonTen').onclick=$('#summonTen2').onclick=()=>summon(10); $('#closeSummon').onclick=closeSummon; $('#revealAllBtn').onclick=()=>$$('.summon-result-card').forEach((c,idx)=>setTimeout(()=>c.click(),idx*120));
  $$('.banner-choice').forEach(b=>b.onclick=()=>{state.activeCategory=b.dataset.category; $$('.banner-choice').forEach(x=>x.classList.remove('active')); b.classList.add('active'); renderQuick(); saveLocal();});
  $$('.nav-item').forEach(n=>n.onclick=()=>{$$('.nav-item').forEach(x=>x.classList.remove('active')); n.classList.add('active'); $$('.page').forEach(p=>p.classList.remove('active')); $('#page-'+n.dataset.page).classList.add('active'); render();});
  $('#claimDailyBtn').onclick=claimDaily; $('#soundToggle').onclick=()=>{state.sound=!state.sound; $('#soundToggle').textContent='Son : '+(state.sound?'ON':'OFF'); saveLocal();};
  $('#collectionHub').onclick=e=>{const h=e.target.closest('.hub-card'); if(h)openCollection(h.dataset.cat);}; $('#collectionBack').onclick=()=>{$('#collectionHub').classList.remove('hidden');$('#collectionDetail').classList.add('hidden')};
  ['collectionRarity','collectionState','collectionSearch'].forEach(id=>$('#'+id).oninput=renderCollectionDetail); $('#collectionGrid').onclick=e=>{const c=e.target.closest('.item-card'); if(c)openItem(c.dataset.id);};
  $('#collectionRarity').innerHTML='<option value="all">Toutes les raretés</option>'+RARITIES.map(r=>`<option>${r.name}</option>`).join('');
  $('#ratesBtn').onclick=()=>$('#ratesDialog').showModal(); $('#closeRates').onclick=()=>$('#ratesDialog').close(); $('#quickHistoryBtn').onclick=()=>{renderHistory('#historyDialogList');$('#historyDialog').showModal();}; $('#closeHistory').onclick=()=>$('#historyDialog').close();
  $('#customizer').oninput=e=>{if(e.target.id==='titleSelect')state.selectedProfile.title=e.target.value; if(e.target.id==='favSelect')state.selectedProfile.favorite=e.target.value; saveLocal(); renderProfile(); renderQuick();};
  $('#achievementFilters').onclick=e=>{if(e.target.dataset.achCat){state.achFilter=e.target.dataset.achCat;renderAchievements();}};
  $('#signUpBtn').onclick=signUp; $('#signInBtn').onclick=signIn; $('#signOutBtn').onclick=signOut; $('#resetBtn').onclick=()=>{if(confirm('Réinitialiser la sauvegarde locale ?')){state=DEFAULT_STATE(); saveLocal(); render();}};
  $$('#summonDialog,#itemDialog,#ratesDialog,#historyDialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d)d.close();}));
}

bind(); ensureDaily(); checkAchievements(); render(); initSupabase();
if('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(()=>{});
