import {readFileSync,statSync,writeFileSync} from 'node:fs';
import corpus from '../data/names.json' with {type:'json'};
import {validateNameStatistics,nameCandidateDrafts} from '../src/name-statistics';
try{
  const args=process.argv.slice(2),allowSecondary=args.includes('--allow-secondary');
  const files=args.filter(arg=>arg!=='--allow-secondary');
  if(files.length!==3||args.length!==files.length+Number(allowSecondary))throw new Error('Invalid arguments');
  const [input,snapshot,output]=files;
  if(statSync(input).size>2_000_000||statSync(snapshot).size>8_000_000)throw new Error('Input too large');
  const batch=validateNameStatistics(JSON.parse(readFileSync(input,'utf8')),readFileSync(snapshot),{allowSecondary});
  const candidates=nameCandidateDrafts(batch,corpus.entries.filter(n=>n.review_status==='verified'&&!n.is_playful).map(n=>n.hangul));
  writeFileSync(output,JSON.stringify({version:'name-candidate-drafts-v1',statistics:batch,candidates},null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({rows:batch.rows.length,candidates:candidates.length,status:'drafts-only'}));
}catch{console.error('Name candidate preparation failed; check arguments, source evidence, aggregate schema and a new output path.');process.exitCode=1;}
