import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  weight: ['300', '400', '500', '600', '700', '800', '900'],
});

export const metadata: Metadata = {
  title: 'Soham Patel — Software Engineer | AI Researcher | Digital Twin Architect',
  description:
    'Portfolio of Soham Patel — M.Sc. AI at OTH Amberg, former Software Engineer at Altera Digital Health. Building intelligent systems at the intersection of hardware and software.',
  keywords: [
    'Soham Patel',
    'AI Engineer',
    'Digital Twin',
    'Software Engineer Germany',
    'FastAPI',
    'PyTorch',
    'MQTT',
    'IoT',
    'OTH Amberg',
    'Werkstudent',
  ],
  authors: [{ name: 'Soham Patel', url: 'https://github.com/soham10i' }],
  creator: 'Soham Patel',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://soham-patel.vercel.app',
    title: 'Soham Patel — Software Engineer | AI Researcher | Digital Twin Architect',
    description:
      'Building intelligent systems at the intersection of hardware and software. M.Sc. AI at OTH Amberg-Weiden, Germany.',
    siteName: 'Soham Patel Portfolio',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Soham Patel Portfolio',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Soham Patel — AI Engineer & Digital Twin Architect',
    description: 'Building intelligent systems at the intersection of hardware and software.',
    creator: '@Soham10i',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-video-preview': -1, 'max-image-preview': 'large' },
  },
  viewport: { width: 'device-width', initialScale: 1, maximumScale: 5 },
  themeColor: [{ media: '(prefers-color-scheme: dark)', color: '#0a0a0f' }],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} dark`} suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Person',
              name: 'Soham Patel',
              url: 'https://soham-patel.vercel.app',
              sameAs: ['https://github.com/soham10i', 'https://linkedin.com/in/soham-patel'],
              jobTitle: 'Software Engineer / AI Researcher',
              alumniOf: [
                { '@type': 'CollegeOrUniversity', name: 'OTH Amberg-Weiden' },
                { '@type': 'CollegeOrUniversity', name: 'Sardar Patel University' },
              ],
              knowsAbout: ['Digital Twin', 'Artificial Intelligence', 'IoT', 'FastAPI', 'PyTorch'],
            }),
          }}
        />
      </head>
      <body className={`${inter.className} bg-navy-950 text-gray-100 antialiased`}>
        {children}
      </body>
    </html>
  );
}
