import {test} from 'node:test';
import assert from 'node:assert/strict';
import {animateSky} from '../app/me/sky-animation.ts';
import {design} from '../app/styles/design-tokens.ts';

function skyEnvironment(reduced=false,hidden=false){
  const frames=new Map<number,FrameRequestCallback>();
  let nextFrame=0;
  const motion=Object.assign(new EventTarget(),{matches:reduced});
  const document=Object.assign(new EventTarget(),{hidden});
  const environment=Object.assign(new EventTarget(),{
    document,devicePixelRatio:2,
    matchMedia:()=>motion,
    requestAnimationFrame:(callback:FrameRequestCallback)=>{frames.set(++nextFrame,callback);return nextFrame;},
    cancelAnimationFrame:(id:number)=>{frames.delete(id);},
  });
  const gradient={addColorStop(){}};
  const paints:unknown[]=[];
  const context={
    clearRect(){paints.length=0;},beginPath(){},arc(){},fill(){paints.push(this.fillStyle);},setTransform(){},moveTo(){},lineTo(){},closePath(){},
    createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,fillStyle:'',
  };
  const canvas={width:0,height:0,getContext:()=>context,getBoundingClientRect:()=>({width:800,height:600})};
  return {canvas:canvas as unknown as HTMLCanvasElement,environment:environment as unknown as Window,motion,document,frames,paints,
    tick(timestamp:number){const callbacks=[...frames.values()];frames.clear();callbacks.forEach(callback=>callback(timestamp));}};
}

test('searching stars vary their brightness and include soft glow',()=>{
  const sky=skyEnvironment();
  const stop=animateSky(sky.canvas,'loading',()=>{},sky.environment);
  sky.tick(0);
  const before=sky.paints.filter(paint=>typeof paint==='string');
  assert.ok(sky.paints.some(paint=>typeof paint==='object'));
  sky.tick(1800);
  assert.notDeepEqual(sky.paints.filter(paint=>typeof paint==='string'),before);
  stop();
});

test('waiting sky animates without revealing results and cleanup stops its frames',()=>{
  const sky=skyEnvironment();let completed=0;
  const stop=animateSky(sky.canvas,'loading',()=>completed++,sky.environment);
  sky.tick(0);sky.tick(2000);
  assert.equal(completed,0);
  assert.equal(sky.frames.size,1);
  stop();
  assert.equal(sky.frames.size,0);
  sky.document.hidden=true;sky.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(completed,0);
});

test('one fall completes once after the duration and leaves no frame loop',()=>{
  const sky=skyEnvironment();let completed=0;
  const stop=animateSky(sky.canvas,'falling',()=>completed++,sky.environment);
  sky.tick(0);sky.tick(design.meteorDuration-1);
  assert.equal(completed,0);
  sky.tick(design.meteorDuration);
  assert.equal(completed,1);
  assert.equal(sky.frames.size,0);
  sky.document.hidden=true;sky.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(completed,1);
  stop();
  const reset=animateSky(sky.canvas,'idle',()=>completed++,sky.environment);
  assert.equal(sky.frames.size,0);
  assert.equal(completed,1);
  reset();
});

test('reduced motion uses a static waiting sky and reveals success immediately',()=>{
  const sky=skyEnvironment(true);let completed=0;
  const stop=animateSky(sky.canvas,'loading',()=>completed++,sky.environment);
  assert.equal(sky.frames.size,0);assert.equal(completed,0);
  stop();
  const stopFall=animateSky(sky.canvas,'falling',()=>completed++,sky.environment);
  assert.equal(completed,1);assert.equal(sky.frames.size,0);
  stopFall();
});

test('a hidden tab does not stall a completed generation',()=>{
  const sky=skyEnvironment(false,true);let completed=0;
  const stop=animateSky(sky.canvas,'falling',()=>completed++,sky.environment);
  assert.equal(completed,1);assert.equal(sky.frames.size,0);
  stop();
});
