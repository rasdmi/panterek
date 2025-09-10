(() => {
  const $ = s => document.querySelector(s);

  const C = window.GAME_CONTENT;
  const canvas = $("#game");
  const ctx = canvas.getContext("2d");

  const state = {
    startedAt: Date.now(),
    money: C.startMoney,
    rescued: 0,
    lost: 0,
    entities: [],
    obstacles: C.obstacles.map(o=>({...o})),
    input: {mx:0,my:0,click:false,aimAssist:12},
    player: {x: canvas.width/2, y: canvas.height-120, netCooldown:0, leftHand:null, rightHand:null},
    mobile: matchMedia("(max-width: 900px)").matches,
    basket: [],
    shopOpen:false,
    over:false
  };

  const moneyEl = $("#money");
  const shop = $("#shop");
  const itemsEl = $("#shopItems");
  const basketEl = $("#basketList");
  const statusEl = $("#status");
  const progressEl = $("#progress");
  const timerEl = $("#timer");

  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const rand  = (a,b)=>a+Math.random()*(b-a);
  const dist2 = (a,b)=>{const dx=a.x-b.x, dy=a.y-b.y; return dx*dx+dy*dy;};
  const now   = ()=>performance.now();

  // ---------- СПАВН ----------
  function spawn(){
    for(let i=0;i<5;i++) state.entities.push(makePerson(rand(120,1100), rand(540,640)));
    for(let i=0;i<8;i++) state.entities.push(makeAnimal(rand(160,1080), rand(320,560)));
    state.entities.push(makeVaran(rand(560,760), 360));
  }
  function makePerson(x,y){ return {type:"person", x,y, r:20, speed:.55, dir:rand(0,6.28), alive:true, emoji:"🧍", color:"#cfe9ff"}; }
  function makeAnimal(x,y){
    const emojis=["🦎","🐍","🐢","🦎","🦕"];
    const colors=["#6ee7b7","#facc15","#93c5fd","#fb7185","#86efac"];
    const i=Math.floor(rand(0,emojis.length));
    return {type:"animal", x,y, r:18, speed:.85, dir:rand(0,6.28), alive:true, emoji:emojis[i], color:colors[i]};
  }
  function makeVaran(x,y){ return {type:"varan", x,y, r:22, speed:state.mobile?1.1:1.35, dir:rand(0,6.28), alive:true, target:null, emoji:"🦎", color:"#ff965a", stuckT:0, warmup:3}; }

  // ---------- МАГАЗИН ----------
  function renderShop(){
    itemsEl.innerHTML="";
    C.animals.forEach(a=>{
      const row=document.createElement("div");
      row.className="item";
      row.innerHTML=`
        <div class="badge" style="width:36px;height:36px;border-radius:10px;background:${a.color};display:grid;place-items:center">${a.emoji}</div>
        <div class="meta"><strong>${a.title}</strong><br><small>Возьмите в руку героя</small></div>
        <button class="buy" data-id="${a.id}">Купить — ₽ ${a.price.toLocaleString("ru-RU")}</button>`;
      const btn=row.querySelector(".buy");
      btn.disabled = state.money < a.price;
      btn.onclick=()=>{
        if(state.money<a.price) return;
        state.money-=a.price;
        giveToHand({id:a.id,title:a.title,emoji:a.emoji,color:a.color});
        updateHUD(); renderShop();
        flash(statusEl,`🛒 Куплено: ${a.title}`);
      };
      itemsEl.appendChild(row);
    });
  }
  function giveToHand(item){
    if(!state.player.leftHand) state.player.leftHand=item;
    else if(!state.player.rightHand) state.player.rightHand=item;
    else { state.basket.push(`${item.emoji} ${item.title} (в коробке)`); redrawBasket(); }
  }
  $("#closeShop").onclick = ()=>toggleShop(false);
  function toggleShop(force){ state.shopOpen=(typeof force==="boolean")?force:!state.shopOpen; shop.style.display=state.shopOpen?"block":"none"; if(state.shopOpen) renderShop(); }

  // ---------- УПРАВЛЕНИЕ ----------
  const keys=new Set();
  window.addEventListener("keydown",e=>{ keys.add(e.key.toLowerCase()); if(e.key==="Escape") toggleShop(false); });
  window.addEventListener("keyup",e=>keys.delete(e.key.toLowerCase()));
  canvas.addEventListener("mousemove",e=>{
    const r=canvas.getBoundingClientRect();
    state.input.mx=(e.clientX-r.left)*canvas.width/r.width;
    state.input.my=(e.clientY-r.top)*canvas.height/r.height;
  });
  canvas.addEventListener("mousedown",()=>state.input.click=true);
  window.addEventListener("mouseup",()=>state.input.click=false);

  // Мобильный стик
  const mobileUI=$("#mobileUI"), stick=$("#stick"), knob=$("#stickKnob");
  const netBtn=$("#netBtn"), shopBtn=$("#shopBtn");
  if(state.mobile){
    mobileUI.removeAttribute("aria-hidden"); mobileUI.style.display="flex";
    let stickState=null;
    const set=(x,y)=>{
      const r=stick.getBoundingClientRect(), cx=r.left+r.width/2, cy=r.top+r.height/2;
      const dx=x-cx, dy=y-cy; const ang=Math.atan2(dy,dx); const len=Math.min(1,Math.hypot(dx,dy)/(r.width*0.5));
      knob.style.transform=`translate(${dx*0.35}px,${dy*0.35}px) translate(-50%,-50%)`;
      stickState={ang,len};
    };
    const stop=()=>{ knob.style.transform="translate(-50%,-50%)"; stickState=null; };
    stick.addEventListener("pointerdown",e=>{stick.setPointerCapture(e.pointerId); set(e.clientX,e.clientY);});
    stick.addEventListener("pointermove",e=>{ if(e.pressure>0) set(e.clientX,e.clientY); });
    stick.addEventListener("pointerup",stop); stick.addEventListener("pointercancel",stop);
    state.readStick=()=>stickState;
    netBtn.addEventListener("click",()=>swingNet());
    shopBtn.addEventListener("click",()=>toggleShop());
  }

  // ---------- ГЕОМЕТРИЯ ----------
  function circleRectIntersects(cx,cy,cr,rect){
    const dx=Math.max(rect.x-cx,0,cx-(rect.x+rect.w));
    const dy=Math.max(rect.y-cy,0,cy-(rect.y+rect.h));
    return (dx*dx + dy*dy) <= cr*cr;
  }
  function segmentRectIntersects(x1,y1,x2,y2,r){
    const xmin=r.x, xmax=r.x+r.w, ymin=r.y, ymax=r.y+r.h;
    let c1 = code(x1,y1), c2 = code(x2,y2);
    function code(x,y){return (y>ymax?1:0)|(y<ymin?2:0)|(x>xmax?4:0)|(x<xmin?8:0);}
    while(true){
      if(!(c1|c2)) return true;
      if(c1 & c2) return false;
      const c=c1||c2; let x,y;
      if(c&1){x=x1+(x2-x1)*(ymax-y1)/(y2-y1); y=ymax;}
      else if(c&2){x=x1+(x2-x1)*(ymin-y1)/(y2-y1); y=ymin;}
      else if(c&4){y=y1+(y2-y1)*(xmax-x1)/(x2-x1); x=xmax;}
      else {y=y1+(y2-y1)*(xmin-x1)/(x2-x1); x=xmin;}
      if(c===c1){x1=x;y1=y;c1=code(x1,y1);} else {x2=x;y2=y;c2=code(x2,y2);}
    }
  }
  function hasLineOfSight(a,b){
    for(const o of state.obstacles){ if(segmentRectIntersects(a.x,a.y,b.x,b.y,o)) return false; }
    return true;
  }

  // ---------- ЛОГИКА ----------
  function update(dt){
    const speed=220; let vx=0, vy=0;
    if(keys.has("w")||keys.has("arrowup"))    vy-=1;
    if(keys.has("s")||keys.has("arrowdown"))  vy+=1;
    if(keys.has("a")||keys.has("arrowleft"))  vx-=1;
    if(keys.has("d")||keys.has("arrowright")) vx+=1;
    if(state.mobile && state.readStick){
      const s=state.readStick(); if(s){ vx+=Math.cos(s.ang)*s.len; vy+=Math.sin(s.ang)*s.len; }
    }
    const l=Math.hypot(vx,vy)||1;
    state.player.x=clamp(state.player.x+vx/l*speed*dt,40,canvas.width-40);
    state.player.y=clamp(state.player.y+vy/l*speed*dt,260,canvas.height-40);

    // автоприцел
    const lock=getClosestCatchable();
    const follow= state.mobile?0.18:0.1;
    if(lock){ state.input.mx += (lock.x-state.input.mx)*follow; state.input.my += (lock.y-state.input.my)*follow; state.input.aimAssist=state.mobile?28:16; }
    else { state.input.aimAssist=state.mobile?18:10; }

    if(state.input.click){ swingNet(); state.input.click=false; }
    state.player.netCooldown=Math.max(0, state.player.netCooldown-dt);

    for(const e of state.entities){
      if(!e.alive) continue;
      steer(e,dt);

      if(e.type==="varan"){
        e.warmup = Math.max(0, e.warmup - dt); // первые 3 сек слабее
        if(!e.target || !e.target.alive || Math.random()<0.01){
          e.target = closestAlive(e, it=>it.alive && (it.type==="animal"||it.type==="person"));
        }
        if(e.target){
          const ang = Math.atan2(e.target.y-e.y, e.target.x-e.x);
          const diff = normalizeAngle(ang - e.dir);
          e.dir += diff*0.22;
        }
        const victim = closestAlive(e, it=>it.alive && (it.type==="animal"||it.type==="person"));
        const attackRange = (victim?victim.r:0) + (e.warmup>0?3:8);
        if(victim && Math.hypot(victim.x-e.x,victim.y-e.y) < attackRange){
          if(hasLineOfSight(e,victim)){
            victim.alive=false; state.lost++; flash(statusEl,`⚠️ Пострадал ${victim.type==="person"?"посетитель":"питомец"}`,true);
          }
        }
      } else {
        e.dir += rand(-0.4,0.4)*dt;
      }

      const k = (e.type==="person")?48:(e.type==="animal")?68:118;
      e.x += Math.cos(e.dir)*e.speed*k*dt;
      e.y += Math.sin(e.dir)*e.speed*k*dt;

      e.x = clamp(e.x, 20, canvas.width-20);
      e.y = clamp(e.y, 260, canvas.height-20);
    }
  }

  function steer(e,dt){
    const look = 30 + (e.type==="varan"?34:16);
    const nx = e.x + Math.cos(e.dir)*look;
    const ny = e.y + Math.sin(e.dir)*look;
    let hit=null;
    for(const o of state.obstacles){
      if(nx>o.x-6 && nx<o.x+o.w+6 && ny>o.y-6 && ny<o.y+o.h+6){ hit=o; break; }
    }
    if(hit){
      const cx = clamp(e.x, hit.x, hit.x+hit.w);
      const cy = clamp(e.y, hit.y, hit.y+hit.h);
      const normal = Math.atan2(e.y - cy, e.x - cx);
      e.dir = normal + Math.PI/2 + rand(-0.25,0.25);
      e.x += Math.cos(normal)*22*dt;
      e.y += Math.sin(normal)*22*dt;
      if(e.type==="varan"){ e.stuckT+=dt; if(e.stuckT>1.2){ e.dir += rand(1.0,2.0); e.stuckT=0; } }
    } else if(e.type==="varan"){ e.stuckT=Math.max(0,e.stuckT-dt*0.5); }
  }

  function normalizeAngle(a){ while(a>Math.PI) a-=2*Math.PI; while(a<-Math.PI) a+=2*Math.PI; return a; }
  function closestAlive(from, filter){
    let best=null, bd=1e9;
    for(const e of state.entities){
      if(!e.alive) continue; if(filter && !filter(e)) continue;
      const d=dist2(from,e); if(d<bd){ bd=d; best=e; }
    }
    return best;
  }
  function getClosestCatchable(){
    let best=null, bd=1e9;
    for(const e of state.entities){
      if(!e.alive) continue;
      if(e.type==="varan"||e.type==="animal"){
        const d=(state.input.mx-e.x)**2 + (state.input.my-e.y)**2;
        if(d<bd){ bd=d; best=e; }
      }
    }
    return best;
  }

  // ---------- ЛОВЛЯ ----------
  function swingNet(){
    if(state.shopOpen || state.player.netCooldown>0) return;
    state.player.netCooldown = 0.35;
    const aim = getClosestCatchable();
    const baseR = 50 + state.input.aimAssist;
    if(!aim){ flash(statusEl,"Мимо 😬",true); return; }
    const d = Math.hypot(state.input.mx-aim.x, state.input.my-aim.y);
    const hasLOS = hasLineOfSight({x:state.player.x,y:state.player.y}, aim);
    const R = hasLOS ? baseR : baseR*0.6;
    if(d <= R){
      if(aim.type==="varan"){
        aim.alive=false; state.rescued++; state.basket.push("🦎 Варан (пойман)"); redrawBasket();
        flash(statusEl,"✅ Варан пойман!"); checkWin();
      } else {
        aim.alive=false; state.rescued++; state.basket.push(`${aim.emoji} Спасена рептилия`); redrawBasket();
        flash(statusEl,"🧺 Рептилия спасена");
      }
      updateHUD();
    } else {
      flash(statusEl,"Юркнул! Попробуй ещё 👀",true);
    }
  }

  // ---------- ОТРИСОВКА ----------
  function draw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    drawBackground();

    // препятствия
    for(const o of state.obstacles){
      ctx.fillStyle="#1b2833"; ctx.strokeStyle="#284050";
      roundRect(ctx,o.x,o.y,o.w,o.h,12,true,true);
      ctx.fillStyle="rgba(90,180,255,.07)";
      roundRect(ctx,o.x+6,o.y+6,o.w-12,o.h-12,10,true,false);
    }

    // сущности
    for(const e of state.entities){
      if(!e.alive) continue;
      const vis = hasLineOfSight({x:state.player.x,y:state.player.y}, e);
      ctx.globalAlpha = vis?1:0.38;
      drawEntityEmojiFallback(e);
      ctx.globalAlpha = 1;
    }

    drawPlayer();

    // прицел
    ctx.save();
    ctx.strokeStyle="rgba(255,255,255,.75)"; ctx.lineWidth=1.6;
    ctx.beginPath(); ctx.arc(state.input.mx,state.input.my, 16+state.input.aimAssist*0.45,0,Math.PI*2); ctx.stroke();
    ctx.restore();
  }

  function drawBackground(){
    ctx.fillStyle="#12202a"; ctx.fillRect(0,0,canvas.width,260);
    ctx.fillStyle="#0f1a22"; ctx.fillRect(0,260,canvas.width,6);
    ctx.fillStyle="#4cc3ff"; ctx.font="900 44px system-ui,Inter,Manrope"; ctx.textBaseline="top";
    ctx.fillText("ПАНТЕРЕК", 24, 18);
    ctx.fillStyle="#ff7b7b"; ctx.font="600 16px system-ui"; ctx.fillText("Разбитый террариум — варан сбежал!", 24, 70);

    ctx.font="28px Apple Color Emoji,Segoe UI Emoji,system-ui";
    for(let i=0;i<6;i++) ctx.fillText("💡", 110+i*180, 150);

    ctx.fillStyle="#16232d"; ctx.fillRect(0,630,260,70);
    ctx.fillStyle="#203242"; ctx.fillRect(0,630,260,8);
    ctx.fillStyle="rgba(255,255,255,.08)"; ctx.fillRect(16,642,228,48);
    ctx.fillStyle="#cfe9ff"; ctx.font="600 14px system-ui"; ctx.fillText("Корзина выдачи/эвакуации 🧺", 26, 648);
  }

  // ЭМОДЗИ + ВЕКТОРНЫЙ ФОЛБЭК (всегда видно)
  function drawEntityEmojiFallback(e){
    const size = (e.type==="varan")?38:32;

    // подложка
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,.25)";
    ctx.beginPath(); ctx.ellipse(e.x+2,e.y+2, (size*0.55), (size*0.38), 0, 0, Math.PI*2); ctx.fill();
    ctx.restore();

    // пробуем эмодзи
    ctx.save();
    ctx.font = `${size}px Apple Color Emoji,Segoe UI Emoji,system-ui`;
    ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillText(e.emoji, e.x, e.y);

    // рисуем дублирующий силуэт — если эмодзи вдруг не видно, всё равно останется кружок
    ctx.beginPath();
    ctx.fillStyle = e.color || "#cfe9ff";
    ctx.ellipse(e.x, e.y, size*0.45, size*0.35, 0, 0, Math.PI*2);
    ctx.fill();

    // глаз для варана
    if(e.type==="varan"){
      ctx.fillStyle="#0b0b0b";
      ctx.beginPath(); ctx.arc(e.x+8,e.y-6,3,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }

  function drawPlayer(){
    ctx.strokeStyle="rgba(200,240,255,.6)"; ctx.lineWidth=6; ctx.lineCap="round";
    ctx.beginPath(); ctx.moveTo(state.player.x-20,state.player.y+8); ctx.lineTo(state.player.x-70,state.player.y+28); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(state.player.x+20,state.player.y+8); ctx.lineTo(state.player.x+70,state.player.y+28); ctx.stroke();

    ctx.strokeStyle="#cfe9ff"; ctx.lineWidth=4;
    ctx.beginPath(); ctx.moveTo(state.player.x+20,state.player.y+8); ctx.lineTo(state.input.mx,state.input.my); ctx.stroke();
    ctx.font="26px Apple Color Emoji,Segoe UI Emoji,system-ui";
    ctx.fillText("🪤", state.input.mx-13, state.input.my-16);

    if(state.player.leftHand) drawBadge(state.player.x-86,state.player.y+18,state.player.leftHand);
    if(state.player.rightHand) drawBadge(state.player.x+86,state.player.y+18,state.player.rightHand);
  }
  function drawBadge(x,y,item){
    ctx.save(); ctx.translate(x,y);
    ctx.fillStyle="rgba(255,255,255,.06)"; roundRect(ctx,-22,-28,44,56,10,true,false);
    ctx.font="28px Apple Color Emoji,Segoe UI Emoji,system-ui"; ctx.textAlign="center"; ctx.fillText(item.emoji, 0, -3);
    ctx.restore();
  }
  function roundRect(ctx,x,y,w,h,r,fill,stroke){
    if (w<2*r) r=w/2; if(h<2*r) r=h/2;
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r);
    ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r);
    ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
    if(fill) ctx.fill(); if(stroke) ctx.stroke();
  }

  // ---------- HUD ----------
  function updateHUD(){
    moneyEl.textContent = "₽ " + state.money.toLocaleString("ru-RU");
    progressEl.textContent = `🧺 ${state.rescued}   •   💥 ${state.lost}`;
  }
  function redrawBasket(){
    basketEl.innerHTML=""; state.basket.slice(-8).forEach(t=>{const li=document.createElement("li"); li.textContent=t; basketEl.appendChild(li);});
  }
  function flash(el, text, danger=false){
    el.textContent=text; el.style.color = danger ? "var(--danger)" : "var(--accent)";
    el.animate([{opacity:.3},{opacity:1}],{duration:180,iterations:1});
  }
  function checkWin(){
    const alive = state.entities.some(e=>e.type==="varan" && e.alive);
    if(!alive) flash(statusEl,"🎉 Победа! Варан обезврежен. Спасайте остальных.");
  }

  // ---------- ЦИКЛ ----------
  let last=now();
  function loop(){
    const t=now(); const dt=Math.min(0.05,(t-last)/1000); last=t;
    update(dt); draw();
    const sec=Math.floor((Date.now()-state.startedAt)/1000);
    timerEl.textContent = "⏱ " + String(Math.floor(sec/60)).padStart(2,"0")+":"+String(sec%60).padStart(2,"0");
    requestAnimationFrame(loop);
  }

  // ---------- СТАРТ ----------
  function start(){
    spawn(); renderShop(); redrawBasket(); updateHUD();
    state.input.mx = canvas.width/2; state.input.my = canvas.height*0.62;
    loop();
  }
  start();
})();
