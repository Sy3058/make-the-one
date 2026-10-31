import moment from 'moment-timezone';

export function civilYearWindow(from:number,to:number){
  if(!Number.isInteger(from)||!Number.isInteger(to)||from<1980||to>2039||from>to) throw new Error('Invalid index year range');
  return {
    start:moment.tz({year:from,month:0,date:1,hour:0},'Asia/Seoul').valueOf(),
    end:moment.tz({year:to+1,month:0,date:1,hour:0},'Asia/Seoul').valueOf(),
  };
}
