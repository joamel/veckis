// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { RecurrencePicker, type RecurrencePickerProps } from './RecurrencePicker';

// Ionicons drar in native font-assets som inte kan renderas i jsdom.
vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

afterEach(cleanup);

function renderPicker(overrides: Partial<RecurrencePickerProps> = {}) {
  const handlers = {
    onChangeType: vi.fn(),
    onChangeWeeks: vi.fn(),
    onChangeDays: vi.fn(),
    onChangeMonthlyType: vi.fn(),
    onChangeWeekOfMonth: vi.fn(),
    onChangeEndDate: vi.fn(),
    onOpenEndPicker: vi.fn(),
  };
  const props: RecurrencePickerProps = {
    recurrenceType: 'none',
    recurrenceWeeks: 1,
    recurrenceDays: [],
    monthlyType: 'day_of_month',
    recurrenceWeekOfMonth: 1,
    endDate: null,
    ...handlers,
    ...overrides,
  };
  render(<RecurrencePicker {...props} />);
  return handlers;
}

describe('RecurrencePicker', () => {
  it('renderar alla upprepningstyper', () => {
    renderPicker();
    for (const label of ['Ingen', 'Dag', 'Vecka', 'Månad', 'År']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('döljer intervall + veckodagar när typen är "none"', () => {
    renderPicker({ recurrenceType: 'none' });
    expect(screen.queryByText('Veckodagar')).not.toBeInTheDocument();
    // "Var"-intervallraden visas bara för återkommande typer.
    expect(screen.queryByText('Var')).not.toBeInTheDocument();
  });

  it('anropar onChangeType när man väljer en typ', () => {
    const { onChangeType } = renderPicker();
    fireEvent.click(screen.getByText('Vecka'));
    expect(onChangeType).toHaveBeenCalledWith('weekly');
  });

  it('visar veckodagar för weekly och togglar dag vid klick', () => {
    const { onChangeDays } = renderPicker({ recurrenceType: 'weekly', recurrenceDays: [] });
    expect(screen.getByText('Veckodagar')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Mån'));
    expect(onChangeDays).toHaveBeenCalledWith(['mon']);
  });

  it('avmarkerar en redan vald dag', () => {
    const { onChangeDays } = renderPicker({ recurrenceType: 'weekly', recurrenceDays: ['mon', 'wed'] });
    fireEvent.click(screen.getByText('Mån'));
    expect(onChangeDays).toHaveBeenCalledWith(['wed']);
  });
});
