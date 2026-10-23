// Los campos se descargan de NOAA. El renderizador no inventa valores ni rellena máscaras.
const stops=[[-3,[29,78,216]],[-1,[56,189,248]],[0,[32,47,68]],[.5,[136,108,36]],[1,[234,179,8]],[2,[249,115,22]],[3,[239,68,68]],[5,[239,51,42]],[6,[185,28,28]]];
export function anomalyColor(value) {
  if (!Number.isFinite(value)) return null;
  const v=Math.max(stops[0][0],Math.min(stops.at(-1)[0],value));
  const i=stops.findIndex(s=>s[0]>=v);
  if(i<=0)return `rgb(${stops[0][1].join(',')})`;
  const [a,ac]=stops[i-1],[b,bc]=stops[i],t=(v-a)/(b-a);
  return `rgb(${ac.map((x,j)=>Math.round(x+t*(bc[j]-x))).join(',')})`;
}
function canvasLayer(rows,{vectors=false,step=.25}={}) {
  const L=window.L;
  return new (L.Layer.extend({
    onAdd(map) {
      this._map=map;this._canvas=L.DomUtil.create('canvas','ocean-grid-canvas');
      this._ctx=this._canvas.getContext('2d');map.getPane(vectors?'oceanVectors':'ocean').appendChild(this._canvas);
      this._redraw=this.draw.bind(this);map.on('moveend zoomend resize',this._redraw);this.draw();
      if(vectors&&!matchMedia('(prefers-reduced-motion: reduce)').matches){let last=0;const tick=t=>{if(t-last>=1000/24){if(!document.hidden)this.draw(t);last=t;}this._frame=requestAnimationFrame(tick);};this._frame=requestAnimationFrame(tick);}
    },
    onRemove(map) {map.off('moveend zoomend resize',this._redraw);cancelAnimationFrame(this._frame);this._canvas.remove();this._map=null;},
    draw(t=0) {
      if(!this._map)return;
      const map=this._map,size=map.getSize(),dpr=Math.min(window.devicePixelRatio||1,2),c=this._canvas,ctx=this._ctx;
      if(c.width!==Math.round(size.x*dpr)||c.height!==Math.round(size.y*dpr)){c.width=Math.round(size.x*dpr);c.height=Math.round(size.y*dpr);c.style.width=size.x+'px';c.style.height=size.y+'px';}
      L.DomUtil.setPosition(c,map.containerPointToLayerPoint([0,0]));ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,size.x,size.y);
      const bounds=map.getBounds().pad(.1);
      if(vectors){ctx.lineWidth=1;ctx.strokeStyle='rgba(253,186,116,.85)';ctx.fillStyle='#fde68a';ctx.setLineDash([5,3]);ctx.lineDashOffset=-(t*.012)%8;}
      for(const row of rows){
        if(!bounds.contains([row.lat,row.lon]))continue;
        if(vectors){
          const speed=Math.hypot(row.u_ms,row.v_ms);if(speed<.008)continue;
          const p=map.latLngToContainerPoint([row.lat,row.lon]),dx=row.u_ms/Math.cos(row.lat*Math.PI/180),dy=-row.v_ms,n=Math.hypot(dx,dy),len=15;
          const x=dx/n*len,y=dy/n*len;
          ctx.beginPath();ctx.moveTo(p.x-x*.5,p.y-y*.5);ctx.lineTo(p.x+x*.5,p.y+y*.5);ctx.stroke();
          ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(p.x+x*.5,p.y+y*.5);ctx.lineTo(p.x+x*.5-x*.25-y*.2,p.y+y*.5-y*.25+x*.2);ctx.moveTo(p.x+x*.5,p.y+y*.5);ctx.lineTo(p.x+x*.5-x*.25+y*.2,p.y+y*.5-y*.25-x*.2);ctx.stroke();ctx.setLineDash([5,3]);
        } else {
          const color=anomalyColor(row.anomaly_c);if(!color)continue;
          const nw=map.latLngToContainerPoint([row.lat+step/2,row.lon-step/2]),se=map.latLngToContainerPoint([row.lat-step/2,row.lon+step/2]);
          ctx.fillStyle=color;ctx.globalAlpha=.86;ctx.fillRect(nw.x,nw.y,Math.max(1,se.x-nw.x+.35),Math.max(1,se.y-nw.y+.35));
        }
      }
      ctx.globalAlpha=1;
    }
  }))();
}
export const oceanScalarLayer=(rows,step=.25)=>canvasLayer(rows,{step});
export const oceanVectorLayer=rows=>canvasLayer(rows,{vectors:true});
