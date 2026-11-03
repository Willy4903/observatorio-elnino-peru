// Interacciones pedagógicas y de lectura. No modifica series, pronósticos ni fuentes.
const examples = [
  'Si un índice marca +2 °C, compara la temperatura del mar con el promedio habitual de esa zona y época. No significa que el aire esté 2 °C más caliente.',
  'Una ciudad puede registrar lluvias fuertes mientras otra tiene un día seco. El fenómeno influye en el clima, pero no determina el tiempo exacto de cada calle.',
  'Dos barrios del mismo distrito pueden tener exposición diferente: uno puede estar cerca de una quebrada y otro encontrarse en una zona más elevada.'
];
const firstSteps = [...document.querySelectorAll('.citizen-primer-steps > li')];
firstSteps.forEach((item,i)=>{
  if(!examples[i]||item.querySelector('.citizen-mini-detail'))return;
  const d=document.createElement('details');
  d.className='citizen-mini-detail';
  const summary=document.createElement('summary');
  summary.textContent='Ver un ejemplo cotidiano';
  const p=document.createElement('p');
  p.textContent=examples[i];
  d.append(summary,p);item.append(d);
});

const preparation = document.getElementById('preparacion');
const actions = [...document.querySelectorAll('.citizen-actions > li')];
if(preparation&&actions.length===4){
  const status=document.createElement('div');
  status.className='citizen-review';
  status.setAttribute('aria-label','Lista personal de revisión');
  const progressLabel=document.createElement('strong');
  progressLabel.textContent='Tu lista de preparación';
  const count=document.createElement('span');
  count.setAttribute('role','status');count.textContent='0 de 4 puntos revisados';
  const bar=document.createElement('div');bar.className='citizen-review-track';
  bar.setAttribute('aria-hidden','true');
  const fill=document.createElement('i');bar.append(fill);
  status.append(progressLabel,count,bar);
  const list=preparation.querySelector('.citizen-actions');
  list?.insertAdjacentElement('afterend',status);
  const buttons=[];
  for(const [i,item] of actions.entries()){
    const b=document.createElement('button');
    b.type='button';b.className='citizen-action-check';
    b.textContent='Marcar como revisado';
    b.setAttribute('aria-label','Marcar como revisado: '+(item.querySelector('h3')?.textContent||('punto '+(i+1))));
    b.setAttribute('aria-pressed','false');
    const update=()=>{
      const done=buttons.filter(x=>x.getAttribute('aria-pressed')==='true').length;
      count.textContent=done+' de '+buttons.length+' puntos revisados';
      fill.style.width=(done/buttons.length*100)+'%';
    };
    b.addEventListener('click',()=>{
      const active=b.getAttribute('aria-pressed')==='true';
      b.setAttribute('aria-pressed',String(!active));
      b.textContent=active?'Marcar como revisado':'Revisado ✓';
      update();
    });
    item.append(b);buttons.push(b);
  }
  const note=document.createElement('p');
  note.className='citizen-review-note';
  note.textContent='Esta lista es una ayuda para organizarte; marcar una casilla no certifica que tu vivienda esté libre de riesgo.';
  status.insertAdjacentElement('afterend',note);
}

// La barra acompaña el recorrido de un documento extenso sin interferir con el mapa.
if(document.querySelector('#main')){
  const indicator=document.createElement('div');
  indicator.className='ocean-reading-progress';indicator.setAttribute('aria-hidden','true');
  const meter=document.createElement('i');indicator.append(meter);
  document.body.append(indicator);
  let ticking=false;
  const update=()=>{
    const max=Math.max(1,document.documentElement.scrollHeight-innerHeight);
    meter.style.transform='scaleX('+Math.min(1,Math.max(0,scrollY/max))+')';
    ticking=false;
  };
  const queue=()=>{if(!ticking){ticking=true;requestAnimationFrame(update);}};
  addEventListener('scroll',queue,{passive:true});
  addEventListener('resize',queue,{passive:true});
  update();
}

// Animaciones discretas solamente cuando el usuario permite movimiento.
// Si falla IntersectionObserver, todo el contenido permanece visible.
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
if(!reduced.matches && 'IntersectionObserver' in window){
  const sections=['#que-es','#guia-inicio','#guia-contenido','#estado-enfen',
    '#ultimo','#preparacion','.radar-pathways','#cobertura','#meteo','#fuentes'];
  const elements=sections.flatMap(sel=>[...document.querySelectorAll(sel)]);
  const observer=new IntersectionObserver((entries)=>{
    for(const e of entries){
      if(e.isIntersecting){
        e.target.classList.add('ocean-visible');
        observer.unobserve(e.target);
      }
    }
  },{threshold:.05,rootMargin:'0px 0px 80px 0px'});
  for(const el of elements){
    el.classList.add('ocean-reveal');
    observer.observe(el);
  }
}
