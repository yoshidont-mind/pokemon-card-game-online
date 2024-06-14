// src/components/Join.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const Join = () => {
    const [sessionId, setSessionId] = useState('');
    const navigate = useNavigate();

    const joinSession = () => {
        if (sessionId.trim()) {
            navigate(`/session?id=${sessionId}&playerId=2`);
        } else {
            alert('セッションIDを入力してください。');
        }
    };

    return (
        <div className="container mt-5">
            <input
                type="text"
                className="form-control me-3"
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                placeholder="セッションIDを入力"
            />
            <button className="btn btn-primary" onClick={joinSession}>参加</button>
        </div>
    );
};

export default Join;
