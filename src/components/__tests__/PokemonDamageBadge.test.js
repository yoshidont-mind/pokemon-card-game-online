import React from 'react';
import { render, screen } from '@testing-library/react';
import Pokemon from '../Pokemon';

describe('Pokemon damage badge rendering', () => {
  test('shows red badge for positive damage', () => {
    render(
      <Pokemon
        images={['https://example.com/card.jpg']}
        damage={50}
      />
    );

    const badge = screen.getByText('50');
    expect(badge.className).toContain('bg-danger');
  });

  test('shows blue badge for negative damage', () => {
    render(
      <Pokemon
        images={['https://example.com/card.jpg']}
        damage={-30}
      />
    );

    const badge = screen.getByText('-30');
    expect(badge.className).toContain('bg-primary');
  });

  test('hides damage badge when damage is zero', () => {
    const { container } = render(
      <Pokemon
        images={['https://example.com/card.jpg']}
        damage={0}
      />
    );

    expect(container.querySelector('.damage-badge')).toBeNull();
  });
});
