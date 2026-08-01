import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import HomePage from '../app/page';
import DemoStatusPage from '../app/demo/page';

describe('minimal web shell', () => {
  it('renders truthful milestone copy and a demo route', () => {
    expect(renderToStaticMarkup(<HomePage />)).toContain('BACKEND FOUNDATION');
    expect(renderToStaticMarkup(<DemoStatusPage />)).toContain('Dashboard UI next');
  });
});
