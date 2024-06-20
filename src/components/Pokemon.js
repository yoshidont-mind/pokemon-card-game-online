import React from 'react';
import PropTypes from 'prop-types';
import 'bootstrap/dist/css/bootstrap.min.css';
import { Badge } from "react-bootstrap";
import '../css/Pokemon.css'; // Ensure this line is present to import the CSS file

const Pokemon = ({
                           images,
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
                {images.map((image, index) => (
                    <img
                        key={index}
                        src={image}
                        alt={`Pokemon Card ${index}`}
                        className="pokemon-image"
                        style={{ zIndex: images.length - index, transform: `translate(${index * 5}px, ${index * 5}px)` }}
                    />
                ))}
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