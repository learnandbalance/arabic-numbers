const data = [

{
n:"1",
arabicNumber:"١",
arabicText:"واحد",
pronunciation:"waahid"
},

{
n:"2",
arabicNumber:"٢",
arabicText:"اثنان",
pronunciation:"ithnayn"
},

{
n:"3",
arabicNumber:"٣",
arabicText:"ثلاثة",
pronunciation:"thalaatha"
},

{
n:"20",
arabicNumber:"٢٠",
arabicText:"عشرون",
pronunciation:"ishreen"
},

{
n:"31",
arabicNumber:"٣١",
arabicText:"واحد وثلاثون",
pronunciation:"waahid wa thalaathoon"
},

{
n:"101",
arabicNumber:"١٠١",
arabicText:"مئة وواحد",
pronunciation:"mia wa waahid"
},

{
n:"111",
arabicNumber:"١١١",
arabicText:"مئة وأحد عشر",
pronunciation:"mia wa ahad ashar"
},

{
n:"1001",
arabicNumber:"١٠٠١",
arabicText:"ألف وواحد",
pronunciation:"alf wa waahid"
},

{
n:"1111",
arabicNumber:"١١١١",
arabicText:"ألف ومئة وأحد عشر",
pronunciation:"alf wa mia wa ahad ashar"
},

{
n:"1980",
arabicNumber:"١٩٨٠",
arabicText:"ألف وتسعمئة وثمانون",
pronunciation:"alf wa tisumia wa thamanoon"
},

{
n:"1990",
arabicNumber:"١٩٩٠",
arabicText:"ألف وتسعمئة وتسعون",
pronunciation:"alf wa tisumia wa tisoon"
},

{
n:"2000",
arabicNumber:"٢٠٠٠",
arabicText:"ألفان",
pronunciation:"alfaan"
},

{
n:"2026",
arabicNumber:"٢٠٢٦",
arabicText:"ألفان وستة وعشرون",
pronunciation:"alfaan wa sitta wa ishreen"
}

];

let current=data[0];

const grid=document.getElementById('numberGrid');

function show(item){

current=item;

document.getElementById('arabicNumber').innerText=item.arabicNumber;

document.getElementById('arabicText').innerText=item.arabicText;

document.getElementById('pronunciation').innerText=item.pronunciation;

}

data.forEach(item=>{

const btn=document.createElement('button');

btn.className='number-btn';

btn.innerHTML=
`
<div>${item.n}</div>
`;

btn.onclick=()=>{

show(item);

speak(item.arabicText);

};

grid.appendChild(btn);

});

function speak(text){

if(!window.speechSynthesis) return;

window.speechSynthesis.cancel();

const utterance=
new SpeechSynthesisUtterance(text);

utterance.lang="ar";

speechSynthesis.speak(utterance);

}

function speakCurrent(){

speak(current.arabicText);

}

show(data[0]);
