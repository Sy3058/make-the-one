import {style} from '@vanilla-extract/css';
import {design} from '../styles/design-tokens';
import {vars} from '../styles/theme.css';

export const page = style({
  minHeight: '100vh',
  background: `radial-gradient(ellipse at 50% 0%, ${vars.color.skyGlow}, ${vars.color.sky} 68%)`,
  padding: `${vars.layout.pageGutter} ${vars.layout.pageGutter} ${design.spaceSection}`,
});

export const main = style({
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
  position: 'relative',
  height: design.heroHeight,
  marginTop: design.spaceMedium,
  overflow: 'hidden',
});

export const canvas = style({width: '100%', height: '100%', display: 'block'});

export const arrival = style({
  position: 'absolute',
  right: design.spaceLarge,
  bottom: design.spaceSmall,
  color: vars.color.meteor,
  fontSize: design.resultSize,
  fontWeight: 700,
  lineHeight: 1.4,
  textShadow: `0 0 ${design.spaceMedium} ${vars.color.glow}`,
});

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
  marginTop: design.spaceSection,
  paddingTop: design.spaceLarge,
  borderTop: `1px solid ${vars.color.line}`,
});

export const resultHeading = style({
  margin: `0 0 ${design.spaceSmall}`,
  color: vars.color.accent,
  fontSize: design.resultSize,
  lineHeight: 1.4,
});

export const birth = style({
  margin: `0 0 ${design.spaceLarge}`,
  color: vars.color.muted,
  lineHeight: 1.6,
  overflowWrap: 'anywhere',
});

export const names = style({display: 'grid', gap: design.spaceSmall, listStyle: 'none', padding: 0, margin: 0});

export const nameCard = style({
  display: 'grid',
  gridTemplateColumns: 'auto 1fr',
  alignItems: 'baseline',
  gap: design.spaceMedium,
  padding: design.spaceMedium,
  borderRadius: design.smallRadius,
  background: vars.color.surface,
  overflowWrap: 'anywhere',
  '@media': {
    [`screen and (max-width: ${design.mobileBreakpoint})`]: {gridTemplateColumns: '1fr', gap: design.spaceSmall},
  },
});

export const name = style({fontSize: design.resultSize, fontWeight: 700, lineHeight: 1.4});
export const meaning = style({color: vars.color.muted, fontSize: design.bodySize, lineHeight: 1.6});
export const bonus = style({margin: `${design.spaceLarge} 0 ${design.spaceSmall}`, color: vars.color.accent, fontSize: design.bodySize});
