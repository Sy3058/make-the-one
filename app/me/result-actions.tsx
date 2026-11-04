'use client';
import {useRef,useState} from 'react';
import type {Recommendation} from './experience-state';
import type {ExperienceMode} from './experience-copy';
import {downloadCard,shareText,shareUrl,xIntent} from './share-card';
import {trackEvent} from './analytics';
import * as styles from './experience.css';
export function ResultActions({item,mode,rank,selected,onSelect}:{item:Recommendation;mode:ExperienceMode;rank:number;selected:boolean;onSelect:()=>void}){
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[copyFallback,setCopyFallback]=useState(false);
  const exporting=useRef(false);
  const text=shareText(item,mode);
  async function download(){
    if(exporting.current)return;exporting.current=true;setBusy(true);setMessage('');
    try{await downloadCard(item,mode,window.location.origin);trackEvent(mode,'card_download',rank);setMessage('PNG 저장을 시작했어요.');}
    catch{setMessage('이미지를 저장하지 못했어요. 다시 시도해 주세요.');}
    finally{exporting.current=false;setBusy(false);}
  }
  async function copy(){
    try{await navigator.clipboard.writeText(`${text}\n${shareUrl(window.location.origin,mode)}`);trackEvent(mode,'text_copy',rank);setMessage('공유 문구를 복사했어요.');setCopyFallback(false);}
    catch{setCopyFallback(true);setMessage('복사하지 못했어요. 아래 문구를 선택해 직접 복사해 주세요.');}
  }
  return <div className={styles.actions}>
    <div className={styles.actionButtons}>
      <button className={styles.secondaryButton} type="button" onClick={download} disabled={busy}>{busy?'이미지 준비 중…':'PNG 카드 저장'}</button>
      <button className={styles.secondaryButton} type="button" onClick={()=>{
        trackEvent(mode,'share_click',rank);window.open(xIntent(text,shareUrl(window.location.origin,mode)),'_blank','noopener,noreferrer');
      }}>X에 공유</button>
      <button className={styles.secondaryButton} type="button" onClick={copy}>문구 복사</button>
      <button className={styles.secondaryButton} type="button" aria-pressed={selected} onClick={()=>{if(!selected){onSelect();trackEvent(mode,'name_preference',rank);}}}>{selected?'마음에 드는 이름 ✓':'이 이름이 좋아요'}</button>
    </div>
    <p className={styles.hint}>X에는 문구와 링크가 열려요. 저장한 PNG는 작성 창에서 직접 첨부해 주세요.</p>
    {copyFallback&&<label className={styles.optionLabel}>공유 문구<textarea className={styles.textarea} readOnly value={`${text}\n${typeof window==='undefined'?'':shareUrl(window.location.origin,mode)}`} onFocus={event=>event.target.select()}/></label>}
    <p role="status" className={styles.hint}>{message}</p>
  </div>;
}
