// Bygger nya reels ur söndagsreelens mall: samma scener, tider och animationer,
// bara ny text och nya skärmbilder (så att melodin passar utan ändringar).
import { readFileSync, writeFileSync } from 'node:fs';
const base = readFileSync(new URL('./reel.html', import.meta.url), 'utf8');
const swap = (html, pairs) => pairs.reduce((h, [a, b]) => { if (!h.includes(a)) throw new Error('saknas: ' + a); return h.replace(a, b); }, html);
const S1 = '<div class="big" id="s1a">Söndag..</div>\n  <div class="sub" id="s1b">…och ingen aning om vad<br>vi ska äta i veckan <span class="emo" id="sigh" style="font-size:34px">😮‍💨</span></div>';
const S2 = '<div class="big" id="s2a" style="font-size:54px">…men vänta! <span class="emo" id="bulb">💡</span></div>\n  <div class="sub" id="s2b" style="margin-top:10px;color:#fff">Alla favoritrecept finns ju <span class="lime">i Handlis</span></div>\n  <div class="phone" id="p2" style="top:320px"><img src="03.jpg"></div>';
const S3M = '<div class="mid">Plocka några till<br>veckomenyn <span class="emo">🍝</span></div>\n  <div class="sub" style="font-size:19px;margin-top:10px">…eller ta en sparad vecka – klart på en minut</div>\n  <div class="phone" id="p3m" style="top:320px"><img src="07.jpg"></div>';
const S3 = '<div class="mid">Listan sorterar sig själv –<br><span class="lime">efter butikens ordning</span> <span class="emo">🛒</span></div>\n  <div class="phone" id="p3" style="top:290px"><img src="05.jpg"></div>';
const S4 = '<div class="big" id="s4a">Handla<br>en gång.</div>\n  <div class="mid lime" id="s4b" style="margin-top:22px;font-size:42px">– med Handlis <span class="emo" id="heart">💚</span></div>';
const S5 = '<div class="mid" style="font-size:40px">Planera veckan<br>i Handlis <span class="lime">idag</span></div>';

const REELS = {
  'reel-gradde': [
    [S1, '<div class="big" id="s1a" style="font-size:62px">Glömt grädden..</div>\n  <div class="sub" id="s1b">…igen <span class="emo" id="sigh" style="font-size:34px">🙃</span></div>'],
    [S2, '<div class="big" id="s2a" style="font-size:54px">Dela listan! <span class="emo" id="bulb">💡</span></div>\n  <div class="sub" id="s2b" style="margin-top:10px;color:#fff">Alla i hushållet ser <span class="lime">samma inköpslista</span></div>\n  <div class="phone" id="p2" style="top:320px"><img src="01.jpg"></div>'],
    [S3M, '<div class="mid">Någon lägger till grädde –<br>syns direkt hos dig <span class="emo">🥛</span></div>\n  <div class="sub" style="font-size:19px;margin-top:10px">…även när du redan står i butiken</div>\n  <div class="phone" id="p3m" style="top:320px"><img src="05.jpg"></div>'],
    [S3, '<div class="mid">Tryck "Jag handlar" –<br><span class="lime">så vet alla var du är</span> <span class="emo">🏃</span></div>\n  <div class="phone" id="p3" style="top:290px"><img src="05.jpg"></div>'],
    [S4, '<div class="big" id="s4a">Inget<br>glömt.</div>\n  <div class="mid lime" id="s4b" style="margin-top:22px;font-size:42px">– med Handlis <span class="emo" id="heart">💚</span></div>'],
    [S5, '<div class="mid" style="font-size:40px">Handla tillsammans<br>i <span class="lime">Handlis</span></div>'],
  ],
  'reel-kokboken': [
    [S1, '<div class="big" id="s1a" style="font-size:56px">Mormors<br>receptbok..</div>\n  <div class="sub" id="s1b">…som aldrig finns där<br>när man behöver den <span class="emo" id="sigh" style="font-size:34px">📖</span></div>'],
    [S2, '<div class="big" id="s2a" style="font-size:54px">Fota sidan! <span class="emo" id="bulb">📸</span></div>\n  <div class="sub" id="s2b" style="margin-top:10px;color:#fff">Handlis läser <span class="lime">receptet åt dig</span></div>\n  <div class="phone" id="p2" style="top:320px"><img src="02.jpg"></div>'],
    [S3M, '<div class="mid">Ingredienser och steg –<br>på sekunder <span class="emo">✨</span></div>\n  <div class="sub" style="font-size:19px;margin-top:10px">…även flera sidor, eller flera recept på ett uppslag</div>\n  <div class="phone" id="p3m" style="top:320px"><img src="03.jpg"></div>'],
    [S3, '<div class="mid">Lägg det på veckomenyn –<br><span class="lime">listan gör sig själv</span> <span class="emo">🍝</span></div>\n  <div class="phone" id="p3" style="top:290px"><img src="07.jpg"></div>'],
    [S4, '<div class="big" id="s4a" style="font-size:60px">Mormors<br>pannkakor.</div>\n  <div class="mid lime" id="s4b" style="margin-top:22px;font-size:42px">– alltid med <span class="emo" id="heart">💚</span></div>'],
    [S5, '<div class="mid" style="font-size:40px">Rädda era favoritrecept<br>i <span class="lime">Handlis</span></div>'],
  ],
};
for (const [name, pairs] of Object.entries(REELS)) writeFileSync(new URL(`./${name}.html`, import.meta.url), swap(base, pairs));
console.log(Object.keys(REELS).join(', '));
