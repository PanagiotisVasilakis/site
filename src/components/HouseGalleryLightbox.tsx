"use client";
import { useState, useCallback, useRef, useEffect } from 'react';
import Image from 'next/image';
import type { HousePhoto } from '@/data/housePhotos';

type AltMap = { living: string; bedroom: string; kitchen: string } | undefined;
interface PhotoWithAlt extends HousePhoto { altKey: 'bedroom'|'kitchen'|'living'; }
interface Props { photos: PhotoWithAlt[]; alts: AltMap; springPreset?: 'gentle'|'medium'|'snappy'; enableHaptics?: boolean; }

export default function HouseGalleryLightbox({ photos, alts, springPreset='medium', enableHaptics=true }: Props) {
  // Configurable constants grouped
  const CONFIG = {
    MAX_SCALE: 4,
    WHEEL_STEP: 0.0012,
    DOUBLE_TAP_STEPS: [1, 2.2, 3.2],
    RUBBER_BAND: 0.35,
    INERTIA_DECAY: 0.92,
    SNAP_DURATION: 180,
    SWIPE_THRESHOLD: 60,
    CLOSE_VERTICAL_THRESHOLD: 120,
  EDGE_HINT_MAX_PX: 60,
  PINCH_VELOCITY_THRESHOLD: 0.0015, // scale units per ms
  PINCH_INERTIA_FACTOR: 180, // multiplier converting velocity to target delta scale
  SLIDE_VELOCITY_THRESHOLD: 0.5, // px per ms flick to trigger slide even if distance small
  // Base (medium) spring values; variants adjust multipliers
  SPRING_STIFFNESS_BASE: 0.11,
  SPRING_DAMPING_BASE: 0.87
  } as const;
  // Derived spring constants based on preset
  const SPRING_PRESETS: Record<'gentle'|'medium'|'snappy',{k:number; d:number}> = {
    gentle: { k: CONFIG.SPRING_STIFFNESS_BASE*0.8, d: 0.90 },
    medium: { k: CONFIG.SPRING_STIFFNESS_BASE, d: CONFIG.SPRING_DAMPING_BASE },
    snappy: { k: CONFIG.SPRING_STIFFNESS_BASE*1.55, d: 0.78 }
  };
  const activeSpring = SPRING_PRESETS[springPreset] || SPRING_PRESETS.medium;
  // Reduced motion preference
  const [reduceMotion,setReduceMotion]=useState(false);
  useEffect(()=>{ const mq=window.matchMedia('(prefers-reduced-motion: reduce)'); const apply=()=>setReduceMotion(mq.matches); apply(); mq.addEventListener('change',apply); return ()=> mq.removeEventListener('change',apply); },[]);
  const [open,setOpen]=useState(false); const [index,setIndex]=useState(0);
  const [fadeFrom,setFadeFrom]=useState<number|null>(null); // previous index for cross-fade while zoomed
  const lastPersistedIndex=useRef(0);
  const triggerHaptic=(pattern:number|number[]=8)=>{ 
    if(!enableHaptics) return; 
    if(typeof navigator==='undefined') return; 
    if(reduceMotion) return; 
    try { 
      const nav = navigator as Navigator & { vibrate?: (p:number|number[])=>boolean };
      if(typeof nav.vibrate === 'function') nav.vibrate(pattern);
    } catch { /* ignore */ }
  };
  // Core gesture refs
  const startX=useRef<number|null>(null); const startY=useRef<number|null>(null);
  // Preserve original pointer down position separately for swipe detection when startX is mutated incrementally
  const originX=useRef<number|null>(null); const originY=useRef<number|null>(null);
  const panX=useRef(0); const panY=useRef(0); const scale=useRef(1);
  const pinchStartDist=useRef<number|null>(null); const pinchStartScale=useRef(1);
  const pinchMidImgX=useRef(0); const pinchMidImgY=useRef(0);
  const velocityX=useRef(0); const velocityY=useRef(0); const inertiaFrame=useRef<number|null>(null);
  const moveHistory=useRef<{x:number;y:number;t:number}[]>([]); const lastTap=useRef<{t:number;x:number;y:number}|null>(null);
  const dialogRef=useRef<HTMLDivElement|null>(null); const prevFocused=useRef<HTMLElement|null>(null);
  const currentImgRef=useRef<HTMLImageElement|null>(null); const viewerRef=useRef<HTMLDivElement|null>(null);
  const rafPending=useRef(false); const allowOverflow=useRef(false); const snappingFrame=useRef<number|null>(null);
  // Pinch inertia & background fade refs
  const pinchPrevScale=useRef(1); const pinchPrevTime=useRef(0); const pinchVelocity=useRef(0); const pinchMidClientX=useRef(0); const pinchMidClientY=useRef(0); const pinchStartMidX=useRef(0);
  const overlayRef=useRef<HTMLDivElement|null>(null);
  // Horizontal slider refs (for base scale swiping)
  const sliderRef=useRef<HTMLDivElement|null>(null);
  const swipeDragX=useRef(0); // live horizontal drag value when scale ~1
  const sliding=useRef(false);
  const springFrame=useRef<number|null>(null);
  const activeWrapperRef=useRef<HTMLDivElement|null>(null);
  // Edge hint opacity refs (updated via CSS vars to avoid React re-render on every frame)
  const edgeVarsApplied=useRef(false);
  // Helpers (memoized)
  const needsClamp = useCallback(()=> scale.current>1.0001,[]);
  const getMetrics = useCallback(()=>{ if(!currentImgRef.current||!viewerRef.current) return null; const img=currentImgRef.current; const vw=viewerRef.current.clientWidth; const vh=viewerRef.current.clientHeight; const w=img.naturalWidth||vw; const h=img.naturalHeight||vh; const r=w/h; let baseW=vw; let baseH=baseW/r; if(baseH>vh){ baseH=vh; baseW=baseH*r;} const scaledW=baseW*scale.current; const scaledH=baseH*scale.current; return { maxPanX:Math.max(0,(scaledW-baseW)/2), maxPanY:Math.max(0,(scaledH-baseH)/2) }; },[]);
  const clampPan = useCallback(()=>{ if(!needsClamp()||allowOverflow.current) return; const m=getMetrics(); if(!m) return; panX.current=Math.min(m.maxPanX,Math.max(-m.maxPanX,panX.current)); panY.current=Math.min(m.maxPanY,Math.max(-m.maxPanY,panY.current)); },[needsClamp,getMetrics]);
  const updateEdgeHints = useCallback((m: {maxPanX:number;maxPanY:number}|null)=>{
    if(!viewerRef.current) return;
    if(!m || !needsClamp()){
      if(!edgeVarsApplied.current) return;
      viewerRef.current.style.setProperty('--edge-left','0');
      viewerRef.current.style.setProperty('--edge-right','0');
      viewerRef.current.style.setProperty('--edge-top','0');
      viewerRef.current.style.setProperty('--edge-bottom','0');
      return;
    }
    const overflowX = Math.max(0, Math.abs(panX.current) - m.maxPanX);
    const overflowY = Math.max(0, Math.abs(panY.current) - m.maxPanY);
    const rx = Math.min(1, overflowX / CONFIG.EDGE_HINT_MAX_PX);
    const ry = Math.min(1, overflowY / CONFIG.EDGE_HINT_MAX_PX);
    viewerRef.current.style.setProperty('--edge-left', panX.current>0 ? String(rx) : '0');
    viewerRef.current.style.setProperty('--edge-right', panX.current<0 ? String(rx) : '0');
    viewerRef.current.style.setProperty('--edge-top', panY.current>0 ? String(ry) : '0');
    viewerRef.current.style.setProperty('--edge-bottom', panY.current<0 ? String(ry) : '0');
    edgeVarsApplied.current = rx>0 || ry>0;
  },[needsClamp,CONFIG.EDGE_HINT_MAX_PX]);
  const updateSlider=useCallback(()=>{ if(!sliderRef.current) return; const w=viewerRef.current?.clientWidth||window.innerWidth; const baseOffset= -index * w; const drag = (scale.current<=1.02)? swipeDragX.current : 0; sliderRef.current.style.transform=`translate3d(${baseOffset+drag}px,0,0)`; },[index]);
  const applyTransform=useCallback(()=>{ if(rafPending.current) return; rafPending.current=true; requestAnimationFrame(()=>{ rafPending.current=false; const metrics=getMetrics(); if(scale.current>1.02){ clampPan(); if(currentImgRef.current) currentImgRef.current.style.transform=`translate3d(${panX.current}px,${panY.current}px,0) scale(${scale.current})`; } else { // reset single image transform at base scale
        if(currentImgRef.current) currentImgRef.current.style.transform='translate3d(0,0,0) scale(1)';
      }
      updateSlider();
      updateEdgeHints(metrics);
    }); },[getMetrics,clampPan,updateEdgeHints,updateSlider]);
  const stopInertia=()=>{ if(inertiaFrame.current){ cancelAnimationFrame(inertiaFrame.current); inertiaFrame.current=null; } };
  const animateSnap=useCallback(()=>{ if(!needsClamp()||allowOverflow.current) return; if(snappingFrame.current) return; const m=getMetrics(); if(!m) return; const targetX=Math.min(m.maxPanX,Math.max(-m.maxPanX,panX.current)); const targetY=Math.min(m.maxPanY,Math.max(-m.maxPanY,panY.current)); if(Math.abs(targetX-panX.current)<0.5 && Math.abs(targetY-panY.current)<0.5){ updateEdgeHints(m); return; } const sx=panX.current; const sy=panY.current; const start=performance.now(); const duration=CONFIG.SNAP_DURATION; const ease=(t:number)=>1-Math.pow(1-t,3); const step=()=>{ const p=Math.min(1,(performance.now()-start)/duration); panX.current=sx+(targetX-sx)*ease(p); panY.current=sy+(targetY-sy)*ease(p); if(currentImgRef.current) currentImgRef.current.style.transform=`translate3d(${panX.current}px,${panY.current}px,0) scale(${scale.current})`; updateEdgeHints(m); if(p<1) snappingFrame.current=requestAnimationFrame(step); else snappingFrame.current=null; }; snappingFrame.current=requestAnimationFrame(step); },[needsClamp,getMetrics,updateEdgeHints,CONFIG.SNAP_DURATION]);
  // Show / hide
  const total=photos.length;
  const show=useCallback((i:number)=>{ const t=total; const normalized=((i%t)+t)%t; setFadeFrom(null); setIndex(normalized); scale.current=1; panX.current=0; panY.current=0; swipeDragX.current=0; requestAnimationFrame(()=>{ updateSlider(); }); setOpen(true); },[total,updateSlider]);
  // Navigate while zoomed: keep transform and cross-fade
  const zoomedNavigate=useCallback((delta:number)=>{ if(!(scale.current>1.05)) return; const t=total; const targetRaw=index+delta; const target=((targetRaw%t)+t)%t; if(target===index) return; setFadeFrom(index); setIndex(target); // keep scale and pans
    // remove fadeFrom after animation
    setTimeout(()=>{ setFadeFrom(f=> f===index? null:f); },320);
  },[index,total]);
  const hide=useCallback(()=>{ setOpen(false); try{ localStorage.setItem('houseGalleryLastIndex',String(index)); }catch{} },[index]);
  const next=useCallback(()=>{ if(scale.current>1.05) zoomedNavigate(1); else show(index+1); },[index,show,zoomedNavigate]);
  const prevRef=useRef<(()=>void)|null>(null); prevRef.current=()=>{ if(scale.current>1.05) zoomedNavigate(-1); else show(index-1); };
  // External trigger
  // On mount, restore last index
  useEffect(()=>{ if(typeof window!=='undefined'){ try{ const v=localStorage.getItem('houseGalleryLastIndex'); if(v!=null){ const n=parseInt(v,10); if(!Number.isNaN(n)) { lastPersistedIndex.current=n; setIndex(n); } } }catch{} } },[]);
  useEffect(()=>{ const handler=(e:Event)=>{ const detail=(e as CustomEvent).detail; if(detail==null || Number.isNaN(detail)) show(lastPersistedIndex.current); else show(detail); }; window.addEventListener('open-house-lightbox',handler as EventListener); return ()=> window.removeEventListener('open-house-lightbox',handler as EventListener);},[show]);
  // Keyboard nav
  useEffect(()=>{ if(!open) return; const onKey=(e:KeyboardEvent)=>{ if(e.key==='Escape') hide(); else if(e.key==='ArrowRight') next(); else if(e.key==='ArrowLeft') prevRef.current?.(); }; window.addEventListener('keydown',onKey); return ()=> window.removeEventListener('keydown',onKey); },[open,hide,next]);
  // Focus trap
  useEffect(()=>{ if(open){ prevFocused.current=document.activeElement as HTMLElement; dialogRef.current?.focus(); } else if(prevFocused.current){ prevFocused.current.focus(); } },[open]);
  // Touch start
  const onTouchStart=(e:React.TouchEvent)=>{ stopInertia(); moveHistory.current=[]; allowOverflow.current=true; if(e.touches.length===1){ const t=e.touches[0]; startX.current=t.clientX; startY.current=t.clientY; originX.current=t.clientX; originY.current=t.clientY; moveHistory.current.push({x:t.clientX,y:t.clientY,t:performance.now()}); } else if(e.touches.length===2){ const [a,b]=[e.touches[0],e.touches[1]]; const midX=(a.clientX+b.clientX)/2; const midY=(a.clientY+b.clientY)/2; pinchStartDist.current=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY); pinchStartScale.current=scale.current; pinchMidImgX.current=(midX - panX.current)/scale.current; pinchMidImgY.current=(midY - panY.current)/scale.current; pinchPrevScale.current=scale.current; pinchPrevTime.current=performance.now(); pinchVelocity.current=0; pinchMidClientX.current=midX; pinchMidClientY.current=midY; pinchStartMidX.current=midX; } };
  // Touch move
  const onTouchMove=(e:React.TouchEvent)=>{ const now=performance.now(); if(e.touches.length===2 && pinchStartDist.current){ const [a,b]=[e.touches[0],e.touches[1]]; const midX=(a.clientX+b.clientX)/2; const midY=(a.clientY+b.clientY)/2; const dist=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY); const newScale=Math.min(CONFIG.MAX_SCALE,Math.max(1,pinchStartScale.current*(dist/(pinchStartDist.current||dist)))); scale.current=newScale; panX.current=midX - pinchMidImgX.current * scale.current; panY.current=midY - pinchMidImgY.current * scale.current; const dt=now-pinchPrevTime.current; if(dt>0){ pinchVelocity.current=(scale.current-pinchPrevScale.current)/dt; pinchPrevScale.current=scale.current; pinchPrevTime.current=now; } pinchMidClientX.current=midX; pinchMidClientY.current=midY; applyTransform(); e.preventDefault(); return; } if(e.touches.length===1 && startX.current!=null && startY.current!=null){ const t=e.touches[0]; const dx=t.clientX-startX.current; const dy=t.clientY-startY.current; if(scale.current <=1.05){ // vertical drag & horizontal live slide
      panY.current=dy;
      let proposed=dx;
      const atFirst=index===0; const atLast=index===total-1;
      const w=viewerRef.current?.clientWidth||window.innerWidth;
      // rubber band + overscroll preview scale
      if((atFirst && proposed>0) || (atLast && proposed<0)){
        const overscroll=Math.abs(proposed);
        const ratio=Math.min(1, overscroll / (w*0.6));
        proposed*=CONFIG.RUBBER_BAND; // position resistance
        // scale active wrapper slightly down
        if(activeWrapperRef.current){ const s=1 - 0.08*ratio; activeWrapperRef.current.style.transform=`scale(${s})`; activeWrapperRef.current.style.transition='none'; }
        // side gradient peek
        if(viewerRef.current){ const side=(atFirst && proposed>0)?'left':'right'; viewerRef.current.style.setProperty('--overscroll-'+side, String(ratio)); }
      } else {
        if(activeWrapperRef.current){ activeWrapperRef.current.style.transform='scale(1)'; }
        if(viewerRef.current){ viewerRef.current.style.setProperty('--overscroll-left','0'); viewerRef.current.style.setProperty('--overscroll-right','0'); }
      }
      swipeDragX.current=proposed;
      if(overlayRef.current){ const prog=Math.min(1, Math.abs(panY.current)/CONFIG.CLOSE_VERTICAL_THRESHOLD); const alpha=0.9*(1 - prog*0.6); overlayRef.current.style.backgroundColor=`rgba(0,0,0,${alpha.toFixed(3)})`; }
      updateSlider();
    } else { const m=getMetrics(); let nextX=panX.current+dx; let nextY=panY.current+dy; if(m){ if(Math.abs(nextX)>m.maxPanX){ const over=nextX-(nextX>0?m.maxPanX:-m.maxPanX); nextX=(nextX>0?m.maxPanX:-m.maxPanX)+over*CONFIG.RUBBER_BAND; } if(Math.abs(nextY)>m.maxPanY){ const over=nextY-(nextY>0?m.maxPanY:-m.maxPanY); nextY=(nextY>0?m.maxPanY:-m.maxPanY)+over*CONFIG.RUBBER_BAND; } } panX.current=nextX; panY.current=nextY; startX.current=t.clientX; startY.current=t.clientY; applyTransform(); }
    moveHistory.current.push({x:t.clientX,y:t.clientY,t:now}); if(moveHistory.current.length>6) moveHistory.current.shift(); if(scale.current>1.05) applyTransform(); } };
  // Touch end
  const onTouchEnd=(e:React.TouchEvent)=>{
    const now=performance.now();
    allowOverflow.current=false;
    let pinchInertiaStarted=false;
    // Pinch end -> possible inertia zoom
    if(pinchStartDist.current && e.touches.length<2){
      pinchStartDist.current=null;
      if(Math.abs(pinchVelocity.current)>CONFIG.PINCH_VELOCITY_THRESHOLD){
        const target=Math.min(CONFIG.MAX_SCALE, Math.max(1, scale.current + pinchVelocity.current*CONFIG.PINCH_INERTIA_FACTOR));
        const startScale=scale.current;
        const imgX=pinchMidImgX.current; const imgY=pinchMidImgY.current;
        const midClientX=pinchMidClientX.current; const midClientY=pinchMidClientY.current;
        const start=performance.now(); const dur=220; const ease=(t:number)=>1-Math.pow(1-t,3);
        const step=()=>{ const p=Math.min(1,(performance.now()-start)/dur); scale.current=startScale+(target-startScale)*ease(p); panX.current=midClientX - imgX*scale.current; panY.current=midClientY - imgY*scale.current; applyTransform(); if(p<1) requestAnimationFrame(step); else { if(scale.current<=1.02){ scale.current=1; panX.current=0; panY.current=0; applyTransform(); } animateSnap(); } };
        requestAnimationFrame(step);
        pinchInertiaStarted=true;
      }
      // Pinch-to-swipe handoff: if scale nearly base and horizontal movement of pinch midpoint large
      if(!pinchInertiaStarted && scale.current<=1.05){ const dx=pinchMidClientX.current - pinchStartMidX.current; if(Math.abs(dx) > CONFIG.SWIPE_THRESHOLD/1.2 && Math.abs(panY.current)<80){ if(dx<0) next(); else prevRef.current?.(); return; } }
    }
    // Double tap detection (only if not pinch inertia)
    if(!pinchInertiaStarted && e.changedTouches.length===1 && !pinchStartDist.current){
      const touch=e.changedTouches[0];
      const last=lastTap.current;
      if(last && (now-last.t)<300 && Math.hypot(last.x-touch.clientX,last.y-touch.clientY)<30){
        const currentIndex=CONFIG.DOUBLE_TAP_STEPS.findIndex(s=>Math.abs(s-scale.current)<0.15);
        const nextScale=CONFIG.DOUBLE_TAP_STEPS[(currentIndex+1)%CONFIG.DOUBLE_TAP_STEPS.length];
        const imgX=(touch.clientX - panX.current)/scale.current; const imgY=(touch.clientY - panY.current)/scale.current;
        scale.current=nextScale; panX.current=touch.clientX - imgX * scale.current; panY.current=touch.clientY - imgY * scale.current;
        applyTransform(); lastTap.current=null;
      } else {
        lastTap.current={t:now,x:touch.clientX,y:touch.clientY};
      }
    }
    // Gesture end behavior (skip if pinch inertia running)
    if(!pinchInertiaStarted){
  if(originX.current!=null && originY.current!=null && scale.current<=1.05){
  const dxTotal=swipeDragX.current; // already rubber-banded
        const verticalClose = Math.abs(panY.current)>CONFIG.CLOSE_VERTICAL_THRESHOLD;
        // compute flick velocity (pixels per ms) using last ~100ms samples
        let vx=0; const recent=moveHistory.current.slice(-4); if(recent.length>=2){ const first=recent[0]; const last=recent[recent.length-1]; const dt=(last.t-first.t)||1; vx=(last.x-first.x)/dt; }
        if(verticalClose){ hide(); }
        else {
          const advanceBy = (Math.abs(dxTotal)>CONFIG.SWIPE_THRESHOLD ? (dxTotal<0?1:-1) : (Math.abs(vx)>CONFIG.SLIDE_VELOCITY_THRESHOLD ? (vx<0?1:-1):0));
          const target=index+advanceBy;
          const w=viewerRef.current?.clientWidth||window.innerWidth;
          const startOffset=-index*w + swipeDragX.current;
          const endOffset=- (advanceBy!==0 && target>=0 && target<total ? target : index) * w;
          // spring animation
          const animateSpring=(finalIndex:number)=>{ if(sliding.current) return; sliding.current=true; if(reduceMotion){ if(sliderRef.current) sliderRef.current.style.transform=`translate3d(${endOffset}px,0,0)`; sliding.current=false; swipeDragX.current=0; if(finalIndex!==index) { show(finalIndex); triggerHaptic(12);} else updateSlider(); return; } const k=activeSpring.k; const d=activeSpring.d; let pos=startOffset; let vel=0; const step=()=>{ const disp=endOffset-pos; const force=disp*k; vel=(vel+force)*d; pos+=vel; if(sliderRef.current) sliderRef.current.style.transform=`translate3d(${pos}px,0,0)`; if(Math.abs(disp)<0.6 && Math.abs(vel)<0.6){ if(sliderRef.current) sliderRef.current.style.transform=`translate3d(${endOffset}px,0,0)`; sliding.current=false; swipeDragX.current=0; if(finalIndex!==index){ show(finalIndex); triggerHaptic(12);} else updateSlider(); return; } springFrame.current=requestAnimationFrame(step); }; springFrame.current=requestAnimationFrame(step); };
          const finalIndex = (advanceBy!==0 && target>=0 && target<total)? target : index;
          animateSpring(finalIndex);
        }
        panY.current=0; swipeDragX.current=0; if(!sliding.current) applyTransform();
        // reset overscroll visuals
        if(activeWrapperRef.current){ activeWrapperRef.current.style.transform='scale(1)'; activeWrapperRef.current.style.transition='transform 120ms ease'; }
        if(viewerRef.current){ viewerRef.current.style.setProperty('--overscroll-left','0'); viewerRef.current.style.setProperty('--overscroll-right','0'); }
      } else if(scale.current>1.05){
        const recent=moveHistory.current.filter(p=>now-p.t<120);
        if(recent.length>=2){
          const first=recent[0]; const last=recent[recent.length-1]; const dt=(last.t-first.t)||1;
          velocityX.current=(last.x-first.x)/dt*16; velocityY.current=(last.y-first.y)/dt*16;
          const step=()=>{ panX.current+=velocityX.current; panY.current+=velocityY.current; velocityX.current*=CONFIG.INERTIA_DECAY; velocityY.current*=CONFIG.INERTIA_DECAY; applyTransform(); if(Math.abs(velocityX.current)<0.3 && Math.abs(velocityY.current)<0.3){ inertiaFrame.current=null; animateSnap(); return; } inertiaFrame.current=requestAnimationFrame(step); };
          inertiaFrame.current=requestAnimationFrame(step);
        } else { animateSnap(); }
      }
      startX.current=null; startY.current=null; originX.current=null; originY.current=null;
      // Reset background opacity
      if(overlayRef.current) overlayRef.current.style.backgroundColor='rgba(0,0,0,0.9)';
      animateSnap();
    }
  };
  // Mouse (desktop) drag support
  useEffect(()=>{
    if(!open) return;
    const el=viewerRef.current; if(!el) return;
    const onMouseDown=(e:MouseEvent)=>{
      if(e.button!==0) return;
      stopInertia(); moveHistory.current=[]; allowOverflow.current=true;
      startX.current=e.clientX; startY.current=e.clientY; originX.current=e.clientX; originY.current=e.clientY;
      const move=(ev:MouseEvent)=>{
        const now=performance.now(); if(pinchStartDist.current) return; if(startX.current==null||startY.current==null) return;
        const dx=ev.clientX-startX.current; const dy=ev.clientY-startY.current;
        if(scale.current<=1.05){ panY.current=dy; panX.current=dx*0.25; }
        else { const m=getMetrics(); let nextX=panX.current+dx; let nextY=panY.current+dy; if(m){ if(Math.abs(nextX)>m.maxPanX){ const over=nextX-(nextX>0?m.maxPanX:-m.maxPanX); nextX=(nextX>0?m.maxPanX:-m.maxPanX)+over*CONFIG.RUBBER_BAND; } if(Math.abs(nextY)>m.maxPanY){ const over=nextY-(nextY>0?m.maxPanY:-m.maxPanY); nextY=(nextY>0?m.maxPanY:-m.maxPanY)+over*CONFIG.RUBBER_BAND; } } panX.current=nextX; panY.current=nextY; startX.current=ev.clientX; startY.current=ev.clientY; }
        moveHistory.current.push({x:ev.clientX,y:ev.clientY,t:now}); if(moveHistory.current.length>6) moveHistory.current.shift(); applyTransform(); };
      const up=(ev:MouseEvent)=>{
        window.removeEventListener('mousemove',move); window.removeEventListener('mouseup',up);
        const now=performance.now(); allowOverflow.current=false;
        if(originX.current!=null && originY.current!=null && scale.current<=1.05){
          const dxTotal=ev.clientX-originX.current;
          if(Math.abs(dxTotal)>CONFIG.SWIPE_THRESHOLD && Math.abs(panY.current)<80){ if(dxTotal<0) next(); else prevRef.current?.(); }
          else if(Math.abs(panY.current)>CONFIG.CLOSE_VERTICAL_THRESHOLD){ hide(); }
          panX.current=0; panY.current=0; applyTransform();
        } else if(scale.current>1.05){
          const recent=moveHistory.current.filter(p=>now-p.t<120);
          if(recent.length>=2){ const first=recent[0]; const last=recent[recent.length-1]; const dt=(last.t-first.t)||1; velocityX.current=(last.x-first.x)/dt*16; velocityY.current=(last.y-first.y)/dt*16; const step=()=>{ panX.current+=velocityX.current; panY.current+=velocityY.current; velocityX.current*=CONFIG.INERTIA_DECAY; velocityY.current*=CONFIG.INERTIA_DECAY; applyTransform(); if(Math.abs(velocityX.current)<0.3 && Math.abs(velocityY.current)<0.3){ inertiaFrame.current=null; animateSnap(); return; } inertiaFrame.current=requestAnimationFrame(step); }; inertiaFrame.current=requestAnimationFrame(step); }
          else { animateSnap(); }
        }
        startX.current=null; startY.current=null; originX.current=null; originY.current=null; animateSnap();
      };
      window.addEventListener('mousemove',move); window.addEventListener('mouseup',up);
    };
    el.addEventListener('mousedown',onMouseDown);
    return ()=>{ el.removeEventListener('mousedown',onMouseDown); };
  },[open,next,hide,applyTransform,getMetrics,CONFIG.RUBBER_BAND,CONFIG.SWIPE_THRESHOLD,CONFIG.CLOSE_VERTICAL_THRESHOLD,CONFIG.INERTIA_DECAY,animateSnap]);
  // Inert background & scroll lock
  useEffect(()=>{ const root=document.getElementById('__next')||document.body; const prevOverflow=document.body.style.overflow; if(open){ document.body.style.overflow='hidden'; if(!('inert' in HTMLElement.prototype)) (root as HTMLElement).setAttribute('data-inert-polyfill',''); root.querySelectorAll(':scope > *').forEach(el=>{ if(el===dialogRef.current?.parentElement) return; (el as HTMLElement).setAttribute('inert',''); (el as HTMLElement).setAttribute('aria-hidden','true'); }); } else { root.querySelectorAll('[inert]').forEach(el=>{ el.removeAttribute('inert'); if(el.getAttribute('data-inert-polyfill')==null) el.removeAttribute('aria-hidden'); }); document.body.style.overflow=prevOverflow; } return ()=>{ root.querySelectorAll('[inert]').forEach(el=>{ el.removeAttribute('inert'); el.removeAttribute('aria-hidden'); }); document.body.style.overflow=prevOverflow; }; },[open]);
  // Wheel / trackpad zoom
  useEffect(()=>{ if(!open) return; const el=viewerRef.current; if(!el) return; const onWheel=(e:WheelEvent)=>{ if(!open) return; if(!e.ctrlKey && !e.metaKey && Math.abs(e.deltaY)<40) return; e.preventDefault(); stopInertia(); allowOverflow.current=true; const rect=el.getBoundingClientRect(); const cx=e.clientX-rect.left; const cy=e.clientY-rect.top; const imgX=(cx - panX.current)/scale.current; const imgY=(cy - panY.current)/scale.current; const factor=1 - e.deltaY * CONFIG.WHEEL_STEP; const nextScale=Math.min(CONFIG.MAX_SCALE, Math.max(1, scale.current * factor)); if(nextScale===scale.current) return; scale.current=nextScale; panX.current=cx - imgX * scale.current; panY.current=cy - imgY * scale.current; if(scale.current <=1.02){ scale.current=1; panX.current=0; panY.current=0; swipeDragX.current=0; updateSlider(); } applyTransform(); allowOverflow.current=false; animateSnap(); }; el.addEventListener('wheel',onWheel,{passive:false}); return ()=> el.removeEventListener('wheel',onWheel); },[open,applyTransform,animateSnap,CONFIG.MAX_SCALE,CONFIG.WHEEL_STEP,updateSlider]);
  // Desktop mouse drag updated for slider behavior at base scale
  useEffect(()=>{
    if(!open) return; const el=viewerRef.current; if(!el) return;
  const onMouseDown=(e:MouseEvent)=>{ if(e.button!==0) return; stopInertia(); moveHistory.current=[]; allowOverflow.current=true; startX.current=e.clientX; startY.current=e.clientY; originX.current=e.clientX; originY.current=e.clientY; const move=(ev:MouseEvent)=>{ const now=performance.now(); if(startX.current==null||startY.current==null) return; const dx=ev.clientX-startX.current; const dy=ev.clientY-startY.current; if(scale.current<=1.05){ panY.current=dy; let proposed=dx; const atFirst=index===0; const atLast=index===total-1; const w=viewerRef.current?.clientWidth||window.innerWidth; if((atFirst && proposed>0) || (atLast && proposed<0)){ const overscroll=Math.abs(proposed); const ratio=Math.min(1, overscroll/(w*0.6)); proposed*=CONFIG.RUBBER_BAND; if(activeWrapperRef.current){ const s=1-0.08*ratio; activeWrapperRef.current.style.transform=`scale(${s})`; activeWrapperRef.current.style.transition='none'; } if(viewerRef.current){ const side=(atFirst && proposed>0)?'left':'right'; viewerRef.current.style.setProperty('--overscroll-'+side,String(ratio)); } } else { if(activeWrapperRef.current){ activeWrapperRef.current.style.transform='scale(1)'; } if(viewerRef.current){ viewerRef.current.style.setProperty('--overscroll-left','0'); viewerRef.current.style.setProperty('--overscroll-right','0'); } } swipeDragX.current=proposed; if(overlayRef.current){ const prog=Math.min(1, Math.abs(panY.current)/CONFIG.CLOSE_VERTICAL_THRESHOLD); const alpha=0.9*(1 - prog*0.6); overlayRef.current.style.backgroundColor=`rgba(0,0,0,${alpha.toFixed(3)})`; } updateSlider(); } else { const m=getMetrics(); let nextX=panX.current+dx; let nextY=panY.current+dy; if(m){ if(Math.abs(nextX)>m.maxPanX){ const over=nextX-(nextX>0?m.maxPanX:-m.maxPanX); nextX=(nextX>0?m.maxPanX:-m.maxPanX)+over*CONFIG.RUBBER_BAND; } if(Math.abs(nextY)>m.maxPanY){ const over=nextY-(nextY>0?m.maxPanY:-m.maxPanY); nextY=(nextY>0?m.maxPanY:-m.maxPanY)+over*CONFIG.RUBBER_BAND; } } panX.current=nextX; panY.current=nextY; startX.current=ev.clientX; startY.current=ev.clientY; applyTransform(); } moveHistory.current.push({x:ev.clientX,y:ev.clientY,t:now}); if(moveHistory.current.length>6) moveHistory.current.shift(); };
    const up=()=>{ window.removeEventListener('mousemove',move); window.removeEventListener('mouseup',up); allowOverflow.current=false; if(scale.current<=1.05 && originX.current!=null){ const dxTotal=swipeDragX.current; const verticalClose=Math.abs(panY.current)>CONFIG.CLOSE_VERTICAL_THRESHOLD; let vx=0; const recent=moveHistory.current.slice(-4); if(recent.length>=2){ const first=recent[0]; const last=recent[recent.length-1]; const dt=(last.t-first.t)||1; vx=(last.x-first.x)/dt; }
          if(verticalClose){ hide(); }
      else { const advanceBy=(Math.abs(dxTotal)>CONFIG.SWIPE_THRESHOLD ? (dxTotal<0?1:-1) : (Math.abs(vx)>CONFIG.SLIDE_VELOCITY_THRESHOLD ? (vx<0?1:-1):0)); const target=index+advanceBy; const w=viewerRef.current?.clientWidth||window.innerWidth; const startOffset=-index*w + swipeDragX.current; const endOffset=-(advanceBy!==0 && target>=0 && target<total? target:index)*w; const animateSpring=(finalIndex:number)=>{ if(sliding.current) return; sliding.current=true; if(reduceMotion){ if(sliderRef.current) sliderRef.current.style.transform=`translate3d(${endOffset}px,0,0)`; sliding.current=false; swipeDragX.current=0; if(finalIndex!==index) show(finalIndex); else updateSlider(); return; } const k=activeSpring.k; const d=activeSpring.d; let pos=startOffset; let vel=0; const step=()=>{ const disp=endOffset-pos; const force=disp*k; vel=(vel+force)*d; pos+=vel; if(sliderRef.current) sliderRef.current.style.transform=`translate3d(${pos}px,0,0)`; if(Math.abs(disp)<0.6 && Math.abs(vel)<0.6){ if(sliderRef.current) sliderRef.current.style.transform=`translate3d(${endOffset}px,0,0)`; sliding.current=false; swipeDragX.current=0; if(finalIndex!==index) show(finalIndex); else updateSlider(); return; } springFrame.current=requestAnimationFrame(step); }; springFrame.current=requestAnimationFrame(step); };
            const finalIndex=(advanceBy!==0 && target>=0 && target<total)? target:index; animateSpring(finalIndex); }
          panY.current=0; swipeDragX.current=0; if(!sliding.current) applyTransform(); }
        else if(scale.current>1.05){ animateSnap(); }
        startX.current=null; startY.current=null; originX.current=null; originY.current=null; if(overlayRef.current) overlayRef.current.style.backgroundColor='rgba(0,0,0,0.9)'; };
      window.addEventListener('mousemove',move); window.addEventListener('mouseup',up); };
    el.addEventListener('mousedown',onMouseDown);
    return ()=>{ el.removeEventListener('mousedown',onMouseDown); };
  },[open,index,total,applyTransform,hide,animateSnap,getMetrics,updateSlider,show,reduceMotion,activeSpring.k,activeSpring.d,CONFIG.RUBBER_BAND,CONFIG.CLOSE_VERTICAL_THRESHOLD,CONFIG.SWIPE_THRESHOLD,CONFIG.SLIDE_VELOCITY_THRESHOLD]);
  // Delegate click from server grid
  useEffect(()=>{ const container=document.querySelector('[aria-label="House photos"]'); if(!container) return; const handler=(e:Event)=>{ const btn=(e.target as HTMLElement).closest('[data-open-photo]'); if(btn){ const idx=Number(btn.getAttribute('data-open-photo'))||0; show(idx);} }; container.addEventListener('click',handler); return ()=> container.removeEventListener('click',handler); },[show]);
  return (<>{open && (<div role="dialog" aria-modal="true" aria-label="Photo viewer" tabIndex={-1} ref={el=>{ dialogRef.current=el; overlayRef.current=el; if(el) el.style.backgroundColor='rgba(0,0,0,0.9)'; }} className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm touch-none" onKeyDown={(e)=>{ if(e.key==='Tab'){ e.preventDefault(); dialogRef.current?.focus(); }}} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
  <div className="flex items-center justify-between p-3 text-white text-sm"><div>{index+1}/{total}</div><div className="flex gap-2"><button className="btn-tint btn-sm" onClick={()=>{ if(scale.current>1.05){ zoomedNavigate(-1); triggerHaptic(6); return; } if(scale.current<=1.05 && index>0){ const w=viewerRef.current?.clientWidth||window.innerWidth; const startOffset=-index*w + swipeDragX.current; const endOffset=-(index-1)*w; if(sliding.current) return; sliding.current=true; if(reduceMotion){ if(sliderRef.current) sliderRef.current.style.transform=`translate3d(${endOffset}px,0,0)`; sliding.current=false; swipeDragX.current=0; show(index-1); triggerHaptic(10); return; } const k=activeSpring.k; const d=activeSpring.d; let pos=startOffset; let vel=0; const step=()=>{ const disp=endOffset-pos; const force=disp*k; vel=(vel+force)*d; pos+=vel; if(sliderRef.current) sliderRef.current.style.transform=`translate3d(${pos}px,0,0)`; if(Math.abs(disp)<0.6 && Math.abs(vel)<0.6){ if(sliderRef.current) sliderRef.current.style.transform=`translate3d(${endOffset}px,0,0)`; sliding.current=false; swipeDragX.current=0; show(index-1); triggerHaptic(10); return;} requestAnimationFrame(step); }; requestAnimationFrame(step); } else prevRef.current?.(); }} aria-label="Previous image">◀</button><button className="btn-tint btn-sm" onClick={()=>{ if(scale.current>1.05){ zoomedNavigate(1); triggerHaptic(6); return; } if(scale.current<=1.05 && index<total-1){ const w=viewerRef.current?.clientWidth||window.innerWidth; const startOffset=-index*w + swipeDragX.current; const endOffset=-(index+1)*w; if(sliding.current) return; sliding.current=true; if(reduceMotion){ if(sliderRef.current) sliderRef.current.style.transform=`translate3d(${endOffset}px,0,0)`; sliding.current=false; swipeDragX.current=0; show(index+1); triggerHaptic(10); return; } const k=activeSpring.k; const d=activeSpring.d; let pos=startOffset; let vel=0; const step=()=>{ const disp=endOffset-pos; const force=disp*k; vel=(vel+force)*d; pos+=vel; if(sliderRef.current) sliderRef.current.style.transform=`translate3d(${pos}px,0,0)`; if(Math.abs(disp)<0.6 && Math.abs(vel)<0.6){ if(sliderRef.current) sliderRef.current.style.transform=`translate3d(${endOffset}px,0,0)`; sliding.current=false; swipeDragX.current=0; show(index+1); triggerHaptic(10); return;} requestAnimationFrame(step); }; requestAnimationFrame(step); } else next(); }} aria-label="Next image">▶</button><button className="btn-outline btn-sm" onClick={()=>{ hide(); triggerHaptic(4); }} aria-label="Close viewer">✕</button></div></div>
  <div ref={viewerRef} className="relative flex-1 flex items-start justify-start overflow-hidden select-none" style={{ '--edge-left':'0','--edge-right':'0','--edge-top':'0','--edge-bottom':'0' } as React.CSSProperties}>
      <div ref={sliderRef} className="flex h-full w-full will-change-transform" style={{transition:'none'}}>
        {photos.map((p,i)=>{ const alt=(alts && alts[p.altKey])||p.altKey; const active=i===index; const fadingOut=fadeFrom===i && fadeFrom!==index; return (
          <div key={p.src} className="w-full h-full flex-shrink-0 flex justify-center items-start transition-transform duration-150" ref={el=>{ if(active) activeWrapperRef.current=el; }}>
            <Image src={p.src} alt={alt} width={p.width} height={p.height} placeholder="blur" blurDataURL={p.blurDataURL} sizes="100vw" className={`object-contain max-w-full max-h-full select-none ${active? '':'pointer-events-none'} ${(scale.current>1.05 && active)? 'opacity-0':''} ${(scale.current>1.05 && fadingOut)? 'opacity-0':''}`} ref={el=>{ if(active){ currentImgRef.current=el; applyTransform(); } }} priority={active} />
          </div>
        ); })}
        {fadeFrom!==null && scale.current>1.05 && photos[fadeFrom] && (
          <div className="absolute inset-0 flex justify-center items-start pointer-events-none">
            <Image src={photos[index].src} alt="" width={photos[index].width} height={photos[index].height} placeholder="blur" blurDataURL={photos[index].blurDataURL} sizes="100vw" className="object-contain max-w-full max-h-full select-none opacity-100 transition-opacity duration-300" />
            <Image src={photos[fadeFrom].src} alt="" width={photos[fadeFrom].width} height={photos[fadeFrom].height} placeholder="blur" blurDataURL={photos[fadeFrom].blurDataURL} sizes="100vw" className="object-contain max-w-full max-h-full select-none absolute opacity-0 transition-opacity duration-300" />
          </div>
        )}
      </div>
      {/* Edge hint overlays */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-white/25 to-transparent opacity-0" style={{opacity:'var(--edge-top)'}} />
        <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-white/25 to-transparent opacity-0" style={{opacity:'var(--edge-bottom)'}} />
        <div className="absolute top-0 bottom-0 left-0 w-16 bg-gradient-to-r from-white/20 to-transparent opacity-0" style={{opacity:'var(--edge-left)'}} />
        <div className="absolute top-0 bottom-0 right-0 w-16 bg-gradient-to-l from-white/20 to-transparent opacity-0" style={{opacity:'var(--edge-right)'}} />
        {/* Overscroll side peek gradients */}
        <div className="absolute top-0 bottom-0 left-0 w-24 pointer-events-none bg-gradient-to-r from-white/10 to-transparent" style={{opacity:'var(--overscroll-left,0)'}} />
        <div className="absolute top-0 bottom-0 right-0 w-24 pointer-events-none bg-gradient-to-l from-white/10 to-transparent" style={{opacity:'var(--overscroll-right,0)'}} />
      </div>
    </div>
    <div className="p-3 flex gap-1 overflow-x-auto" aria-label="Thumbnails">{photos.map((p,i)=>(<button key={p.src} onClick={()=>show(i)} className={`relative w-16 h-12 rounded overflow-hidden ring-2 ${i===index?'ring-white':'ring-transparent'} focus:outline-none focus:ring-white`} aria-label={`Show photo ${i+1}`}><Image src={p.src} alt="" width={p.width} height={p.height} className="object-cover w-full h-full" /></button>))}</div>
  </div>)}</>);
}
