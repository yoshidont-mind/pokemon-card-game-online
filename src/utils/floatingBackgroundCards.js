import backgroundPokemonCardUrls from '../data/homeBackgroundPokemonCards.json';

const DEFAULT_BACKGROUND_CARD_COUNT = 120;

export function createFloatingCardSpecs(count = DEFAULT_BACKGROUND_CARD_COUNT) {
  const source = Array.isArray(backgroundPokemonCardUrls)
    ? backgroundPokemonCardUrls.filter((url) => typeof url === 'string' && url.trim() !== '')
    : [];
  if (source.length === 0) {
    return [];
  }

  const shuffled = [...source];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return Array.from({ length: Math.max(1, count) }, (_, index) => {
    const imageUrl = shuffled[index % shuffled.length];
    const directionDeg = Math.random() * 360;
    const directionRad = (directionDeg * Math.PI) / 180;
    const travelDistance = 26 + Math.random() * 70;
    const moveX = Math.cos(directionRad) * travelDistance;
    const moveY = Math.sin(directionRad) * travelDistance;
    const durationSec = 20 + Math.random() * 28;
    const delaySec = -Math.random() * durationSec;
    const tiltDeg = -24 + Math.random() * 48;
    const spinDeg = -22 + Math.random() * 44;
    const scale = 0.78 + Math.random() * 0.58;
    const opacity = 0.7 + Math.random() * 0.25;
    const startX = -22 + Math.random() * 144;
    const startY = -26 + Math.random() * 152;
    return {
      key: `floating-${index + 1}-${imageUrl}`,
      imageUrl,
      style: {
        '--floating-start-x': `${startX.toFixed(2)}vw`,
        '--floating-start-y': `${startY.toFixed(2)}vh`,
        '--floating-move-x': `${moveX.toFixed(2)}vw`,
        '--floating-move-y': `${moveY.toFixed(2)}vh`,
        '--floating-duration': `${durationSec.toFixed(2)}s`,
        '--floating-delay': `${delaySec.toFixed(2)}s`,
        '--floating-tilt': `${tiltDeg.toFixed(2)}deg`,
        '--floating-spin': `${spinDeg.toFixed(2)}deg`,
        '--floating-scale': scale.toFixed(3),
        '--floating-opacity': opacity.toFixed(3),
      },
    };
  });
}
