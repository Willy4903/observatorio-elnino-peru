// Presentación independiente del pipeline: no calcula ni sustituye datos oficiales.
const dialog=document.getElementById('navigation-dialog');
const open=document.getElementById('open-navigation');
const close=document.getElementById('close-navigation');
if(dialog&&open&&close){
  open.addEventListener('click',()=>{dialog.showModal();open.setAttribute('aria-expanded','true');document.body.classList.add('navigation-open');});
  close.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{open.setAttribute('aria-expanded','false');document.body.classList.remove('navigation-open');});
  dialog.addEventListener('click',event=>{
    if(event.target.closest('a')){dialog.close();return;}
    if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}
  });
}

// Esfera geométrica decorativa, inspirada en la portada de IA Radar.
// Sus puntos no representan estaciones, lluvias, temperaturas ni emergencias.
const canvas=document.getElementById('radar-sphere');
const motion=document.getElementById('stage-motion');
if(canvas&&motion){
  const ctx=canvas.getContext('2d');
  if(ctx){
    const reduce=matchMedia('(prefers-reduced-motion: reduce)');
    const count=136,gold=Math.PI*(3-Math.sqrt(5));
    const points=Array.from({length:count},(_,i)=>{const y=1-2*i/(count-1),r=Math.sqrt(1-y*y),a=gold*i;return {x:Math.cos(a)*r,y,z:Math.sin(a)*r,size:1.2+(i%5)/5};});
    const edges=[];
    for(let i=0;i<count;i++)for(let j=i+1;j<count;j++){const a=points[i],b=points[j];if(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)<.56)edges.push([i,j]);}
    let width=0,height=0,dpr=1,angle=.4,frame=0,last=0,visible=true,paused=false;
    const enabled=()=>!paused&&!reduce.matches;
    function color(x,alpha){const t=Math.max(0,Math.min(1,.5+x*.6));return `rgba(${Math.round(37+199*t)},${Math.round(217-121*t)},${Math.round(245+10*t)},${alpha})`;}
    function draw(){
      if(!width||!height)return;
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
      const radius=Math.min(width,height)*.39,cx=width/2,cy=height/2,ca=Math.cos(angle),sa=Math.sin(angle),tilt=.26,ct=Math.cos(tilt),st=Math.sin(tilt);
      const projected=points.map(p=>{const x=p.x*ca+p.z*sa,z0=-p.x*sa+p.z*ca,y=p.y*ct-z0*st,z=p.y*st+z0*ct,k=1/(1.8-z*.35);return {x:cx+x*radius*k*1.45,y:cy+y*radius*k*1.45,z,k,colorX:x,size:p.size};});
      const glow=ctx.createRadialGradient(cx,cy,0,cx,cy,radius*1.16);
      glow.addColorStop(0,'rgba(139,92,246,.13)');glow.addColorStop(.6,'rgba(37,217,245,.045)');glow.addColorStop(1,'rgba(13,15,21,0)');
      ctx.fillStyle=glow;ctx.fillRect(0,0,width,height);ctx.globalCompositeOperation='lighter';ctx.lineWidth=.8;
      for(const [i,j] of edges){const a=projected[i],b=projected[j],depth=(a.z+b.z+2)/4;ctx.strokeStyle=color((a.colorX+b.colorX)/2,.06+.22*depth);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
      for(const p of projected){ctx.fillStyle=color(p.colorX,.2+.65*(p.z+1)/2);ctx.shadowColor=color(p.colorX,.6);ctx.shadowBlur=p.z>0?9:0;ctx.beginPath();ctx.arc(p.x,p.y,p.size*p.k*1.45,0,Math.PI*2);ctx.fill();}
      ctx.shadowBlur=0;ctx.globalCompositeOperation='source-over';
    }
    function tick(time){
      frame=0;if(!enabled()||!visible||document.hidden)return;
      if(!last||time-last>=1000/24){angle+=Math.min((time-last||40)/1000,.08)*.12;last=time;draw();}
      frame=requestAnimationFrame(tick);
    }
    function sync(){
      cancelAnimationFrame(frame);frame=0;last=0;
      motion.disabled=reduce.matches;
      motion.textContent=reduce.matches?'Portada sin movimiento':paused?'Activar animación de portada':'Pausar animación de portada';
      motion.setAttribute('aria-pressed',String(enabled()));
      draw();if(enabled()&&visible&&!document.hidden)frame=requestAnimationFrame(tick);
    }
    function size(){const rect=canvas.getBoundingClientRect();width=rect.width;height=rect.height;dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);draw();}
    motion.addEventListener('click',()=>{paused=!paused;sync();});
    reduce.addEventListener('change',sync);document.addEventListener('visibilitychange',sync);
    new ResizeObserver(size).observe(canvas);
    new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync();}).observe(canvas);
    size();sync();
  }else motion.hidden=true;
}
