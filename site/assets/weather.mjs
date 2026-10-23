// Los efectos son símbolos gráficos anclados a valores publicados, no una deriva.
export const forecastDates = rows => [...new Set(rows.map(r=>r.valid_date))].sort();
export const frameRows = (rows,date) => date==='all'?rows:rows.filter(r=>r.valid_date===date);
export function weatherByDistrict(rows,metric='tmax') {
  const groups=new Map();
  for(const row of rows){if(!row.ubigeo)continue;if(!groups.has(row.ubigeo))groups.set(row.ubigeo,[]);groups.get(row.ubigeo).push(row);}
  return [...groups].map(([ubigeo,items])=>{
    const values=items.map(r=>metric==='rain'?r.precipitation_mm:metric==='tmin'?r.tmin_c:r.tmax_c).filter(Number.isFinite);
    return {...items[0],ubigeo,value:values.length?values.reduce((a,b)=>a+b,0)/values.length:null,records:items.length};
  });
}
export function rainColor(mm){
  if(!Number.isFinite(mm))return '#26384b';
  return mm<=0?'#17374a':mm<2?'#2e8ba3':mm<10?'#38bdf8':mm<25?'#6366f1':mm<50?'#a855f7':'#ec4899';
}
export function weatherMotionLayer(rows,{metric='tmax',enabled=true}={}){
  const L=window.L;
  return new (L.Layer.extend({
    onAdd(map){
      this._map=map;this._canvas=L.DomUtil.create('canvas','weather-motion-canvas');this._ctx=this._canvas.getContext('2d');
      map.getPane('weatherEffects').appendChild(this._canvas);this._render=this.draw.bind(this);
      map.on('move zoom resize moveend',this._render);this.draw();
      if(enabled&&!matchMedia('(prefers-reduced-motion:reduce)').matches){let last=0;const tick=t=>{if(t-last>1000/24){if(!document.hidden)this.draw(t);last=t;}this._frame=requestAnimationFrame(tick);};this._frame=requestAnimationFrame(tick);}
    },
    onRemove(map){map.off('move zoom resize moveend',this._render);cancelAnimationFrame(this._frame);this._canvas.remove();this._map=null;},
    draw(time=0){
      if(!this._map)return;
      const map=this._map,size=map.getSize(),dpr=Math.min(devicePixelRatio||1,2),ctx=this._ctx,c=this._canvas;
      if(c.width!==Math.round(size.x*dpr)||c.height!==Math.round(size.y*dpr)){c.width=Math.round(size.x*dpr);c.height=Math.round(size.y*dpr);c.style.width=size.x+'px';c.style.height=size.y+'px';}
      L.DomUtil.setPosition(c,map.containerPointToLayerPoint([0,0]));ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,size.x,size.y);
      const visible=rows.filter(r=>Number.isFinite(r.lat)&&Number.isFinite(r.lon)&&Number.isFinite(r.value)&&map.getBounds().contains([r.lat,r.lon])&&(metric!=='rain'||r.value>0));
      const stride=Math.max(1,Math.ceil(visible.length/90));
      for(let i=0;i<visible.length;i+=stride){
        const r=visible[i],p=map.latLngToContainerPoint([r.lat,r.lon]),phase=(time/2600+(Number(r.ubigeo)%97)/97)%1;
        if(metric==='rain'){
          ctx.strokeStyle=rainColor(r.value);ctx.lineWidth=1.8;ctx.globalAlpha=.8;
          for(let j=0;j<3;j++){const fall=((phase+j/3)%1)*22;ctx.beginPath();ctx.moveTo(p.x+(j-1)*7,p.y-13+fall);ctx.lineTo(p.x+(j-1)*7,p.y-7+fall);ctx.stroke();}
        }else{
          ctx.strokeStyle=metric==='tmin'?'#67e8f9':r.value>=30?'#fb7185':r.value>=20?'#fb923c':'#7dd3fc';
          ctx.lineWidth=1.7;ctx.globalAlpha=enabled?.65*(1-phase):.45;ctx.beginPath();ctx.arc(p.x,p.y,enabled?4+phase*17:6,0,2*Math.PI);ctx.stroke();
          ctx.globalAlpha=.85;ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.arc(p.x,p.y,2,0,2*Math.PI);ctx.fill();
        }
      }
      ctx.globalAlpha=1;
    }
  }))();
}
