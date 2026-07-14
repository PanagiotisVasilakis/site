import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import React from 'react';

export function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title = (searchParams.get('title') || 'Guest Guide').slice(0, 80);
  const subtitle = (searchParams.get('subtitle') || 'Curated essentials').slice(0, 120);
  return new ImageResponse(
    React.createElement(
      'div',
      {
        style: {
          height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: 64,
            background: 'linear-gradient(135deg,#2ec4b6,#ff8a5b)',
            fontSize: 56,
            color: '#fff',
            fontFamily: 'sans-serif'
        }
      },
      React.createElement('div', { style: { fontWeight: 700 } }, title),
      React.createElement('div', { style: { fontSize: 28, marginTop: 16 } }, subtitle)
    ),
    { width: 1200, height: 630 }
  );
}
