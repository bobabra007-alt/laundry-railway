import './globals.css';
export const viewport = {width:'device-width',initialScale:1,viewportFit:'cover' as const,themeColor:'#121715'};
export const metadata = { title: 'Laundra', description: 'Internal deal ledger' };
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ru"><body>{children}</body></html>}
