import type {Recommendation} from './experience-state';
import {formatCivilBirth,cities} from './birth-time';
import {readPillar} from './pillar-reading';
import {experienceCopy,type ExperienceMode} from './experience-copy';
import {palette} from '../styles/design-tokens';
export const cardSize={width:1080,height:1350} as const;
export function shareText(item:Recommendation,mode:ExperienceMode){
  return `${experienceCopy[mode].shareLead}: ${item.name.name}${item.name.hanja?` (${item.name.hanja})`:''}\n#MakeTheOne`;
}
export function shareUrl(origin:string,mode:ExperienceMode){
  const url=new URL(origin);
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new Error('Invalid share origin');
  return new URL('/'+mode,url.origin).href;
}
export function xIntent(text:string,url:string){
  const intent=new URL('https://twitter.com/intent/tweet');
  intent.searchParams.set('text',text);intent.searchParams.set('url',url);return intent.href;
}
export function wrappedLines(context:{measureText:(text:string)=>{width:number}},text:string,width:number,maxLines:number){
  const lines:string[]=[];let line='';
  for(const character of Array.from(text.replace(/\s+/g,' ').trim())){
    if(context.measureText(line+character).width>width&&line){lines.push(line);line='';}
    line+=character;
  }
  if(line)lines.push(line);
  if(lines.length>maxLines){
    lines.length=maxLines;let last=lines[maxLines-1];
    while(last&&context.measureText(last+'…').width>width)last=Array.from(last).slice(0,-1).join('');
    lines[maxLines-1]=last+'…';
  }
  return lines;
}
type LayoutContext={font:string;measureText:(text:string)=>{width:number}};
type CardLine={value:string;x:number;y:number;size:number;color:string;weight:number};
function cardLayout(context:LayoutContext,item:Recommendation,mode:ExperienceMode,url:string){
  const accent=mode==='character'?'#E5C4FF':palette.accent;
  const lines:CardLine[]=[];
  const text=(value:string,x:number,y:number,size:number,color:string=palette.text,weight=400)=>lines.push({value,x,y,size,color,weight});
  const paragraph=(value:string,y:number,size:number,color:string=palette.text)=>{
    context.font=`400 ${size}px system-ui, sans-serif`;
    const wrapped=wrappedLines(context,value,920,Infinity);
    for(const [index,line] of wrapped.entries())text(line,80,y+index*(size*1.65),size,color);
    return y+wrapped.length*size*1.65;
  };
  text('MAKE THE ONE',80,72,26,accent,700);
  text(mode==='character'?'캐릭터의 이야기에서 찾은 이름':'이야기에서 찾은 이름',80,125,30,palette.muted);
  text(item.name.name,80,195,100,accent,700);
  text(item.name.hanja??'순우리말 이름',80,320,40,palette.muted);
  text('출생',80,410,24,accent,700);
  const birthEnd=paragraph(`${cities[item.fictionalBirth.city]??item.fictionalBirth.city} · ${formatCivilBirth(item.fictionalBirth)}`,455,25,palette.muted);
  const pillarsY=Math.max(550,birthEnd+30);
  ['연주','월주','일주','시주'].forEach((label,index)=>{
    const x=80+index*240;
    text(label,x,pillarsY,24,palette.muted);text(item.pillars[index],x,pillarsY+47,48);
    text(readPillar(item.pillars[index]),x,pillarsY+113,21,palette.muted);
  });
  let y=pillarsY+195;
  text('사주 풀이',80,y,32,accent,700);y+=65;
  for(const section of item.interpretation.sections){
    context.font='700 28px system-ui, sans-serif';
    for(const line of wrappedLines(context,section.title,920,Infinity)){text(line,80,y,28,accent,700);y+=44;}
    y+=8;
    for(const value of section.paragraphs){y=paragraph(value,y,28);y+=16;}
    y+=24;
  }
  const footerY=Math.max(y+20,cardSize.height-100);
  const end=paragraph(url,footerY,22,accent);
  return {lines,width:cardSize.width,height:Math.ceil(Math.max(cardSize.height,end+65))};
}
export function shareCardSize(context:LayoutContext,item:Recommendation,mode:ExperienceMode,url:string){
  const {width,height}=cardLayout(context,item,mode,url);return {width,height};
}
export function drawShareCard(context:CanvasRenderingContext2D,item:Recommendation,mode:ExperienceMode,url:string){
  const layout=cardLayout(context,item,mode,url);
  context.fillStyle=mode==='character'?'#160F25':palette.sky;context.fillRect(0,0,layout.width,layout.height);
  context.textBaseline='top';
  for(const line of layout.lines){
    context.font=`${line.weight} ${line.size}px system-ui, sans-serif`;context.fillStyle=line.color;context.fillText(line.value,line.x,line.y);
  }
}
export async function downloadCard(item:Recommendation,mode:ExperienceMode,origin:string){
  await document.fonts.ready;
  const canvas=document.createElement('canvas');canvas.width=cardSize.width;canvas.height=cardSize.height;
  const context=canvas.getContext('2d');if(!context)throw new Error('Canvas unavailable');
  const url=shareUrl(origin,mode),size=shareCardSize(context,item,mode,url);
  canvas.width=size.width;canvas.height=size.height;
  drawShareCard(context,item,mode,url);
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('PNG unavailable')),'image/png'));
  const objectUrl=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=objectUrl;link.download=`make-the-one-${mode}-${item.name.name}.png`;
  document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(objectUrl),30_000);
}
