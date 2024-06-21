import React from 'react';
import Pokemon from './Pokemon';

const PokemonTest = () => {
    const images = [
        'https://www.pokemon-card.com/assets/images/card_images/large/SV4a/044654_P_BUROROROMU.jpg',
        'https://www.pokemon-card.com/assets/images/card_images/large/SV3/043919_P_HASSAMU.jpg',
        'https://www.pokemon-card.com/assets/images/card_images/large/SV6a/045933_T_CHIKARANOSUNADOKEI.jpg',
    ];

    return (
        <div>
            <Pokemon
                images={images}
                damage={30}
                isPoisoned={true}
                isBurned={true}
                isAsleep={true}
                isParalyzed={true}
                isConfused={true}
                onClick={() => alert('Card clicked!')}
                onDoubleClick={() => alert('Card double-clicked!')}
            />
        </div>
    );
};

export default PokemonTest;
