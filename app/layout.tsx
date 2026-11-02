import type {Metadata} from 'next';
import './styles/theme.css';

export const metadata: Metadata = {
  title: 'Make The One',
  description: '이야기에서 찾는 가상의 출생과 새 이름',
};

export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  return <html lang="ko"><body>{children}</body></html>;
}
