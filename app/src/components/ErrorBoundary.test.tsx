// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Text } from 'react-native';

// Mocka rapportören så testet inte gör nätverksanrop.
vi.mock('../lib/errorReport', () => ({ reportClientError: vi.fn(), installGlobalErrorHandler: vi.fn() }));
import { reportClientError } from '../lib/errorReport';
import { ErrorBoundary } from './ErrorBoundary';

// Styr om barnet kastar — modulnivå så vi kan flippa mellan renders.
let shouldThrow = true;
function Boom() {
  if (shouldThrow) throw new Error('kaboom');
  return <Text>återhämtad</Text>;
}

beforeEach(() => {
  shouldThrow = true;
  vi.clearAllMocks();
  // React loggar fångade fel till console.error — tysta det i testet.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('renderar barnen normalt när inget fel sker', () => {
    render(<ErrorBoundary><Text>innehåll</Text></ErrorBoundary>);
    expect(screen.getByText('innehåll')).toBeInTheDocument();
  });

  it('visar fallback + rapporterar när ett barn kastar', () => {
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(screen.getByText('Något gick fel')).toBeInTheDocument();
    expect(reportClientError).toHaveBeenCalledTimes(1);
  });

  it('"Försök igen" återställer och visar barnen när felet är borta', () => {
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(screen.getByText('Något gick fel')).toBeInTheDocument();
    shouldThrow = false; // nästa render kastar inte
    fireEvent.click(screen.getByText('Försök igen'));
    expect(screen.getByText('återhämtad')).toBeInTheDocument();
  });
});
