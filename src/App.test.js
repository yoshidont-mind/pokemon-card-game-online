import { render } from '@testing-library/react';
import App from './App';

jest.mock('./components/Session', () => () => <div>Session Mock</div>);
jest.mock('./components/Home', () => () => <div>Home Mock</div>);
jest.mock('./components/Join', () => () => <div>Join Mock</div>);
jest.mock('./components/PokemonTest', () => () => <div>PokemonTest Mock</div>);
jest.mock('./components/UpdateGameDataTest', () => () => <div>UpdateGameDataTest Mock</div>);
jest.mock('./components/PlayingFieldTest', () => () => <div>PlayingFieldTest Mock</div>);

test('renders without crashing', () => {
  render(<App />);
});
