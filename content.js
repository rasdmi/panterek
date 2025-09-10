/* Контент: набор животных, цены, цвета и эмодзи */
window.GAME_CONTENT = {
  startMoney: 10000,
  animals: [
    { id:"gecko",   title:"Геккон леопардовый", price:2400, emoji:"🦎", color:"#6ee7b7" },
    { id:"python",  title:"Питон королевский",  price:5200, emoji:"🐍", color:"#facc15" },
    { id:"turtle",  title:"Черепаха степная",   price:1800, emoji:"🐢", color:"#93c5fd" },
    { id:"skink",   title:"Сцинк огненный",     price:3300, emoji:"🦎", color:"#fb7185" },
    { id:"iguana",  title:"Игуана зелёная",     price:4100, emoji:"🦕", color:"#86efac" }
  ],
  /* Препятствия — «террариумы/стойки». Между ними есть проёмы, чтобы ИИ мог проходить. */
  obstacles: [
    {x:120, y:380, w:220, h:140, label:"T-01"},
    {x:420, y:350, w:250, h:170, label:"T-02"},
    {x:730, y:370, w:230, h:150, label:"T-03 (бит)"},
    {x:1010,y:360, w:140, h:160, label:"Лампы"},
    {x:300, y:560, w:620, h:40,  label:"Скамья"},
  ]
};
