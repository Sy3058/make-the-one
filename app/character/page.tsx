import type {Metadata} from 'next';
import {NameExperience} from '../me/name-experience';
export const metadata:Metadata={title:'캐릭터 이름 찾기 | Make The One',description:'캐릭터의 이야기와 세계관에 어울리는 사주와 이름을 찾으세요.'};
export default function CharacterPage(){return <NameExperience key="character" mode="character"/>;}
