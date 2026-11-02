(function(){
var CORRECT=0,sel=null,conf=null,base=40,C=2*Math.PI*34;
var $=function(s){return document.querySelector(s)};
var opts=[].slice.call(document.querySelectorAll('.opt')),chips=[].slice.call(document.querySelectorAll('.chip'));
var fill=$('.ring .fill'),val=$('.ring text'),dx=$('#dx'),confBox=$('#conf'),submit=$('#submit');
function ring(v){fill.setAttribute('stroke-dasharray',(C*v/100)+' '+C);val.textContent=v+'%'}
ring(base);
function mark(list,el,attr){list.forEach(function(b){b.setAttribute('aria-pressed',b===el?'true':'false')})}
opts.forEach(function(b,i){b.onclick=function(){sel=i;mark(opts,b);confBox.hidden=(i===4);if(i===4){conf=null;mark(chips,null)}update()}});
chips.forEach(function(b){b.onclick=function(){conf=b.dataset.c;mark(chips,b);update()}});
function update(){submit.disabled=!(sel!==null&&(sel===4||conf))}
submit.onclick=function(){
var ok=sel===CORRECT,idk=sel===4,v=base,cls,t,msg;
if(idk){cls='';t='No evidence, no penalty';msg='You said you do not know. Hilum records that as its own kind of evidence. It does not count as a confident mistake, and it tells the agent to teach this before testing it again.'}
else if(ok&&conf==='sure'){v=base+30;cls='ok';t='Understood';msg='Correct and sure. Confidence matches the evidence, so mastery moves up a lot. About 65% of filtered sodium is reabsorbed in the proximal tubule.'}
else if(ok){v=base+(conf==='fairly'?18:8);cls='warn';t='Right answer, thin footing';msg='Correct, but you were '+(conf==='fairly'?'only fairly sure':'guessing')+'. Mastery moves up, just less. Expect this concept back for review soon.'}
else if(conf==='sure'){v=base-20;cls='bad';t='Confident mistake';msg='Wrong while sure. This is the most useful finding in a session, because it is a belief to fix, not a gap to fill. Mastery drops and the agent teaches from your reasoning.'}
else{v=base-6;cls='warn';t='Wrong, and you knew it';msg='Wrong, but you flagged the uncertainty. That is good calibration. Mastery dips slightly.'}
v=Math.max(0,Math.min(100,v));ring(v);
dx.className='dx '+cls;dx.hidden=false;dx.innerHTML='<strong></strong><span></span>';
dx.firstChild.textContent='Assessment: '+t;dx.lastChild.textContent=msg;
submit.hidden=true;$('#reset').hidden=false;opts.concat(chips).forEach(function(b){b.disabled=true})};
$('#reset').onclick=function(){sel=null;conf=null;mark(opts,null);mark(chips,null);confBox.hidden=false;dx.hidden=true;submit.hidden=false;submit.disabled=true;this.hidden=true;opts.concat(chips).forEach(function(b){b.disabled=false});ring(base)};
})();
