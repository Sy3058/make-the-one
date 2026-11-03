// Korean readings: 한국민족문화대백과사전 「사주」 https://encykorea.aks.ac.kr/Article/E0025957
const readings:Record<string,string>={
  甲:'갑',乙:'을',丙:'병',丁:'정',戊:'무',己:'기',庚:'경',辛:'신',壬:'임',癸:'계',
  子:'자',丑:'축',寅:'인',卯:'묘',辰:'진',巳:'사',午:'오',未:'미',申:'신',酉:'유',戌:'술',亥:'해',
};
export function readPillarCharacter(character:string):string{
  const reading=readings[character];
  if(!Object.hasOwn(readings,character))throw new Error('Unknown pillar character');
  return reading;
}
export function readPillar(pillar:string):string{
  if(pillar.length!==2)throw new Error('Expected a pillar pair');
  return Array.from(pillar,readPillarCharacter).join('');
}
