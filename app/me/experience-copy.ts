export type ExperienceMode='me'|'character';
export const experienceCopy={
  me:{heading:'당신의 이야기에 어울리는 이름',label:'이야기',placeholder:'어떤 시간을 지나왔고, 무엇을 중요하게 여기나요?',
    loading:'당신의 별을 찾고 있어요',result:'당신에게 도착한 세 가지 이름',otherHref:'/character',otherLabel:'캐릭터를 만들고 있나요?',shareLead:'내 이야기에서 찾은 이름'},
  character:{heading:'이 캐릭터는 어떤 이름으로 살아갈까요?',label:'캐릭터의 이야기',placeholder:'어떤 과거를 지났고, 무엇을 원하며, 어떤 선택을 하나요?',
    loading:'캐릭터의 별을 찾고 있어요',result:'캐릭터에게 도착한 세 가지 이름',otherHref:'/me',otherLabel:'나의 이야기로 이름 찾기',shareLead:'내 캐릭터를 위한 이름'},
} as const;
