import React from 'react';
import PropTypes from 'prop-types';
import 'bootstrap/dist/css/bootstrap.min.css'; // index.jsで一括bootstrap読み込みしているので不要なはずだが、この行をコメントアウトするとピルの大きさやmarginが変わる
import { Badge } from "react-bootstrap";
import '../css/pokemon.css'; // Ensure this line is present to import the CSS file

const STACK_CARD_OFFSET_PX = 10;

const Pokemon = ({
                           images = [],
                           damage = 0,
                           isPoisoned = false,
                           isBurned = false,
                           isAsleep = false,
                           isParalyzed = false,
                           isConfused = false,
                           onClick = () => {},
                           onDoubleClick = () => {}
                       }) => {
    const statusConditions = [
        { condition: isPoisoned, label: 'どく', color: 'bg-purple' },
        { condition: isBurned, label: 'やけど', color: 'bg-danger' },
        { condition: isAsleep, label: 'ねむり', color: 'bg-info' },
        { condition: isParalyzed, label: 'まひ', color: 'bg-warning' },
        { condition: isConfused, label: 'こんらん', color: 'bg-secondary' },
    ];

    return (
        <div className="pokemon-card" onClick={onClick} onDoubleClick={onDoubleClick}>
            <div className="card-images">
                {images.map((image, index) => {
                    const stackSpread = (images.length - 1) * STACK_CARD_OFFSET_PX;
                    const horizontalOffset = index * STACK_CARD_OFFSET_PX - stackSpread / 2;
                    const verticalOffset = (images.length - 1 - index) * STACK_CARD_OFFSET_PX;
                    return (
                        <img
                            key={index}
                            src={image}
                            alt={`Pokemon Card ${index}`}
                            className="pokemon-image"
                            style={{
                              zIndex: index + 1,
                              '--pokemon-image-shift-x': `${horizontalOffset}px`,
                              '--pokemon-image-shift-y': `${verticalOffset}px`,
                            }}
                        />
                    );
                })}
            </div>
            {damage > 0 && (
                <div className="damage-badge">
                    <Badge pill bg="danger">{damage}</Badge>
                </div>
            )}
            <div className="status-badges">
                {statusConditions.map((status, index) =>
                        status.condition && (
                            <Badge key={index} pill className={`${status.color} status-badge`} style={{ opacity: 0.7 }}>
                                {status.label}
                            </Badge>
                        )
                )}
            </div>
        </div>
    );
};

Pokemon.propTypes = {
    images: PropTypes.arrayOf(PropTypes.string).isRequired,
    damage: PropTypes.number,
    isPoisoned: PropTypes.bool,
    isBurned: PropTypes.bool,
    isAsleep: PropTypes.bool,
    isParalyzed: PropTypes.bool,
    isConfused: PropTypes.bool,
    onClick: PropTypes.func,
    onDoubleClick: PropTypes.func,
};

export default Pokemon;
