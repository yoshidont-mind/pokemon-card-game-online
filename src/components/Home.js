// src/components/Home.js
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc } from 'firebase/firestore';
import db from '../firebase';

const Home = () => {
    const navigate = useNavigate();

    const createSession = async () => {
        const newSession = {
            player1: {
                all: [],
                deck: [],
                hand: [],
                bench: [],
                activeSpot: [],
                stadium: "",
                discardPile: [],
                prizeCards: [],
                message: ""
            },
            player2: {
                all: [],
                deck: [],
                hand: [],
                bench: [],
                activeSpot: [],
                stadium: "",
                discardPile: [],
                prizeCards: [],
                message: ""
            }
        };

        const docRef = await addDoc(collection(db, 'sessions'), newSession);
        navigate(`/session?id=${docRef.id}&playerId=1`);
    };

    return (
        <div className="container mt-5">
            <button className="btn btn-primary me-3" onClick={createSession}>セッションを作成</button>
            <button className="btn btn-secondary" onClick={() => navigate('/join')}>セッションに参加</button>
        </div>
    );
};

export default Home;
