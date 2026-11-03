'use client';

import {useEffect, useReducer, useRef, useState, type FormEvent} from 'react';
import {MeteorSky} from './meteor-sky';
import {DisplayError, requestGeneration} from './generate-request';
import {experienceReducer, initialState, isResult} from './experience-state';
import {formatCivilBirth} from './birth-time';
import {readPillar,readPillarCharacter} from './pillar-reading';
import {yearRangeSchema,type NameFeel} from '../../src/generation-input';
import * as styles from './experience.css';

const cities: Record<string, string> = {
  seoul: '서울', seongnam: '성남', incheon: '인천', suwon: '수원',
  chuncheon: '춘천', sokcho: '속초', gangneung: '강릉', daejeon: '대전',
  cheongju: '청주', cheonan: '천안', jeonju: '전주', gunsan: '군산',
  gwangju: '광주', mokpo: '목포', daegu: '대구', pohang: '포항',
  busan: '부산', changwon: '창원', ulsan: '울산', jeju: '제주',
};
const pillarLabels = ['연주', '월주', '일주', '시주'] as const;

export function NameExperience() {
  const [state, dispatch] = useReducer(experienceReducer, initialState);
  const {story, status, result, error} = state;
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
    dispatch({type: 'start'});
    if (story.trim().length < 30 || story.trim().length > 1200) return;
    requestPending.current = true;
    try {
      const data = await requestGeneration(story.trim(),60_000,{nameFeel,yearRange:range});
      if (!isResult(data)) throw new DisplayError('결과를 읽을 수 없습니다. 다시 시도해 주세요.');
      dispatch({type: 'success', result: data});
    } catch (caught) {
      dispatch({type: 'error', message: caught instanceof DisplayError ? caught.message : '연결을 확인하고 다시 시도해 주세요.'});
    } finally {
      requestPending.current = false;
    }
  }

  const busy = status === 'loading' || status === 'falling';
  return <div className={styles.page}>
    <div className={styles.scene}>
      <MeteorSky status={status} onComplete={() => dispatch({type: 'complete'})} />
    </div>
    <main className={styles.main} aria-busy={busy}>
      <div className={styles.brand}>MAKE THE ONE</div>
      <div className={styles.content}>
        {status === 'idle' && <>
          <h1 className={styles.heading}>당신의 이야기에 어울리는 이름</h1>
          <form className={styles.form} onSubmit={submit}>
            <label className={styles.label} htmlFor="story">이야기</label>
            <textarea
              ref={textareaRef} id="story" className={styles.textarea} value={story}
              onChange={event => dispatch({type: 'edit', story: event.target.value})}
              minLength={30} maxLength={1200} required
              placeholder="어떤 시간을 지나왔고, 무엇을 중요하게 여기나요?"
              aria-describedby={error ? 'story-hint story-error' : 'story-hint'}
            />
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
            <p className={styles.hint}>실제 성별이나 생일을 묻지 않아요. 이름 느낌은 편집 기준이며, 중성적인 이름은 어느 쪽에도 포함될 수 있어요.</p>
            {optionError&&<p role="alert" className={styles.message}>{optionError}</p>}
            <div className={styles.formFooter}>
              <p id="story-hint" className={styles.hint}>30~1200자 · Meta API로 처리됩니다. 민감한 정보는 적지 마세요. ({story.length}/1200)</p>
              <button className={styles.button} type="submit">이름 찾기</button>
            </div>
            {error && <p id="story-error" role="alert" className={styles.message}>{error}</p>}
          </form>
        </>}
        {busy && <div className={styles.searching}>
          <h1 className={styles.searchHeading}>{status === 'loading' ? '당신의 별을 찾고 있어요' : '별 하나가 당신에게 내려옵니다'}</h1>
        </div>}
        {result && status === 'ready' && isResult(result) && <section className={styles.result} aria-labelledby="result-title">
          <h1 ref={resultHeadingRef} tabIndex={-1} id="result-title" className={styles.heading}>당신에게 도착한 세 가지 이름</h1>
          <p className={styles.hint}>각 이름에는 서로 다른 가상의 사주가 연결되어 있어요.</p>
          <div className={styles.resultCards}>{result.recommendations.map((item,cardIndex)=><article className={styles.primaryCard} key={item.chartId} aria-labelledby={`name-${cardIndex}`}>
            <h2 id={`name-${cardIndex}`} className={styles.primaryName}>{item.name.name} <span className={styles.nameAnnotation}>{item.name.kind==='hanja'?`(${item.name.hanja})`:'· 순우리말'}</span></h2>
            {item.name.wordMeaning&&<p className={styles.hint}>단어 뜻: {item.name.wordMeaning}</p>}
            <p className={styles.primaryMeaning}>창작 이름 풀이: {item.name.meaning}</p>
            <section className={styles.saju} aria-labelledby={`saju-title-${cardIndex}`}>
              <h3 id={`saju-title-${cardIndex}`} className={styles.sectionHeading}>가상의 사주</h3>
              <p className={styles.birth}>가상의 출생 · {cities[item.fictionalBirth.city] ?? item.fictionalBirth.city} · {formatCivilBirth(item.fictionalBirth)}</p>
              <dl className={styles.pillars}>{item.pillars.map((pillar, index) => <div className={styles.pillar} key={pillarLabels[index]}>
                <dt className={styles.pillarLabel}>{pillarLabels[index]}</dt>
                <dd className={styles.pillarValue} aria-label={readPillar(pillar)}>{Array.from(pillar).map((character, position) => <ruby className={styles.pillarGlyph} key={position}>{character}<rt className={styles.pillarReading}>{readPillarCharacter(character)}</rt></ruby>)}</dd>
              </div>)}</dl>
            </section>
            <details className={styles.saju}>
              <summary className={styles.basisSummary}>이 이름의 가상 사주 풀이 보기</summary>
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
          </article>)}</div>
          <button type="button" className={styles.restart} onClick={() => dispatch({type: 'reset'})}>새로운 이름 찾기</button>
        </section>}
      </div>
    </main>
    <div className={styles.status} role="status" aria-live="polite">
      {busy && <span className={styles.srOnly}>{status === 'loading' ? '이름을 찾고 있습니다.' : '이름을 찾았습니다. 별이 내려오고 있습니다.'}</span>}
    </div>
  </div>;
}
