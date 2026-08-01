import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import Header from '@/components/Header';

export const metadata: Metadata = {
  title: 'Бронювання переговорних — UA-Skills',
  description: 'Веб-застосунок для бронювання переговорних кімнат в офісі',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uk">
      <body className="min-h-screen bg-slate-50 antialiased">
        <AuthProvider>
          <Header />
          <main className="px-4 py-8 sm:px-6 lg:px-8">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
