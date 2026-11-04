import {z} from 'zod';
export const nameFeels=['any','masculine','feminine'] as const;
export type NameFeel=typeof nameFeels[number];
export const yearRangeSchema=z.object({from:z.number().int().min(1980).max(2039),to:z.number().int().min(1980).max(2039)})
  .refine(range=>range.from<=range.to,{message:'시작 연도는 끝 연도보다 클 수 없습니다.'});
export type YearRange=z.infer<typeof yearRangeSchema>;
export type GenerationOptions={mode?:'me'|'character';nameFeel?:NameFeel;yearRange?:YearRange;setting?:string;existingName?:string;style?:'차분함'|'선명함'|'고전적'|'현대적'|'중립적'};
export const generationInput=z.object({mode:z.enum(['me','character']),story:z.string().trim().min(30).max(1200),
  setting:z.string().trim().max(300).optional(),existingName:z.string().trim().transform(value=>value.normalize('NFC')).pipe(z.string().max(30)).optional(),style:z.enum(['차분함','선명함','고전적','현대적','중립적']).optional(),
  nameFeel:z.enum(nameFeels).default('any'),yearRange:yearRangeSchema.optional()});

export function narrativeInput(input:z.infer<typeof generationInput>){
  return input.mode==='character'&&input.setting?`세계관: ${input.setting}\n캐릭터 이야기: ${input.story}`:input.story;
}
