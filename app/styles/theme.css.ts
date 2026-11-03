import {createGlobalTheme, globalStyle} from '@vanilla-extract/css';
import {palette, design} from './design-tokens';

export const vars = createGlobalTheme(':root', {
  color: palette,
  layout: {
    contentWidth: design.contentWidth,
    pageGutter: design.pageGutter,
    radius: design.radius,
  },
});

globalStyle('*', {boxSizing: 'border-box'});
globalStyle('html', {background: vars.color.sky});
globalStyle('body', {
  margin: 0,
  color: vars.color.text,
  background: vars.color.sky,
  fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", sans-serif',
});
globalStyle('button, textarea', {font: 'inherit'});
