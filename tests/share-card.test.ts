import {test} from 'node:test';
import assert from 'node:assert/strict';
import {shareText,shareUrl,xIntent,wrappedLines,drawShareCard,shareCardSize,cardSize} from '../app/me/share-card.ts';
import {recommendation} from './fixtures/recommendation.ts';
test('route-specific sharing excludes story, world, existing name, query and source links',()=>{
  const item={...recommendation,story:'private-story',setting:'private-world',existingName:'private-name'};
  for(const mode of ['me','character'] as const){
    const text=shareText(item,mode),url=shareUrl('https://example.com/input?story=private-story#private-world',mode);
    assert.equal(url,`https://example.com/${mode}`);
    assert.match(text,mode==='me'?/내 이야기/:/내 캐릭터/);
    for(const secret of ['private-story','private-world','private-name','krdict.korean.go.kr'])assert.ok(!text.includes(secret));
    const intent=new URL(xIntent(text,url));assert.equal(intent.origin,'https://twitter.com');assert.equal(intent.searchParams.get('text'),text);assert.equal(intent.searchParams.get('url'),url);
  }
  assert.throws(()=>shareUrl('javascript:alert(1)','me'));
  const authenticated=new URL('https://example.com');authenticated.username='test-user';authenticated.password='test-password';
  assert.throws(()=>shareUrl(authenticated.href,'me'));
});
test('PNG places the full chart reading below pillars and grows without name explanations',()=>{
  const drawn:{text:string;x:number;y:number}[]=[];
  const context={font:'',fillStyle:'',textBaseline:'',fillRect(){},fillText(text:string,x:number,y:number){drawn.push({text,x,y});},
    measureText(text:string){return {width:Array.from(text).length*Number(this.font.match(/(\d+)px/)?.[1]??20)};}};
  const wrapped=wrappedLines(context,'가나다라마바사아자차카타파하'.repeat(100),100,3);
  assert.equal(wrapped.length,3);assert.ok(wrapped.at(-1)?.endsWith('…'));assert.ok(wrapped.every(line=>context.measureText(line).width<=100));
  const item={...recommendation,name:{...recommendation.name,meaning:'상서로움/윤택함에서 착안한 이름'},interpretation:{...recommendation.interpretation,
    sections:recommendation.interpretation.sections.map((section,index)=>({...section,title:['전체적인 성향','일과 재능','돈을 대하는 방식','인간관계와 연애'][index],paragraphs:[('자신의 생각을 정리하고 주변과 관계를 맺습니다. ').repeat(12)+`마지막문장${index}`]}))}};
  for(const mode of ['me','character'] as const){
    drawn.length=0;
    const size=shareCardSize(context,item,mode,'https://example.com/'+mode);
    drawShareCard(context as unknown as CanvasRenderingContext2D,item,mode,'https://example.com/'+mode);
    assert.equal(size.width,1080);assert.ok(size.height>cardSize.height);
    assert.ok(drawn.some(line=>line.text==='하늘'));assert.ok(drawn.some(line=>line.text==='순우리말 이름'));
    assert.ok(drawn.some(line=>line.text==='출생'));assert.ok(drawn.some(line=>line.text.includes('서울')));assert.ok(drawn.some(line=>line.text.includes('UTC+09:00')));
    const readingY=drawn.find(line=>line.text==='사주 풀이')!.y;
    for(const label of ['연주','월주','일주','시주'])assert.ok(drawn.find(line=>line.text===label)!.y<readingY);
    const allText=drawn.map(line=>line.text).join('').replace(/\s/g,'');
    for(const section of item.interpretation.sections){
      assert.ok(drawn.find(line=>line.text===section.title)!.y>readingY);
      assert.ok(allText.includes(section.paragraphs[0].replace(/\s/g,'')));
    }
    for(const excluded of ['가상','창작','상서로움','윤택함',item.name.wordMeaning!,'krdict.korean.go.kr'])assert.ok(!allText.includes(excluded));
    assert.ok(!shareText(item,mode).includes('상서로움'));
    assert.ok(drawn.every(line=>line.x>=0&&line.y>=0&&line.x<size.width&&line.y+48<size.height));
  }
});
