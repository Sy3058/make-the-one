'use client';

import Link from 'next/link';
import {ResultActions} from './result-actions';
import {experienceCopy,type ExperienceMode} from './experience-copy';
import {trackEvent} from './analytics';
import {useEffect, useReducer, useRef, useState, type FormEvent} from 'react';
import {MeteorSky} from './meteor-sky';
import {DisplayError, requestGeneration} from './generate-request';
import {experienceReducer, initialState, isResult} from './experience-state';
import {formatCivilBirth,cities} from './birth-time';
import {readPillar,readPillarCharacter} from './pillar-reading';
import {yearRangeSchema,type NameFeel} from '../../src/generation-input';
import * as styles from './experience.css';

const pillarLabels = ['연주', '월주', '일주', '시주'] as const;

export function NameExperience({mode='me'}:{mode?:ExperienceMode}) {
  const copy=experienceCopy[mode];
  const [state, dispatch] = useReducer(experienceReducer, initialState);
  const {story, status, result, error} = state;
  const [setting,setSetting]=useState(''),[existingName,setExistingName]=useState('');
  const [style,setStyle]=useState('');
  const [selectedRank,setSelectedRank]=useState<number|null>(null);
  const visited=useRef(false);
  useEffect(()=>{if(!visited.current){visited.current=true;trackEvent(mode,'visit');}},[mode]);
  const [nameFeel,setNameFeel]=useState<NameFeel>('any');
  const [period,setPeriod]=useState('any');
  const [from,setFrom]=useState('1980');
  const [to,setTo]=useState('2039');
  const [optionError,setOptionError]=useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const previousStatus = useRef(status);
  const requestPending = useRef(false);

  useEffect(() => {
    if (status === 'ready' && !isResult(result)) {
      dispatch({type: 'reset'});
      return;
    }
    if (status === 'ready') resultHeadingRef.current?.focus();
    if (status === 'idle' && previousStatus.current !== 'idle') textareaRef.current?.focus();
    previousStatus.current = status;
  }, [status, result]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status !== 'idle' || requestPending.current) return;
    const range=period==='any'?undefined:period==='custom'?{from:Number(from),to:Number(to)}:{from:Number(period),to:Number(period)+9};
    if(range&&!yearRangeSchema.safeParse(range).success){setOptionError('출생연도는 1980~2039년 사이에서 시작 연도부터 끝 연도 순으로 입력해 주세요.');return;}
    setOptionError('');
    setSelectedRank(null);
    dispatch({type: 'start'});
    if (story.trim().length < 30 || story.trim().length > 1200) return;
    requestPending.current = true;
    try {
      const data = await requestGeneration(story.trim(),60_000,{mode,nameFeel,yearRange:range,...(mode==='character'?{setting,existingName}:{}),...(style?{style:style as '차분함'|'선명함'|'고전적'|'현대적'|'중립적'}:{})});
      if (!isResult(data)) throw new DisplayError('결과를 읽을 수 없습니다. 다시 시도해 주세요.');
      dispatch({type: 'success', result: data});
    } catch (caught) {
      dispatch({type: 'error', message: caught instanceof DisplayError ? caught.message : '연결을 확인하고 다시 시도해 주세요.'});
    } finally {
      requestPending.current = false;
    }
  }

  const busy = status === 'loading' || status === 'falling';
  return <div className={mode==='character'?`${styles.page} ${styles.characterPage}`:styles.page}>
    <div className={styles.scene}>
      <MeteorSky status={status} onComplete={() => dispatch({type: 'complete'})} />
    </div>
    <main className={styles.main} aria-busy={busy}>
      <div className={styles.brand}>MAKE THE ONE</div>
      <div className={styles.content}>
        {status === 'idle' && <>
          <h1 className={styles.heading}>{copy.heading}</h1>
          <Link className={styles.routeLink} href={copy.otherHref}>{copy.otherLabel}</Link>
          <form className={styles.form} onSubmit={submit}>
            <label className={styles.label} htmlFor="story">{copy.label}</label>
            <textarea
              ref={textareaRef} id="story" className={styles.textarea} value={story}
              onChange={event => dispatch({type: 'edit', story: event.target.value})}
              minLength={30} maxLength={1200} required
              placeholder={copy.placeholder}
              aria-describedby={error ? 'story-hint story-error' : 'story-hint'}
            />
            {mode==='character'&&<>
              <label className={styles.optionLabel}>세계관과 배경 (선택)
                <textarea className={styles.contextInput} value={setting} maxLength={300} onChange={event=>setSetting(event.target.value)} placeholder="살아가는 시대와 장소, 이 세계의 규칙을 적어주세요."/>
              </label>
              <label className={styles.optionLabel}>기존 이름 (선택)
                <input className={styles.select} value={existingName} maxLength={30} onChange={event=>setExistingName(event.target.value)} placeholder="같은 이름은 추천에서 제외해요."/>
              </label>
              <p className={styles.hint}>가상 출생은 현대 한국의 양력 날짜로 표현해요. 판타지 달력이나 다른 시대의 역법은 지원하지 않아요.</p>
            </>}
            <div className={styles.options}>
              <label className={styles.optionLabel}>선호하는 이름 느낌
                <select className={styles.select} value={nameFeel} onChange={event=>setNameFeel(event.target.value as NameFeel)}>
                  <option value="any">상관없음</option><option value="masculine">남성적인 느낌</option><option value="feminine">여성적인 느낌</option>
                </select>
              </label>
              <label className={styles.optionLabel}>가상 출생연도
                <select className={styles.select} value={period} onChange={event=>setPeriod(event.target.value)}>
                  <option value="any">상관없음</option>
                  {[1980,1990,2000,2010,2020,2030].map(year=><option value={year} key={year}>{year}년대</option>)}
                  <option value="custom">직접 범위 지정</option>
                </select>
              </label>
            </div>
            {period==='custom'&&<div className={styles.options}>
              <label className={styles.optionLabel}>시작 연도<input className={styles.select} type="number" min={1980} max={2039} step={1} required value={from} onChange={event=>setFrom(event.target.value)}/></label>
              <label className={styles.optionLabel}>끝 연도<input className={styles.select} type="number" min={1980} max={2039} step={1} required value={to} onChange={event=>setTo(event.target.value)}/></label>
            </div>}
            <label className={styles.optionLabel}>이름 스타일 (선택)
              <select className={styles.select} value={style} onChange={event=>setStyle(event.target.value)}>
                <option value="">상관없음</option>{['차분함','선명함','고전적','현대적','중립적'].map(value=><option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <p className={styles.hint}>실제 성별이나 생일을 묻지 않아요. 이름 느낌은 편집 기준이며, 중성적인 이름은 어느 쪽에도 포함될 수 있어요.</p>
            {optionError&&<p role="alert" className={styles.message}>{optionError}</p>}
            <div className={styles.formFooter}>
              <p id="story-hint" className={styles.hint}>30~1200자 · 이야기와 배경은 Meta API로 처리되며 원문을 저장하지 않아요. 민감한 정보는 적지 마세요. ({story.length}/1200)</p>
              <button className={styles.button} type="submit">이름 찾기</button>
            </div>
            <p className={styles.hint}>원문 없이 이용 횟수와 익명 요청 제한 정보만 기록해요.</p>
            {error && <p id="story-error" role="alert" className={styles.message}>{error}</p>}
          </form>
        </>}
        {busy && <div className={styles.searching}>
          <h1 className={styles.searchHeading}>{status === 'loading' ? copy.loading : '별 하나가 당신에게 내려옵니다'}</h1>
        </div>}
        {result && status === 'ready' && isResult(result) && <section className={styles.result} aria-labelledby="result-title">
          <h1 ref={resultHeadingRef} tabIndex={-1} id="result-title" className={styles.heading}>{copy.result}</h1>
          <p className={styles.hint}>이야기에서 찾은 서로 다른 사주와 이름이에요.</p>
          <div className={styles.resultCards}>{result.recommendations.map((item,cardIndex)=><article className={styles.primaryCard} key={item.chartId} aria-labelledby={`name-${cardIndex}`}>
            <h2 id={`name-${cardIndex}`} className={styles.primaryName}>{item.name.name} <span className={styles.nameAnnotation}>{item.name.kind==='hanja'?`(${item.name.hanja})`:'· 순우리말'}</span></h2>
            <section className={styles.saju} aria-labelledby={`saju-title-${cardIndex}`}>
              <h3 id={`saju-title-${cardIndex}`} className={styles.sectionHeading}>사주</h3>
              <p className={styles.birth}>출생 · {cities[item.fictionalBirth.city] ?? item.fictionalBirth.city} · {formatCivilBirth(item.fictionalBirth)}</p>
              <dl className={styles.pillars}>{item.pillars.map((pillar, index) => <div className={styles.pillar} key={pillarLabels[index]}>
                <dt className={styles.pillarLabel}>{pillarLabels[index]}</dt>
                <dd className={styles.pillarValue} aria-label={readPillar(pillar)}>{Array.from(pillar).map((character, position) => <ruby className={styles.pillarGlyph} key={position}>{character}<rt className={styles.pillarReading}>{readPillarCharacter(character)}</rt></ruby>)}</dd>
              </div>)}</dl>
            </section>
            <details className={styles.saju}>
              <summary className={styles.basisSummary}>사주 풀이 보기</summary>
              {item.interpretation.sections.map(section=><section className={styles.readingSection} key={section.id} aria-labelledby={`reading-${cardIndex}-${section.id}`}>
                <h4 id={`reading-${cardIndex}-${section.id}`} className={styles.readingHeading}>{section.title}</h4>
                {section.paragraphs.map((paragraph,index)=><p className={styles.readingParagraph} key={index}>{paragraph}</p>)}
              </section>)}
              <details className={styles.readingBasis}>
                <summary className={styles.basisSummary}>풀이의 계산 근거 보기</summary>
                <p className={styles.commonSaju}>아래는 네 기둥에서 계산한 구성입니다. 위 문장은 이를 바탕으로 쓴 창작 풀이입니다.</p>
                <dl className={styles.basisList}>{item.interpretation.basis.map(fact=><div className={styles.basisItem} key={fact.label}>
                  <dt className={styles.readingHeading}>{fact.label}</dt>
                  <dd className={styles.basisText}>{fact.text}</dd>
                </div>)}</dl>
              </details>
            </details>
            <ResultActions item={item} mode={mode} rank={cardIndex+1} selected={selectedRank===cardIndex+1} onSelect={()=>setSelectedRank(cardIndex+1)}/>
          </article>)}</div>
          <button type="button" className={styles.restart} onClick={() => dispatch({type: 'reset'})}>새로운 이름 찾기</button>
          <Link className={styles.routeLink} href={copy.otherHref}>{copy.otherLabel}</Link>
        </section>}
      </div>
    </main>
    <div className={styles.status} role="status" aria-live="polite">
      {busy && <span className={styles.srOnly}>{status === 'loading' ? '이름을 찾고 있습니다.' : '이름을 찾았습니다. 별이 내려오고 있습니다.'}</span>}
    </div>
  </div>;
}
