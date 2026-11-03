import {style} from '@vanilla-extract/css';
import {design} from '../styles/design-tokens';
import {vars} from '../styles/theme.css';

export const page = style({
  position: 'relative',
  isolation: 'isolate',
  minHeight: '100svh',
  background: `radial-gradient(ellipse at 50% 0%, ${vars.color.skyGlow}, ${vars.color.sky} 68%)`,
  padding: `${vars.layout.pageGutter} ${vars.layout.pageGutter} ${design.spaceSection}`,
});

export const main = style({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  minHeight: `calc(100svh - ${design.spaceSection} - ${vars.layout.pageGutter})`,
  width: '100%',
  maxWidth: vars.layout.contentWidth,
  margin: '0 auto',
  paddingTop: design.pageTop,
});

export const brand = style({
  color: vars.color.accent,
  fontSize: design.bodySize,
  fontWeight: 700,
  letterSpacing: '0.08em',
});

export const scene = style({
  position: 'fixed',
  inset: 0,
  zIndex: -1,
  pointerEvents: 'none',
  overflow: 'hidden',
});

export const canvas = style({width: '100%', height: '100%', display: 'block'});

export const content = style({flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: `${design.spaceSection} 0`});

export const searching = style({display: 'flex', minHeight: '60svh', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: design.spaceSection, textAlign: 'center'});
export const searchHeading = style({fontSize: design.resultSize, color: vars.color.muted, fontWeight: 400, lineHeight: 1.6, wordBreak: 'keep-all'});

export const heading = style({
  margin: `${design.spaceSmall} 0 ${design.spaceMedium}`,
  fontSize: design.titleSize,
  lineHeight: 1.25,
  letterSpacing: '-0.035em',
  wordBreak: 'keep-all',
  overflowWrap: 'anywhere',
});

export const form = style({display: 'grid', gap: design.spaceMedium});

export const label = style({fontSize: design.bodySize, fontWeight: 650});

export const textarea = style({
  width: '100%',
  minHeight: design.inputHeight,
  resize: 'vertical',
  color: vars.color.text,
  background: vars.color.surface,
  border: `1px solid ${vars.color.line}`,
  borderRadius: vars.layout.radius,
  padding: design.spaceMedium,
  fontSize: design.bodySize,
  lineHeight: 1.6,
  outlineOffset: '3px',
  selectors: {
    '&::placeholder': {color: vars.color.muted},
    '&:focus-visible': {outline: `2px solid ${vars.color.accent}`},
  },
});

export const formFooter = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: design.spaceMedium,
  flexWrap: 'wrap',
});

export const hint = style({
  margin: 0,
  color: vars.color.muted,
  fontSize: design.smallSize,
  lineHeight: 1.6,
  wordBreak: 'keep-all',
});

export const button = style({
  minHeight: design.buttonHeight,
  padding: `0 ${design.spaceLarge}`,
  border: `1px solid ${vars.color.accent}`,
  borderRadius: design.smallRadius,
  background: vars.color.accent,
  color: vars.color.sky,
  fontSize: design.bodySize,
  fontWeight: 700,
  cursor: 'pointer',
  selectors: {
    '&:focus-visible': {outline: `2px solid ${vars.color.meteor}`, outlineOffset: '3px'},
    '&:disabled': {cursor: 'wait', opacity: 0.7},
  },
});

export const message = style({
  margin: `${design.spaceMedium} 0 0`,
  color: vars.color.text,
  lineHeight: 1.6,
});

export const result = style({
  width: '100%',
});

export const primaryCard = style({padding: design.spaceMedium, borderRadius: vars.layout.radius, border: `1px solid ${vars.color.line}`, background: vars.color.surface});
export const primaryName = style({margin: 0, color: vars.color.accent, fontSize: design.primaryNameSize, lineHeight: 1.3, fontWeight: 700, overflowWrap: 'anywhere'});
export const primaryMeaning = style({margin: `${design.spaceSmall} 0 0`, color: vars.color.text, fontSize: design.bodySize, lineHeight: 1.6, overflowWrap: 'anywhere'});
export const saju = style({marginTop: design.spaceLarge, paddingTop: design.spaceMedium, borderTop: `1px solid ${vars.color.line}`});
export const sectionHeading = style({margin: `0 0 ${design.spaceSmall}`, fontSize: design.bodySize, fontWeight: 650, lineHeight: 1.6});
export const alternativeHeading = style([sectionHeading, {marginTop: design.spaceLarge}]);
export const pillars = style({display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: design.spaceSmall, margin: 0});
export const pillar = style({textAlign: 'center', background: vars.color.surfaceRaised, borderRadius: design.smallRadius, padding: `${design.spaceSmall} 0`});
export const pillarLabel = style({color: vars.color.muted, fontSize: design.smallSize, marginBottom: design.spaceSmall, lineHeight: 1.6});
export const pillarValue = style({display: 'grid', gap: design.spaceSmall, margin: 0, color: vars.color.text, fontSize: design.pillarSize, lineHeight: 1.3});
export const pillarGlyph = style({rubyPosition:'under'});
export const pillarReading = style({color:vars.color.muted,fontSize:design.smallSize,fontWeight:400});
export const readingParagraph = style({margin:`${design.spaceSmall} 0 0`,fontSize:design.bodySize,lineHeight:1.8,wordBreak:'keep-all',overflowWrap:'anywhere'});
export const readingSection = style({marginTop:design.spaceLarge});
export const readingHeading = style({margin:0,fontSize:design.bodySize,fontWeight:650,lineHeight:1.6,color:vars.color.accent});
export const readingBasis = style({marginTop:design.spaceLarge,paddingTop:design.spaceMedium,borderTop:`1px solid ${vars.color.line}`});
export const basisSummary = style({cursor:'pointer',fontSize:design.smallSize,lineHeight:1.8,color:vars.color.muted,selectors:{'&:focus-visible':{outline:`2px solid ${vars.color.meteor}`,outlineOffset:'3px'}}});
export const basisList = style({margin:0});
export const basisItem = style({marginTop:design.spaceMedium});
export const basisText = style({margin:`${design.spaceSmall} 0 0`,fontSize:design.smallSize,lineHeight:1.8,color:vars.color.muted,wordBreak:'keep-all',overflowWrap:'anywhere'});
export const commonSaju = style({margin: `${design.spaceMedium} 0 0`, color: vars.color.muted, fontSize: design.smallSize, lineHeight: 1.6, wordBreak: 'keep-all'});

export const birth = style({
  margin: `0 0 ${design.spaceLarge}`,
  color: vars.color.muted,
  lineHeight: 1.6,
  overflowWrap: 'anywhere',
});

export const names = style({display: 'grid', gap: design.spaceSmall, listStyle: 'none', padding: 0, margin: 0});

export const nameCard = style({
  padding: design.spaceMedium,
  borderRadius: design.smallRadius,
  background: vars.color.surface,
  overflowWrap: 'anywhere',
});

export const name = style({fontSize: design.resultSize, fontWeight: 700, lineHeight: 1.4});
export const restart = style([button, {marginTop: design.spaceLarge, width: '100%'}]);
export const status = style({position: 'relative', maxWidth: vars.layout.contentWidth, margin: '0 auto'});
export const srOnly = style({position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap', border: 0});
