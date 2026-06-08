// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MultiMemberPicker, type MultiMemberPickerProps } from './MultiMemberPicker';

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

afterEach(cleanup);

const MEMBERS = [
  { id: 'a', displayName: 'Anna' },
  { id: 'b', displayName: 'Bo' },
  { id: 'c', displayName: 'Carl' },
];

function renderPicker(overrides: Partial<MultiMemberPickerProps> = {}) {
  const onChange = vi.fn();
  const onRotationChange = vi.fn();
  const props: MultiMemberPickerProps = {
    members: MEMBERS,
    selected: [],
    rotation: false,
    onChange,
    onRotationChange,
    ...overrides,
  };
  const result = render(<MultiMemberPicker {...props} />);
  return { onChange, onRotationChange, ...result };
}

describe('MultiMemberPicker', () => {
  it('renderar inget när hushållet saknar medlemmar', () => {
    const { container } = renderPicker({ members: [] });
    expect(container).toBeEmptyDOMElement();
  });

  it('renderar "Ingen" + alla medlemmar', () => {
    renderPicker();
    expect(screen.getByText('Ingen')).toBeInTheDocument();
    expect(screen.getByText('Anna')).toBeInTheDocument();
    expect(screen.getByText('Bo')).toBeInTheDocument();
    expect(screen.getByText('Carl')).toBeInTheDocument();
  });

  it('lägger till en medlem i urvalet vid klick', () => {
    const { onChange } = renderPicker({ selected: [] });
    fireEvent.click(screen.getByText('Anna'));
    expect(onChange).toHaveBeenCalledWith(['a']);
  });

  it('avmarkerar en redan vald medlem vid klick', () => {
    const { onChange } = renderPicker({ selected: ['a', 'b'] });
    fireEvent.click(screen.getByText('Anna'));
    expect(onChange).toHaveBeenCalledWith(['b']);
  });

  it('"Ingen" rensar urvalet', () => {
    const { onChange } = renderPicker({ selected: ['a', 'b'] });
    fireEvent.click(screen.getByText('Ingen'));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('döljer rotation-raden när färre än 2 är valda', () => {
    renderPicker({ selected: ['a'] });
    expect(screen.queryByText('Turas om automatiskt')).not.toBeInTheDocument();
  });

  it('visar rotation-raden när 2+ är valda', () => {
    renderPicker({ selected: ['a', 'b'] });
    expect(screen.getByText('Turas om automatiskt')).toBeInTheDocument();
  });

  it('togglar rotation vid klick på rotation-raden', () => {
    const { onRotationChange } = renderPicker({ selected: ['a', 'b'], rotation: false });
    fireEvent.click(screen.getByText('Turas om automatiskt'));
    expect(onRotationChange).toHaveBeenCalledWith(true);
  });
});
