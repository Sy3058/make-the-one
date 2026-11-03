'use client';

import {useEffect, useReducer, useRef, type FormEvent} from 'react';
import {MeteorSky} from './meteor-sky';
import {DisplayError, requestGeneration} from './generate-request';
import {experienceReducer, initialState, isResult} from './experience-state';
import {formatCivilBirth} from './birth-time';
import {readPillar,readPillarCharacter} from './pillar-reading';
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
    dispatch({type: 'start'});
    if (story.trim().length < 30 || story.trim().length > 1200) return;
    requestPending.current = true;
    try {
      const data = await requestGeneration(story.trim());
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
          <h1 ref={resultHeadingRef} tabIndex={-1} id="result-title" className={styles.heading}>당신에게 도착한 이름</h1>
          <article className={styles.primaryCard} aria-labelledby="primary-name">
            <h2 id="primary-name" className={styles.primaryName}>{result.seriousNames[0].name}</h2>
            <p className={styles.primaryMeaning}>{result.seriousNames[0].meaning}</p>
            <section className={styles.saju} aria-labelledby="saju-title">
              <h3 id="saju-title" className={styles.sectionHeading}>가상의 사주</h3>
              <p className={styles.birth}>가상의 출생 · {cities[result.fictionalBirth.city] ?? result.fictionalBirth.city} · {formatCivilBirth(result.fictionalBirth)}</p>
              <dl className={styles.pillars}>{result.pillars.map((pillar, index) => <div className={styles.pillar} key={pillarLabels[index]}>
                <dt className={styles.pillarLabel}>{pillarLabels[index]}</dt>
                <dd className={styles.pillarValue} aria-label={readPillar(pillar)}>{Array.from(pillar).map((character, position) => <ruby className={styles.pillarGlyph} key={position}>{character}<rt className={styles.pillarReading}>{readPillarCharacter(character)}</rt></ruby>)}</dd>
              </div>)}</dl>
              <p className={styles.commonSaju}>세 이름에 공통으로 적용되는 가상의 사주입니다.</p>
            </section>
            <section className={styles.saju} aria-labelledby="interpretation-title">
              <h3 id="interpretation-title" className={styles.sectionHeading}>가상 사주 풀이</h3>
              {result.interpretation.sections.map(section=><section className={styles.readingSection} key={section.id} aria-labelledby={`reading-${section.id}`}>
                <h4 id={`reading-${section.id}`} className={styles.readingHeading}>{section.title}</h4>
                {section.paragraphs.map((paragraph,index)=><p className={styles.readingParagraph} key={index}>{paragraph}</p>)}
              </section>)}
              <details className={styles.readingBasis}>
                <summary className={styles.basisSummary}>풀이의 계산 근거 보기</summary>
                <p className={styles.commonSaju}>아래는 네 기둥에서 계산한 구성입니다. 위 문장은 이를 바탕으로 쓴 창작 풀이입니다.</p>
                <dl className={styles.basisList}>{result.interpretation.basis.map(fact=><div className={styles.basisItem} key={fact.label}>
                  <dt className={styles.readingHeading}>{fact.label}</dt>
                  <dd className={styles.basisText}>{fact.text}</dd>
                </div>)}</dl>
              </details>
            </section>
          </article>
          <h2 className={styles.alternativeHeading}>함께 어울리는 이름</h2>
          <ul className={styles.names}>{result.seriousNames.slice(1).map(name => <li className={styles.nameCard} key={name.name}>
            <span className={styles.name}>{name.name}</span>
          </li>)}</ul>
          <button type="button" className={styles.restart} onClick={() => dispatch({type: 'reset'})}>새로운 이름 찾기</button>
        </section>}
      </div>
    </main>
    <div className={styles.status} role="status" aria-live="polite">
      {busy && <span className={styles.srOnly}>{status === 'loading' ? '이름을 찾고 있습니다.' : '이름을 찾았습니다. 별이 내려오고 있습니다.'}</span>}
    </div>
  </div>;
}
