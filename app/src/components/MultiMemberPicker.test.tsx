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

  it('rotationAllowed=false: rotation-raden visas utgråad med förklaring och går inte att toggla', () => {
    const { onRotationChange } = renderPicker({ selected: ['a', 'b'], rotationAllowed: false });
    expect(screen.getByText('Turas om automatiskt')).toBeInTheDocument();
    expect(screen.getByText(/Välj en upprepning först/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Turas om automatiskt'));
    expect(onRotationChange).not.toHaveBeenCalled();
  });

  it('visar inte turordning-sektion när rotation är av', () => {
    renderPicker({ selected: ['a', 'b'], rotation: false });
    expect(screen.queryByText('Turordning')).not.toBeInTheDocument();
  });

  it('visar turordning-sektion med numrerade namn när rotation är på', () => {
    renderPicker({ selected: ['a', 'b', 'c'], rotation: true });
    expect(screen.getByText('Turordning')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('flytta-upp byter plats på member med föregående', () => {
    const { onChange } = renderPicker({ selected: ['a', 'b', 'c'], rotation: true });
    const upBtns = screen.getAllByLabelText('Flytta upp');
    fireEvent.click(upBtns[1]); // Bo → flytta upp (index 1 → 0)
    expect(onChange).toHaveBeenCalledWith(['b', 'a', 'c']);
  });

  it('flytta-ned byter plats på member med nästa', () => {
    const { onChange } = renderPicker({ selected: ['a', 'b', 'c'], rotation: true });
    const downBtns = screen.getAllByLabelText('Flytta ned');
    fireEvent.click(downBtns[0]); // Anna → flytta ned (index 0 → 1)
    expect(onChange).toHaveBeenCalledWith(['b', 'a', 'c']);
  });
});
