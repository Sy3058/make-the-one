'use client';

import {useState, type FormEvent} from 'react';
import {MeteorSky} from './meteor-sky';
import * as styles from './experience.css';

type Name = {name: string; meaning: string};
type Result = {
  fictionalBirth: {city: string; civilTime: string};
  seriousNames: Name[];
  playfulName: Name;
};

class DisplayError extends Error {}

const cities: Record<string, string> = {
  seoul: '서울', seongnam: '성남', incheon: '인천', suwon: '수원',
  chuncheon: '춘천', sokcho: '속초', gangneung: '강릉', daejeon: '대전',
  cheongju: '청주', cheonan: '천안', jeonju: '전주', gunsan: '군산',
  gwangju: '광주', mokpo: '목포', daegu: '대구', pohang: '포항',
  busan: '부산', changwon: '창원', ulsan: '울산', jeju: '제주',
};

function isResult(value: unknown): value is Result {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<Result>;
  const validName = (name: unknown): name is Name =>
    !!name && typeof name === 'object' &&
    typeof (name as Name).name === 'string' && typeof (name as Name).meaning === 'string';
  return !!data.fictionalBirth &&
    typeof data.fictionalBirth.city === 'string' &&
    typeof data.fictionalBirth.civilTime === 'string' &&
    Array.isArray(data.seriousNames) && data.seriousNames.length === 3 &&
    data.seriousNames.every(validName) && validName(data.playfulName);
}

export function NameExperience() {
  const [story, setStory] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'falling' | 'ready'>('idle');
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [playKey, setPlayKey] = useState(0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === 'loading' || status === 'falling') return;
    if (story.trim().length < 30) {
      setError('이야기를 30자 이상 적어주세요.');
      return;
    }
    setError('');
    setResult(null);
    setStatus('loading');
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({mode: 'me', story: story.trim()}),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
          ? data.error : '지금은 결과를 만들 수 없습니다. 다시 시도해 주세요.';
        throw new DisplayError(message);
      }
      if (!isResult(data)) throw new DisplayError('결과를 읽을 수 없습니다. 다시 시도해 주세요.');
      setResult(data);
      setStatus('falling');
      setPlayKey(key => key + 1);
    } catch (caught) {
      setError(caught instanceof DisplayError ? caught.message : '연결을 확인하고 다시 시도해 주세요.');
      setStatus('idle');
    }
  }

  const busy = status === 'loading' || status === 'falling';
  return <div className={styles.page}>
    <main className={styles.main}>
      <div className={styles.brand}>MAKE THE ONE</div>
      <div className={styles.scene}>
        <MeteorSky playKey={playKey} onComplete={() => setStatus('ready')} />
        {result && status === 'ready' && <span className={styles.arrival} aria-hidden="true">{result.seriousNames[0].name}</span>}
      </div>
      <h1 className={styles.heading}>당신의 이야기에 어울리는 이름</h1>
      <form className={styles.form} onSubmit={submit}>
        <label className={styles.label} htmlFor="story">이야기</label>
        <textarea
          id="story" className={styles.textarea} value={story}
          onChange={event => setStory(event.target.value)}
          minLength={30} maxLength={1200} required disabled={busy}
          placeholder="어떤 시간을 지나왔고, 무엇을 중요하게 여기나요?"
          aria-describedby="story-hint"
        />
        <div className={styles.formFooter}>
          <p id="story-hint" className={styles.hint}>30~1200자 · Meta API로 처리됩니다. 민감한 정보는 적지 마세요. ({story.length}/1200)</p>
          <button className={styles.button} type="submit" disabled={busy}>
            {status === 'loading' ? '이름 찾는 중' : status === 'falling' ? '별이 내려오는 중' : '이름 찾기'}
          </button>
        </div>
      </form>
      <div role="status" aria-live="polite">
        {error && <p className={styles.message}>{error}</p>}
        {status === 'loading' && <p className={styles.message}>이야기를 읽고 있어요.</p>}
      </div>
      {result && status === 'ready' && <section className={styles.result} aria-labelledby="result-title">
        <h2 id="result-title" className={styles.resultHeading}>당신에게 도착한 이름</h2>
        <p className={styles.birth}>가상의 출생 · {cities[result.fictionalBirth.city] ?? result.fictionalBirth.city} · {result.fictionalBirth.civilTime.slice(0, 16).replace('T', ' ')}</p>
        <ul className={styles.names}>{result.seriousNames.map(name => <li className={styles.nameCard} key={name.name}>
          <span className={styles.name}>{name.name}</span><span className={styles.meaning}>{name.meaning}</span>
        </li>)}</ul>
        <h3 className={styles.bonus}>재미 이름</h3>
        <div className={styles.nameCard}><span className={styles.name}>{result.playfulName.name}</span><span className={styles.meaning}>{result.playfulName.meaning}</span></div>
      </section>}
    </main>
  </div>;
}
